"""Shared App Store Connect API plumbing: ES256 token minting and a REST client
with token refresh and retries. Used by testflight-notes.py and the store
submission scripts.
"""
import base64
import http.client
import json
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.appstoreconnect.apple.com"

# Apple rejects a token whose exp is more than 20 minutes past its iat. That is
# shorter than the time a build can spend processing, so tokens are re-minted
# mid-run rather than issued once up front.
TOKEN_LIFETIME = 15 * 60
TOKEN_REFRESH = 12 * 60


def log(msg):
    print(msg, flush=True)


class Transient(Exception):
    """A failure worth retrying: rate limiting, a 5xx, or a dropped connection."""


class Unauthorized(Transient):
    """A 401. Retryable exactly once, to cover a token that expired in flight."""


# --- JWT ------------------------------------------------------------------


def b64url(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=")


def mint_token(key_id, issuer_id, key_path):
    """ES256 JWT for the App Store Connect API.

    Signed with `cryptography` rather than PyJWT — the latter is frequently
    absent on CI runners while the former is not, and it's enough on its own.
    """
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.asymmetric.utils import (
            decode_dss_signature,
        )
        from cryptography.hazmat.primitives.serialization import (
            load_pem_private_key,
        )
    except ImportError:
        sys.exit(
            "error: the 'cryptography' package is required "
            "(python3 -m pip install cryptography)"
        )

    key = load_pem_private_key(Path(key_path).read_bytes(), password=None)

    now = int(time.time())
    header = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    payload = {
        "iss": issuer_id,
        "iat": now,
        "exp": now + TOKEN_LIFETIME,
        "aud": "appstoreconnect-v1",
    }

    signing_input = (
        b64url(json.dumps(header, separators=(",", ":")).encode())
        + b"."
        + b64url(json.dumps(payload, separators=(",", ":")).encode())
    )

    # `cryptography` emits a DER-encoded signature; JOSE wants raw r||s as two
    # fixed-width 32-byte big-endian integers.
    der = key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    signature = r.to_bytes(32, "big") + s.to_bytes(32, "big")

    return (signing_input + b"." + b64url(signature)).decode()


# --- Client ---------------------------------------------------------------


class Client:
    """App Store Connect client with a self-renewing token and retries.

    A run routinely outlives a single token: waiting for a build to appear and
    finish processing can take longer than the 20 minutes Apple allows on a
    token's exp, so the token is minted lazily and refreshed as it ages.
    """

    def __init__(self, key_id, issuer_id, key_path, timeout, interval=30):
        self.key_id = key_id
        self.issuer_id = issuer_id
        self.key_path = key_path
        self.interval = interval
        self._token = None
        self._minted_at = 0.0
        self.budget(timeout)

    def budget(self, seconds):
        """Give the calls that follow their own window to retry within.

        Polling and the write/verify calls get separate budgets: polling can
        legitimately consume its whole deadline waiting on Apple, which would
        otherwise leave the writes with no retries at all.
        """
        self.deadline = time.monotonic() + seconds

    def token(self):
        age = time.monotonic() - self._minted_at
        if self._token is None or age > TOKEN_REFRESH:
            self._token = mint_token(self.key_id, self.issuer_id, self.key_path)
            self._minted_at = time.monotonic()
        return self._token

    def _send(self, method, path, params, body):
        url = API + path
        if params:
            url += "?" + urllib.parse.urlencode(params)

        data = json.dumps(body).encode() if body is not None else None
        headers = {"Authorization": "Bearer " + self.token()}
        if data:
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as err:
            detail = err.read().decode(errors="replace")
            if err.code == 401:
                # Usually an expired token; drop it so the retry re-mints.
                self._token = None
                raise Unauthorized(f"HTTP 401 on {method} {path}") from None
            if err.code == 429 or err.code >= 500:
                raise Transient(f"HTTP {err.code} on {method} {path}") from None
            raise RuntimeError(
                f"{method} {path} failed with HTTP {err.code}: {detail}"
            ) from None
        except (urllib.error.URLError, socket.timeout, http.client.HTTPException) as err:
            raise Transient(f"{type(err).__name__} on {method} {path}: {err}") from None

    def request(self, method, path, params=None, body=None):
        reauthed = False
        while True:
            try:
                return self._send(method, path, params, body)
            except Unauthorized as err:
                # One immediate retry covers a token that expired in flight. A
                # second 401 means the credentials themselves are wrong, and
                # retrying those to the deadline just burns 20 minutes of runner
                # time before saying so.
                if reauthed:
                    raise RuntimeError(
                        f"{err}; check APP_STORE_CONNECT_KEY_ID, "
                        "APP_STORE_CONNECT_ISSUER_ID, and the .p8 key"
                    ) from None
                reauthed = True
                log(f"  {err}; re-minting the token and retrying")
            except Transient as err:
                if time.monotonic() >= self.deadline:
                    raise RuntimeError(f"{err} (giving up at deadline)") from None
                log(f"  {err}; retrying in {self.interval}s")
                time.sleep(self.interval)


# --- App Store Connect ----------------------------------------------------


def resolve_app_id(client, bundle_id):
    data = client.request("GET", "/v1/apps", {"filter[bundleId]": bundle_id})["data"]
    if not data:
        raise RuntimeError(f"no app found for bundle id {bundle_id}")
    return data[0]["id"]
