#!/usr/bin/env python3
"""Submit a released version to App Store review and Google Play production.

Run by .github/workflows/store-submit.yml, which owns the credentials. The
`preflight` job runs every check for every selected platform before any job
writes; the per-platform jobs then re-run the checks and write:

    scripts/store_submit.py --version 3.2.9 --platforms both --mode check
    scripts/store_submit.py --version 3.2.9 --platforms both --mode check --dry-run
    scripts/store_submit.py --version 3.2.9 --platforms ios --mode submit

Release notes come from .github/release-notes/v<version>.md.

iOS credentials: APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, and the
private key at ~/.appstoreconnect/private_keys/AuthKey_<key id>.p8 (override
with APP_STORE_CONNECT_KEY_PATH). Android credentials: the service-account JSON
at GOOGLE_PLAY_SERVICE_ACCOUNT_FILE.
"""
import argparse
import os
import sys
from pathlib import Path

from asc import log
from store_common import (
    StoreError,
    check_tag,
    load_notes,
    normalize_version,
    redact,
)

PLATFORMS = {"both": ("ios", "android"), "ios": ("ios",), "android": ("android",)}
LABELS = {"ios": "iOS", "android": "Android"}

# Retry window for App Store Connect calls. submit_ios polls build processing
# on its own deadline and re-budgets the client before writing.
ASC_TIMEOUT = 1200


def ios_client():
    from asc import Client

    key_id = os.environ.get("APP_STORE_CONNECT_KEY_ID")
    issuer_id = os.environ.get("APP_STORE_CONNECT_ISSUER_ID")
    if not key_id or not issuer_id:
        raise StoreError(
            "APP_STORE_CONNECT_KEY_ID and APP_STORE_CONNECT_ISSUER_ID must be set"
        )

    key_path = os.environ.get("APP_STORE_CONNECT_KEY_PATH") or os.path.expanduser(
        f"~/.appstoreconnect/private_keys/AuthKey_{key_id}.p8"
    )
    if not Path(key_path).is_file():
        raise StoreError(f"App Store Connect private key not found at {key_path}")

    return Client(key_id, issuer_id, key_path, timeout=ASC_TIMEOUT)


def run_ios(v, notes, mode, dry_run):
    import submit_ios

    submit_ios.run(ios_client(), v, notes, mode=mode, dry_run=dry_run)


def run_android(v, notes, mode, dry_run):
    import promote_android

    client = promote_android.PlayClient.from_env()
    promote_android.run(client, v, notes, mode=mode, dry_run=dry_run)


RUNNERS = {"ios": run_ios, "android": run_android}


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--version", required=True)
    parser.add_argument("--platforms", choices=PLATFORMS, default="both")
    parser.add_argument("--mode", choices=("check", "submit"), required=True)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="With --mode check, log every write a real run would make.",
    )
    return parser.parse_args(argv)


def main(argv=None, runners=RUNNERS, tag_check=check_tag, root=None):
    """Run the selected platforms; return the process exit status.

    Platforms are independent: one failing does not stop the other, and the
    last line for a failed platform names how to retry just that one.
    """
    args = parse_args(argv)

    try:
        v = normalize_version(args.version)
        tag_check(v)
        notes = load_notes(v, root) if root else load_notes(v)
    except StoreError as exc:
        log(f"error: {exc}")
        return 1

    failed = []
    for platform in PLATFORMS[args.platforms]:
        label = LABELS[platform]
        log(f"--- {label} {v} ({args.mode}{', dry run' if args.dry_run else ''})")
        try:
            runners[platform](v, notes, args.mode, args.dry_run)
        # Anything at all, so an unexpected response shape on one store still
        # lets the other run and never prints an unredacted traceback.
        except Exception as exc:
            message = str(exc) if isinstance(exc, RuntimeError) else repr(exc)
            log(f"error: {redact(message)}")
            if args.mode == "check":
                log(f"{label} {v} check failed; nothing was changed. Fix it and re-run.")
            else:
                log(f"{label} {v} failed; re-run with platforms={platform}.")
            failed.append(platform)

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
