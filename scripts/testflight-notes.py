#!/usr/bin/env python3
"""Write TestFlight "What to Test" notes for an uploaded build.

CFBundleVersion is limited to period-separated integers, so the build number
can't carry a SHA or a branch name. The beta build localization notes are the
only place that provenance can live, which is what this script fills in after a
successful upload.

Usage (after an upload, targeting a specific build):
    scripts/testflight-notes.py --bundle-id app.biblemarker \
        --build-number 29815116 --notes-file "$RUNNER_TEMP/tf-notes.txt"

Retry entry point (no build number — targets the most recently uploaded build,
composing notes from the current checkout):
    scripts/testflight-notes.py --bundle-id app.biblemarker

Credentials come from the same env vars and key file the altool upload uses:
    APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, and the private key at
    ~/.appstoreconnect/private_keys/AuthKey_<key id>.p8 (override with
    APP_STORE_CONNECT_KEY_PATH).
"""
import argparse
import base64
import json
import os
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

# Terminal states for Build.processingState. Notes are rejected while a build is
# still PROCESSING, so we wait for one of these before writing.
DONE_STATES = {"VALID", "FAILED", "INVALID"}


def log(msg):
    print(msg, flush=True)


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
    # Apple rejects tokens with an exp more than 20 minutes out.
    payload = {
        "iss": issuer_id,
        "iat": now,
        "exp": now + 15 * 60,
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


# --- HTTP -----------------------------------------------------------------


def request(token, method, path, params=None, body=None):
    url = API + path
    if params:
        url += "?" + urllib.parse.urlencode(params)

    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": "Bearer " + token}
    if data:
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace")
        raise RuntimeError(
            f"{method} {path} failed with HTTP {err.code}: {detail}"
        ) from None


# --- App Store Connect ----------------------------------------------------


def resolve_app_id(token, bundle_id):
    data = request(token, "GET", "/v1/apps", {"filter[bundleId]": bundle_id})["data"]
    if not data:
        raise RuntimeError(f"no app found for bundle id {bundle_id}")
    return data[0]["id"]


def find_build(token, app_id, build_number):
    """Look a build up by CFBundleVersion, or newest-first when unspecified.

    Deliberately not filtered by filter[preReleaseVersion.version]: the build
    number is a per-minute timestamp and is already unique within the app, while
    a marketing-version filter would silently match nothing whenever this
    script's idea of the version drifts from the one Tauri baked into the
    archive — prerelease suffixes are stripped for iOS by scripts/sync-version.js,
    so package.json and CFBundleShortVersionString disagree on every beta.
    """
    params = {"filter[app]": app_id, "limit": "1"}
    if build_number:
        params["filter[version]"] = build_number
    else:
        params["sort"] = "-uploadedDate"

    data = request(token, "GET", "/v1/builds", params)["data"]
    return data[0] if data else None


def wait_for_build(token, app_id, build_number, timeout, interval):
    """Wait for the build to appear, then for it to finish processing.

    Both waits share one deadline. A freshly uploaded build is not queryable for
    several minutes after the upload command exits, so "not found" is an
    expected transient state here, not an error.
    """
    deadline = time.monotonic() + timeout
    target = build_number or "most recent"

    build = None
    while True:
        build = find_build(token, app_id, build_number)
        if build:
            break
        if time.monotonic() >= deadline:
            raise RuntimeError(
                f"build {target} never appeared within {timeout}s of polling"
            )
        log(f"  build {target} not visible yet; waiting {interval}s")
        time.sleep(interval)

    while True:
        state = build["attributes"]["processingState"]
        if state in DONE_STATES:
            break
        if time.monotonic() >= deadline:
            raise RuntimeError(
                f"build {build['attributes']['version']} still {state} "
                f"after {timeout}s"
            )
        log(f"  build {build['attributes']['version']} is {state}; waiting {interval}s")
        time.sleep(interval)
        build = request(token, "GET", f"/v1/builds/{build['id']}")["data"]

    state = build["attributes"]["processingState"]
    if state != "VALID":
        raise RuntimeError(f"build {build['attributes']['version']} is {state}")

    return build


def write_notes(token, build_id, notes):
    """PATCH the existing en-US localization, or POST one if there isn't one."""
    existing = request(
        token, "GET", f"/v1/builds/{build_id}/betaBuildLocalizations"
    )["data"]

    # The attribute is `whatsNew`, NOT `whatsToTest` — TestFlight's UI labels the
    # field "What to Test" and Apple's docs have used both names, but sending
    # `whatsToTest` fails with ENTITY_ERROR.ATTRIBUTE.UNKNOWN. Dumping the live
    # attribute keys here keeps that verifiable from the build log rather than
    # from memory.
    for loc in existing:
        log(
            f"  existing localization {loc['attributes'].get('locale')}: "
            f"attributes {sorted(loc['attributes'])}"
        )

    en_us = next(
        (loc for loc in existing if loc["attributes"].get("locale") == "en-US"), None
    )

    if en_us:
        request(
            token,
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
        request(
            token,
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


def verify_notes(token, build_id, expected):
    """Read the notes back — a 200 on the write is not proof they landed."""
    data = request(token, "GET", f"/v1/builds/{build_id}/betaBuildLocalizations")["data"]
    en_us = next(
        (loc for loc in data if loc["attributes"].get("locale") == "en-US"), None
    )
    if not en_us:
        raise RuntimeError("no en-US localization present after writing notes")

    actual = en_us["attributes"].get("whatsNew") or ""
    if actual.strip() != expected.strip():
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


def compose_notes(branch, sha, build_number, count):
    """Build the notes body from the current checkout.

    Only used on the retry path; the normal path passes --notes-file, captured at
    archive time so the notes describe the tree that was actually built.
    """
    branch = branch or git("rev-parse", "--abbrev-ref", "HEAD") or "unknown"
    sha = sha or git("rev-parse", "--short", "HEAD") or "unknown"

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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument(
        "--build-number",
        help="CFBundleVersion to target. Omit to target the most recently "
        "uploaded build (the retry path).",
    )
    parser.add_argument(
        "--notes-file",
        help="File holding the notes body, captured at archive time. Omit to "
        "compose from the current checkout.",
    )
    parser.add_argument("--branch", help="Branch/tag name, when composing notes.")
    parser.add_argument("--sha", help="Short SHA, when composing notes.")
    parser.add_argument("--commit-count", type=int, default=10)
    parser.add_argument("--timeout", type=int, default=1200)
    parser.add_argument("--interval", type=int, default=30)
    args = parser.parse_args()

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

    if args.notes_file:
        notes = Path(args.notes_file).read_text()
    else:
        notes = compose_notes(
            args.branch, args.sha, args.build_number, args.commit_count
        )
    notes = truncate(notes.strip())

    log("Notes to write:")
    log("\n".join("  | " + line for line in notes.splitlines()))

    token = mint_token(key_id, issuer_id, key_path)

    app_id = resolve_app_id(token, args.bundle_id)
    log(f"Resolved {args.bundle_id} to app {app_id}")

    build = wait_for_build(
        token, app_id, args.build_number, args.timeout, args.interval
    )
    log(f"Build {build['attributes']['version']} ({build['id']}) is VALID")

    write_notes(token, build["id"], notes)
    verify_notes(token, build["id"], notes)
    log("Notes verified by reading them back from the API.")


if __name__ == "__main__":
    main()
