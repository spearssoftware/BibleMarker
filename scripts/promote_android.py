"""Promote a released version's Android bundle to Google Play production.

Library module driven by store_submit.py. Talks to the Google Play Developer
API through an edit: read the production track, write the new release,
validate, and commit (or delete the edit when nothing should change).
"""
import http.client
import json
import os
import re
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from asc import Transient, b64url
from store_common import StoreError, api_error, log, would

API = (
    "https://androidpublisher.googleapis.com/androidpublisher/v3"
    "/applications/app.biblemarker"
)
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"

# Google allows up to an hour on a token; refresh a little early.
TOKEN_LIFETIME = 3600
TOKEN_REFRESH = 50 * 60

# Sleeps between attempts: three retries after the first try.
RETRY_DELAYS = (5, 15, 45)

# --- Auth -------------------------------------------------------------------


def mint_assertion(info):
    """RS256 JWT asserting the service account, to exchange for an OAuth token."""
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.primitives.serialization import (
            load_pem_private_key,
        )
    except ImportError:
        raise StoreError(
            "The 'cryptography' package is required "
            "(python3 -m pip install cryptography)."
        ) from None

    key = load_pem_private_key(info["private_key"].encode(), password=None)

    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claims = {
        "iss": info["client_email"],
        "scope": SCOPE,
        "aud": TOKEN_URL,
        "iat": now,
        "exp": now + TOKEN_LIFETIME,
    }
    signing_input = (
        b64url(json.dumps(header, separators=(",", ":")).encode())
        + b"."
        + b64url(json.dumps(claims, separators=(",", ":")).encode())
    )
    signature = key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    return (signing_input + b"." + b64url(signature)).decode()


# --- Client -----------------------------------------------------------------


class PlayClient:
    """Google Play Developer API client with a lazy token and retries."""

    def __init__(self, info):
        self.info = info
        self._token = None
        self._minted_at = 0.0

    @classmethod
    def from_env(cls):
        path = os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_FILE")
        if not path:
            raise StoreError("GOOGLE_PLAY_SERVICE_ACCOUNT_FILE must be set")
        if not Path(path).is_file():
            raise StoreError(f"Play service-account file not found at {path}")
        try:
            info = json.loads(Path(path).read_text(encoding="utf-8"))
            info["client_email"], info["private_key"]
        except (ValueError, KeyError, TypeError):
            raise StoreError(
                f"{path} is not a service-account JSON key "
                "(missing client_email or private_key)."
            ) from None
        return cls(info)

    def token(self):
        age = time.monotonic() - self._minted_at
        if self._token is None or age > TOKEN_REFRESH:
            form = urllib.parse.urlencode(
                {
                    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "assertion": mint_assertion(self.info),
                }
            ).encode()
            reply = self._call(
                "POST",
                "token",
                TOKEN_URL,
                {"Content-Type": "application/x-www-form-urlencoded"},
                form,
            )
            self._token = reply["access_token"]
            self._minted_at = time.monotonic()
        return self._token

    def _send(self, method, label, url, headers, data):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as err:
            detail = err.read().decode(errors="replace")
            if err.code == 429 or err.code >= 500:
                raise Transient(f"HTTP {err.code} on {method} {label}") from None
            raise RuntimeError(
                f"{method} {label} failed with HTTP {err.code}: {detail}"
            ) from None
        except (urllib.error.URLError, socket.timeout, http.client.HTTPException) as err:
            raise Transient(f"{type(err).__name__} on {method} {label}") from None

    def _call(self, method, label, url, headers, data):
        for delay in RETRY_DELAYS:
            try:
                return self._send(method, label, url, headers, data)
            except Transient as err:
                log(f"  {err}; retrying in {delay}s")
                time.sleep(delay)
        try:
            return self._send(method, label, url, headers, data)
        except Transient as err:
            raise RuntimeError(
                f"{err} (giving up after {len(RETRY_DELAYS)} retries)"
            ) from None

    def request(self, method, path, params=None, body=None):
        url = API + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Authorization": "Bearer " + self.token()}
        if data:
            headers["Content-Type"] = "application/json"
        return self._call(method, path, url, headers, data)


# --- Decisions --------------------------------------------------------------


def pick_version_code(asset_text, internal_track, v, release_visible=True):
    """The release's versionCode: the recorded asset, else the internal track."""
    if asset_text is not None:
        text = asset_text.strip()
        if not re.fullmatch(r"\d+", text):
            raise StoreError(
                f"android-version-code.txt for {v} is not a number: '{text[:40]}'."
            )
        return int(text)

    codes = [
        int(code)
        for release in (internal_track or {}).get("releases", [])
        if release.get("name") == v or f"({v})" in (release.get("name") or "")
        for code in release.get("versionCodes", [])
    ]
    if not codes:
        message = (
            f"No Android versionCode recorded for {v}. Check the release "
            "workflow's build-android job uploaded it."
        )
        if not release_visible:
            # A contents:read token can't see draft releases, and the release
            # stays a draft if any desktop build in the release run failed.
            message += (
                f" The app-v{v} GitHub release is not visible; if it is still a "
                "draft, publish it and re-run."
            )
        raise StoreError(message)
    return max(codes)


def production_status(track, code):
    """Classify production against `code`.

    Returns ("live", code), ("newer", live_code), or (None, None).
    """
    completed = [
        [int(c) for c in release.get("versionCodes", [])]
        for release in track.get("releases", [])
        if release.get("status") == "completed"
    ]
    if any(code in codes for codes in completed):
        return "live", code
    live = max((c for codes in completed for c in codes), default=None)
    if live is not None and live > code:
        return "newer", live
    return None, None


def read_asset(v, gh):
    """(contents of android-version-code.txt or None, whether the release exists)."""
    result = gh(
        [
            "gh", "release", "download", f"app-v{v}",
            "--pattern", "android-version-code.txt", "--output", "-",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return result.stdout, True
    stderr = (result.stderr or "").lower()
    if "release not found" in stderr:
        return None, False
    if "no assets match" in stderr:
        return None, True
    raise StoreError(
        f"Could not read the Android versionCode for {v} from the release: "
        f"{(result.stderr or '').strip()}"
    )


# --- Flow -------------------------------------------------------------------


def run(client, v, notes, mode, dry_run, gh=subprocess.run):
    asset, release_visible = read_asset(v, gh)

    edit_id = None
    committed = False
    try:
        edit_id = client.request("POST", "/edits", body={})["id"]
        edit = f"/edits/{edit_id}"

        internal = None if asset is not None else client.request(
            "GET", f"{edit}/tracks/internal"
        )
        code = pick_version_code(asset, internal, v, release_visible)

        production = client.request("GET", f"{edit}/tracks/production")
        state, live = production_status(production, code)
        if state == "live":
            log(
                f"Android {v} (versionCode {code}) is already live on "
                "production; skipping."
            )
            return
        if state == "newer":
            raise StoreError(
                f"Google Play production already has a newer release "
                f"(versionCode {live}) than {v} ({code})."
            )

        if mode == "check" and not dry_run:
            log(f"Android {v}: versionCode {code} is ready to promote to production")
            return

        client.request(
            "PUT",
            f"{edit}/tracks/production",
            body={
                "track": "production",
                "releases": [
                    {
                        "status": "completed",
                        "versionCodes": [str(code)],
                        "releaseNotes": [{"language": "en-US", "text": notes}],
                    }
                ],
            },
        )
        client.request("POST", f"{edit}:validate")

        if mode == "check":
            would(f"promote versionCode {code} to production at 100% for {v}")
            would(f"set the en-US release notes for {v} ({len(notes)} characters)")
            return

        client.request("POST", f"{edit}:commit")
        committed = True
        log(f"Android {v}: promoted versionCode {code} to production (100%)")
    except StoreError:
        raise
    except RuntimeError as exc:
        _, detail = api_error(exc)
        raise StoreError(
            f"{detail} Android promotion for {v} failed; "
            "re-run with platforms=android."
        ) from None
    finally:
        if edit_id and not committed:
            try:
                client.request("DELETE", f"/edits/{edit_id}")
            except RuntimeError as exc:
                log(f"  could not delete edit {edit_id}: {api_error(exc)[1]}")
