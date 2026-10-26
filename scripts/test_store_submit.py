import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace

import store_submit
from store_common import (
    StoreError,
    api_error,
    check_tag,
    load_notes,
    log,
    normalize_version,
    redact,
)


class NormalizeVersionTest(unittest.TestCase):
    def test_accepts_prefixes_and_whitespace(self):
        for raw in ("3.2.9", "v3.2.9", "app-v3.2.9", "  3.2.9\n"):
            self.assertEqual(normalize_version(raw), "3.2.9")

    def test_rejects_prerelease(self):
        with self.assertRaises(StoreError) as ctx:
            normalize_version("app-v3.3.0-beta.1")
        self.assertEqual(
            str(ctx.exception),
            "3.3.0-beta.1 is a prerelease; only final versions can go to the stores.",
        )

    def test_rejects_bad_format(self):
        for raw in ("3.2", "3.2.9.1", "", "latest"):
            with self.assertRaises(StoreError) as ctx:
                normalize_version(raw)
            self.assertEqual(
                str(ctx.exception), f"'{raw}' is not a version like 3.2.9."
            )


class LoadNotesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / ".github/release-notes").mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, text):
        (self.root / ".github/release-notes/v3.2.9.md").write_text(
            text, encoding="utf-8"
        )

    def test_missing(self):
        with self.assertRaises(StoreError) as ctx:
            load_notes("3.2.9", self.root)
        self.assertEqual(
            str(ctx.exception),
            "Missing .github/release-notes/v3.2.9.md. Add concise What's New "
            "bullets for 3.2.9 on main and re-run.",
        )

    def test_empty(self):
        self.write("  \n\n")
        with self.assertRaises(StoreError) as ctx:
            load_notes("3.2.9", self.root)
        self.assertEqual(
            str(ctx.exception), "Notes file .github/release-notes/v3.2.9.md is empty."
        )

    def test_trims(self):
        self.write("\n- Fixed a thing\n\n")
        self.assertEqual(load_notes("3.2.9", self.root), "- Fixed a thing")

    def test_limit_counts_code_points(self):
        self.write("é" * 500)
        self.assertEqual(len(load_notes("3.2.9", self.root)), 500)

    def test_over_limit(self):
        self.write("x" * 501)
        with self.assertRaises(StoreError) as ctx:
            load_notes("3.2.9", self.root)
        self.assertEqual(
            str(ctx.exception),
            "Notes for 3.2.9 are 501 characters; Google Play allows 500. "
            "Shorten .github/release-notes/v3.2.9.md.",
        )


class CheckTagTest(unittest.TestCase):
    def run_with(self, returncode, stderr=""):
        calls = []

        def fake_run(cmd, **kwargs):
            calls.append(cmd)
            return SimpleNamespace(returncode=returncode, stderr=stderr)

        check_tag("3.2.9", run=fake_run)
        return calls

    def test_present(self):
        calls = self.run_with(0)
        self.assertEqual(calls[0][-1], "refs/tags/app-v3.2.9")

    def test_missing(self):
        with self.assertRaises(StoreError) as ctx:
            self.run_with(2)
        self.assertEqual(
            str(ctx.exception),
            "No tag app-v3.2.9. Cut the release first (pnpm run release) or "
            "check the version.",
        )

    def test_git_failure_is_not_reported_as_missing(self):
        with self.assertRaises(StoreError) as ctx:
            self.run_with(128, "fatal: could not read from remote")
        self.assertIn("Could not check for tag app-v3.2.9", str(ctx.exception))


class RedactTest(unittest.TestCase):
    def test_strips_service_account_and_jwt(self):
        text = (
            "The caller play-ci@my-proj.iam.gserviceaccount.com lacks permission; "
            "token eyJhbGciOi.eyJpc3Mi.c2ln"
        )
        out = redact(text)
        self.assertNotIn("gserviceaccount", out)
        self.assertNotIn("eyJ", out)


class LogTest(unittest.TestCase):
    def test_log_redacts(self):
        out = io.StringIO()
        with redirect_stdout(out):
            log("denied for a@b.iam.gserviceaccount.com")
        self.assertEqual(out.getvalue(), "denied for [redacted]\n")


class ApiErrorTest(unittest.TestCase):
    def test_apple_detail(self):
        exc = RuntimeError(
            'POST /v1/x failed with HTTP 409: {"errors":[{"title":"Conflict",'
            '"detail":"Item already exists"}]}'
        )
        self.assertEqual(api_error(exc), (409, "Item already exists"))

    def test_google_message(self):
        exc = RuntimeError(
            'POST /edits failed with HTTP 403: {"error":{"code":403,'
            '"message":"x@y.iam.gserviceaccount.com has no access"}}'
        )
        self.assertEqual(
            api_error(exc), (403, "x@y.iam.gserviceaccount.com has no access")
        )

    def test_non_http(self):
        self.assertEqual(api_error(RuntimeError("deadline")), (None, "deadline"))


class MainTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        notes = self.root / ".github/release-notes"
        notes.mkdir(parents=True)
        (notes / "v3.2.9.md").write_text("- Fixed a thing\n", encoding="utf-8")
        self.calls = []

    def tearDown(self):
        self.tmp.cleanup()

    def runner(self, platform, error=None):
        def run(v, notes, mode, dry_run):
            self.calls.append((platform, v, notes, mode, dry_run))
            if error:
                raise error

        return run

    def main(self, argv, **runners):
        merged = {"ios": self.runner("ios"), "android": self.runner("android")}
        merged.update(runners)
        out = io.StringIO()
        with redirect_stdout(out):
            status = store_submit.main(
                argv, runners=merged, tag_check=lambda v: None, root=self.root
            )
        return status, out.getvalue()

    def test_both_runs_both(self):
        status, _ = self.main(["--version", "v3.2.9", "--mode", "check", "--dry-run"])
        self.assertEqual(status, 0)
        self.assertEqual(
            self.calls,
            [
                ("android", "3.2.9", "- Fixed a thing", "check", True),
                ("ios", "3.2.9", "- Fixed a thing", "check", True),
            ],
        )

    def test_android_only_never_touches_ios(self):
        def ios_must_not_run(*args):
            raise AssertionError("iOS runner called for platforms=android")

        status, _ = self.main(
            ["--version", "3.2.9", "--platforms", "android", "--mode", "submit"],
            ios=ios_must_not_run,
        )
        self.assertEqual(status, 0)
        self.assertEqual([c[0] for c in self.calls], ["android"])

    def test_ios_only_never_touches_android(self):
        def android_must_not_run(*args):
            raise AssertionError("Android runner called for platforms=ios")

        status, _ = self.main(
            ["--version", "3.2.9", "--platforms", "ios", "--mode", "submit"],
            android=android_must_not_run,
        )
        self.assertEqual(status, 0)
        self.assertEqual([c[0] for c in self.calls], ["ios"])

    def test_one_platform_failing_still_runs_the_other(self):
        status, out = self.main(
            ["--version", "3.2.9", "--mode", "submit"],
            ios=self.runner("ios", StoreError("boom")),
        )
        self.assertEqual(status, 1)
        self.assertEqual([c[0] for c in self.calls], ["android", "ios"])
        self.assertIn("iOS 3.2.9 failed; re-run with platforms=ios.", out)

    def test_unexpected_exception_still_runs_the_other_platform(self):
        status, out = self.main(
            ["--version", "3.2.9", "--mode", "submit"],
            ios=self.runner("ios", KeyError("appStoreState")),
        )
        self.assertEqual(status, 1)
        self.assertEqual([c[0] for c in self.calls], ["android", "ios"])
        self.assertIn("error: KeyError('appStoreState')", out)
        self.assertIn("iOS 3.2.9 failed; re-run with platforms=ios.", out)

    def test_check_failure_does_not_suggest_a_single_platform_retry(self):
        status, out = self.main(
            ["--version", "3.2.9", "--mode", "check"],
            android=self.runner("android", StoreError("boom")),
        )
        self.assertEqual(status, 1)
        self.assertIn("Android 3.2.9 check failed; nothing was changed.", out)
        self.assertNotIn("platforms=android", out)

    def test_shared_precondition_stops_before_any_platform(self):
        status, out = self.main(["--version", "3.2.8", "--mode", "submit"])
        self.assertEqual(status, 1)
        self.assertEqual(self.calls, [])
        self.assertIn("Missing .github/release-notes/v3.2.8.md", out)

    def test_failure_output_is_redacted(self):
        status, out = self.main(
            ["--version", "3.2.9", "--platforms", "android", "--mode", "submit"],
            android=self.runner(
                "android", RuntimeError("denied for a@b.iam.gserviceaccount.com")
            ),
        )
        self.assertEqual(status, 1)
        self.assertNotIn("gserviceaccount", out)


if __name__ == "__main__":
    unittest.main()
