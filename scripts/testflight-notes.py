#!/usr/bin/env python3
r"""Write TestFlight "What to Test" notes for an uploaded build.

CFBundleVersion is limited to period-separated integers, so the build number
can't carry a SHA or a branch name. The beta build localization notes are the
only place that provenance can live, which is what this script fills in after a
successful upload.

Usage (after an upload, targeting the build that was just archived):

    scripts/testflight-notes.py --bundle-id app.biblemarker \
        --build-number 29815116 --branch main --sha a1ff643

Retry entry point, when a notes write failed but the build is already in
TestFlight (--newest targets the most recently uploaded build):

    scripts/testflight-notes.py --bundle-id app.biblemarker --newest

Credentials come from the same env vars and key file the altool upload uses:
APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, and the private key at
~/.appstoreconnect/private_keys/AuthKey_<key id>.p8 (override with
APP_STORE_CONNECT_KEY_PATH).
"""
import argparse
import base64
import http.client
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.appstoreconnect.apple.com"

# App Store Connect caps beta build localization notes at 4000 characters.
NOTES_MAX = 4000

# Apple rejects a token whose exp is more than 20 minutes past its iat. That is
# shorter than the time a build can spend processing, so tokens are re-minted
# mid-run rather than issued once up front.
TOKEN_LIFETIME = 15 * 60
TOKEN_REFRESH = 12 * 60

# Grace period granted to the write/verify calls once polling is done, so a
# nearly-exhausted poll deadline doesn't leave them with no retries.
WRITE_GRACE = 120

# Terminal states for Build.processingState. Notes are rejected while a build is
# still PROCESSING, so we wait for one of these before writing.
DONE_STATES = {"VALID", "FAILED", "INVALID"}


def log(msg):
    print(msg, flush=True)


class Transient(Exception):
    """A failure worth retrying: rate limiting, a 5xx, or a dropped connection."""


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
                raise Transient(f"HTTP 401 on {method} {path}") from None
            if err.code == 429 or err.code >= 500:
                raise Transient(f"HTTP {err.code} on {method} {path}") from None
            raise RuntimeError(
                f"{method} {path} failed with HTTP {err.code}: {detail}"
            ) from None
        except (urllib.error.URLError, socket.timeout, http.client.HTTPException) as err:
            raise Transient(f"{type(err).__name__} on {method} {path}: {err}") from None

    def request(self, method, path, params=None, body=None):
        while True:
            try:
                return self._send(method, path, params, body)
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


def find_build(client, app_id, build_number):
    """Look a build up by CFBundleVersion, or newest-first when unspecified.

    Deliberately not filtered by filter[preReleaseVersion.version]: the build
    number is a per-minute timestamp and is already unique within the app, while
    a marketing-version filter would silently match nothing whenever this
    script's idea of the version drifts from the one Tauri baked into the
    archive — prerelease suffixes are stripped for iOS by scripts/sync-version.js,
    so package.json and CFBundleShortVersionString disagree on every beta.

    Apple only guarantees CFBundleVersion uniqueness within a marketing version,
    so ask for two and sort, to notice ambiguity rather than pick blind.
    """
    params = {"filter[app]": app_id, "sort": "-uploadedDate", "limit": "2"}
    if build_number:
        params["filter[version]"] = build_number

    data = client.request("GET", "/v1/builds", params)["data"]
    if build_number and len(data) > 1:
        log(
            f"  warning: {len(data)} builds match version {build_number}; "
            "using the most recently uploaded"
        )
    return data[0] if data else None


def wait_for_build(client, app_id, build_number):
    """Wait for the build to appear, then for it to finish processing.

    Both waits share client.deadline. A freshly uploaded build is not queryable
    for several minutes after the upload command exits, so "not found" is an
    expected transient state here, not an error.
    """
    target = build_number or "most recent"

    while True:
        build = find_build(client, app_id, build_number)
        if build:
            break
        if time.monotonic() >= client.deadline:
            raise RuntimeError(f"build {target} never appeared before the deadline")
        log(f"  build {target} not visible yet; waiting {client.interval}s")
        time.sleep(client.interval)

    while True:
        attrs = build["attributes"]
        state = attrs["processingState"]
        if state in DONE_STATES:
            break
        if time.monotonic() >= client.deadline:
            raise RuntimeError(
                f"build {attrs['version']} still {state} at the deadline"
            )
        log(f"  build {attrs['version']} is {state}; waiting {client.interval}s")
        time.sleep(client.interval)
        build = client.request("GET", f"/v1/builds/{build['id']}")["data"]

    state = build["attributes"]["processingState"]
    if state != "VALID":
        raise RuntimeError(f"build {build['attributes']['version']} is {state}")

    return build


def localizations(client, build_id):
    return client.request(
        "GET", f"/v1/builds/{build_id}/betaBuildLocalizations"
    )["data"]


def find_en_us(locs):
    return next((loc for loc in locs if loc["attributes"].get("locale") == "en-US"), None)


def write_notes(client, build_id, notes):
    """PATCH the existing en-US localization, or POST one if there isn't one."""
    existing = localizations(client, build_id)

    # The attribute is `whatsNew`, NOT `whatsToTest` — TestFlight's UI labels the
    # field "What to Test" and Apple's docs have used both names, but sending
    # `whatsToTest` fails with ENTITY_ERROR.ATTRIBUTE.UNKNOWN. The attribute keys
    # are logged here and in verify_notes so the live field name stays checkable
    # from the build log rather than from memory. A brand-new build has no
    # localizations at all, which is why verify_notes logs them too.
    for loc in existing:
        log(
            f"  existing localization {loc['attributes'].get('locale')}: "
            f"attributes {sorted(loc['attributes'])}"
        )

    en_us = find_en_us(existing)

    if en_us:
        client.request(
            "PATCH",
            f"/v1/betaBuildLocalizations/{en_us['id']}",
            body={
                "data": {
                    "type": "betaBuildLocalizations",
                    "id": en_us["id"],
                    "attributes": {"whatsNew": notes},
                }
            },
        )
        log(f"  patched existing en-US localization {en_us['id']}")
    else:
        client.request(
            "POST",
            "/v1/betaBuildLocalizations",
            body={
                "data": {
                    "type": "betaBuildLocalizations",
                    "attributes": {"locale": "en-US", "whatsNew": notes},
                    "relationships": {
                        "build": {"data": {"type": "builds", "id": build_id}}
                    },
                }
            },
        )
        log("  created en-US localization")


def normalize(text):
    return (text or "").replace("\r\n", "\n").strip()


def verify_notes(client, build_id, expected, attempts=3, wait=5):
    """Read the notes back — a 200 on the write is not proof they landed.

    Retried a few times: the relationship endpoint can briefly serve the
    pre-write representation, which would otherwise look like a failed write.
    """
    actual = ""
    for attempt in range(1, attempts + 1):
        en_us = find_en_us(localizations(client, build_id))
        if en_us:
            log(f"  en-US localization attributes: {sorted(en_us['attributes'])}")
            actual = en_us["attributes"].get("whatsNew")
            if normalize(actual) == normalize(expected):
                return
        if attempt < attempts:
            log(f"  notes not readable back yet (attempt {attempt}); waiting {wait}s")
            time.sleep(wait)

    raise RuntimeError(
        "notes read back did not match what was written:\n"
        f"--- expected ---\n{expected}\n--- actual ---\n{actual}"
    )


# --- Notes ----------------------------------------------------------------


def git(*args):
    try:
        return subprocess.run(
            ["git", *args], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""


def compose_notes(branch, build_number, count):
    """Build the notes body from the current checkout.

    Everything but the branch label falls out of the checkout, so the caller's
    only job is to check out the commit that was built — the notes are written
    many minutes later and must describe that tree, not whatever the branch
    points at by then. The branch label is the one fact a detached checkout
    can't recover, which is why it alone is passed in.
    """
    branch = branch or git("rev-parse", "--abbrev-ref", "HEAD") or "unknown"
    sha = git("rev-parse", "--short", "HEAD") or "unknown"

    header = f"{branch} @ {sha}"
    if build_number:
        header += f"  (build {build_number})"

    lines = [header]
    subjects = git("log", f"-{count}", "--no-merges", "--pretty=format:- %s")
    if subjects:
        lines += ["", "Recent commits:", subjects]

    return "\n".join(lines)


def truncate(notes):
    if len(notes) <= NOTES_MAX:
        return notes
    log(f"  notes are {len(notes)} chars; truncating to {NOTES_MAX}")
    return notes[: NOTES_MAX - 4].rstrip() + "\n..."


# --- Entry point ----------------------------------------------------------


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument("--build-number", help="CFBundleVersion to target.")
    parser.add_argument(
        "--newest",
        action="store_true",
        help="Target the most recently uploaded build instead of a specific "
        "build number. Only for the retry path.",
    )
    parser.add_argument(
        "--branch",
        help="Branch/tag label for the header. The SHA and commit list come "
        "from the checkout, so check out the commit that was built.",
    )
    parser.add_argument("--commit-count", type=int, default=10)
    parser.add_argument("--timeout", type=int, default=1200)
    parser.add_argument("--interval", type=int, default=30)
    args = parser.parse_args(argv)

    # An empty --build-number must not silently fall through to "newest": that
    # would stamp this run's provenance onto an unrelated build.
    if args.newest:
        if args.build_number:
            parser.error("--newest and --build-number are mutually exclusive")
    elif not args.build_number:
        parser.error("--build-number is required (or pass --newest)")

    return args


def main(argv=None):
    args = parse_args(argv)

    key_id = os.environ.get("APP_STORE_CONNECT_KEY_ID")
    issuer_id = os.environ.get("APP_STORE_CONNECT_ISSUER_ID")
    if not key_id or not issuer_id:
        sys.exit(
            "error: APP_STORE_CONNECT_KEY_ID and APP_STORE_CONNECT_ISSUER_ID "
            "must be set"
        )

    key_path = os.environ.get("APP_STORE_CONNECT_KEY_PATH") or os.path.expanduser(
        f"~/.appstoreconnect/private_keys/AuthKey_{key_id}.p8"
    )
    if not Path(key_path).is_file():
        sys.exit(f"error: private key not found at {key_path}")

    notes = truncate(
        compose_notes(args.branch, args.build_number, args.commit_count).strip()
    )
    if not notes:
        sys.exit("error: composed notes are empty; refusing to overwrite")

    log("Notes to write:")
    log("\n".join("  | " + line for line in notes.splitlines()))

    client = Client(
        key_id, issuer_id, key_path, timeout=args.timeout, interval=args.interval
    )

    app_id = resolve_app_id(client, args.bundle_id)
    log(f"Resolved {args.bundle_id} to app {app_id}")

    build = wait_for_build(client, app_id, args.build_number)
    attrs = build["attributes"]
    log(
        f"Build {attrs['version']} ({build['id']}) is VALID, "
        f"uploaded {attrs.get('uploadedDate')}"
    )

    client.budget(WRITE_GRACE)

    write_notes(client, build["id"], notes)
    verify_notes(client, build["id"], notes)
    log("Notes verified by reading them back from the API.")


if __name__ == "__main__":
    main()
