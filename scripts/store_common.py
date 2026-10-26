"""Shared pieces of the store submission scripts: version and release-notes
checks, error formatting, and dry-run logging.
"""
import json
import re
import subprocess
from pathlib import Path

import asc

ROOT = Path(__file__).resolve().parent.parent

# Google Play caps release notes at 500 characters per locale; Apple allows
# 4000. One notes file feeds both stores, so the lower limit applies to both.
NOTES_LIMIT = 500

# Exit status of `git ls-remote --exit-code` when no ref matches.
LS_REMOTE_NO_MATCH = 2


class StoreError(RuntimeError):
    """A failure whose message is shown to the owner as-is."""


def normalize_version(raw):
    text = raw.strip()
    v = text.removeprefix("app-v").removeprefix("v")
    if re.match(r"^\d+\.\d+\.\d+-", v):
        raise StoreError(
            f"{v} is a prerelease; only final versions can go to the stores."
        )
    if not re.fullmatch(r"\d+\.\d+\.\d+", v):
        raise StoreError(f"'{text}' is not a version like 3.2.9.")
    return v


def load_notes(v, root=ROOT):
    rel = f".github/release-notes/v{v}.md"
    path = Path(root) / rel
    if not path.is_file():
        raise StoreError(
            f"Missing {rel}. Add concise What's New bullets for {v} on main "
            "and re-run."
        )
    notes = path.read_text(encoding="utf-8").strip()
    if not notes:
        raise StoreError(f"Notes file {rel} is empty.")
    if len(notes) > NOTES_LIMIT:
        raise StoreError(
            f"Notes for {v} are {len(notes)} characters; Google Play allows "
            f"{NOTES_LIMIT}. Shorten {rel}."
        )
    return notes


def check_tag(v, run=subprocess.run):
    # The workflow's checkout is shallow and carries no tags, so ask the remote.
    result = run(
        ["git", "ls-remote", "--exit-code", "--tags", "origin", f"refs/tags/app-v{v}"],
        capture_output=True,
        text=True,
    )
    if result.returncode == LS_REMOTE_NO_MATCH:
        raise StoreError(
            f"No tag app-v{v}. Cut the release first (pnpm run release) or "
            "check the version."
        )
    if result.returncode != 0:
        raise StoreError(
            f"Could not check for tag app-v{v}: {result.stderr.strip()}"
        )


_SECRET_PATTERNS = [
    re.compile(r"[\w.+-]+@[\w.-]+\.iam\.gserviceaccount\.com"),
    re.compile(r"eyJ[\w.-]+"),
]


def redact(text):
    """Strip service-account addresses and JWTs from text bound for the log.

    Actions masks secret values, but not the service account's address, which
    Play echoes back in permission errors.
    """
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub("[redacted]", text)
    return text


def log(msg):
    """asc.log with redaction, so no store-script message can leak a secret."""
    asc.log(redact(msg))


def would(action):
    log(f"[dry run] would {action}")


def api_error(exc):
    """Split a client error into (HTTP status, human-readable detail).

    Both asc.Client and the Play client raise RuntimeError("<method> <path>
    failed with HTTP <code>: <body>"). The detail is Apple's errors[].detail or
    Google's error.message when the body is JSON, else the raw body. The status
    is None for errors that carry none (deadlines, bad credentials).
    """
    match = re.search(r"failed with HTTP (\d+): (.*)", str(exc), re.DOTALL)
    if not match:
        return None, str(exc)

    code, body = int(match.group(1)), match.group(2)
    try:
        payload = json.loads(body)
    except ValueError:
        return code, body.strip()

    detail = None
    if isinstance(payload, dict):
        errors = payload.get("errors")
        if isinstance(errors, list) and errors:
            first = errors[0]
            detail = first.get("detail") or first.get("title")
        elif isinstance(payload.get("error"), dict):
            detail = payload["error"].get("message")
    return code, detail or body.strip()
