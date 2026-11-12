import io
import json
import unittest
import unittest.mock as mock
import urllib.error
from contextlib import redirect_stdout
from types import SimpleNamespace

from promote_android import PlayClient, pick_version_code, production_status, run
from store_common import StoreError, api_error

V = "3.2.9"
EMAIL = "play-ci@my-proj.iam.gserviceaccount.com"


class FakeClient:
    """Records calls; replies from `responses` keyed by (method, path suffix)."""

    def __init__(self, production=None, internal=None, fail=None):
        self.calls = []
        self.production = production or {"releases": []}
        self.internal = internal or {"releases": []}
        self.fail = fail or {}

    def request(self, method, path, params=None, body=None):
        self.calls.append((method, path, body))
        for (m, suffix), exc in self.fail.items():
            if m == method and path.endswith(suffix):
                raise exc
        if (method, path) == ("POST", "/edits"):
            return {"id": "e1"}
        if path.endswith("/tracks/production") and method == "GET":
            return self.production
        if path.endswith("/tracks/internal"):
            return self.internal
        return {}

    def ops(self):
        return [(m, p) for m, p, _ in self.calls]


def gh_ok(text):
    return lambda cmd, **kw: SimpleNamespace(returncode=0, stdout=text, stderr="")


def gh_fail(stderr):
    return lambda cmd, **kw: SimpleNamespace(returncode=1, stdout="", stderr=stderr)


def go(client, gh=None, mode="submit", dry_run=False):
    out = io.StringIO()
    with redirect_stdout(out):
        try:
            run(client, V, "- Fixed", mode, dry_run, gh=gh or gh_ok("42\n"))
        finally:
            go.out = out.getvalue()


def has(client, method, suffix):
    return any(m == method and p.endswith(suffix) for m, p in client.ops())


class PickVersionCodeTest(unittest.TestCase):
    def test_asset_wins(self):
        self.assertEqual(pick_version_code(" 42\n", None, V), 42)

    def test_non_numeric_asset(self):
        with self.assertRaises(StoreError):
            pick_version_code("oops", None, V)

    def test_internal_name_highest(self):
        track = {
            "releases": [
                {"name": V, "versionCodes": ["40", "41"]},
                {"name": f"Build ({V})", "versionCodes": ["43"]},
                {"name": "3.2.8", "versionCodes": ["99"]},
                {"versionCodes": ["100"]},
            ]
        }
        self.assertEqual(pick_version_code(None, track, V), 43)

    def test_none_found(self):
        with self.assertRaises(StoreError) as ctx:
            pick_version_code(None, {"releases": []}, V)
        self.assertEqual(
            str(ctx.exception),
            "No Android versionCode recorded for 3.2.9. Check the release "
            "workflow's build-android job uploaded it.",
        )


class ProductionStatusTest(unittest.TestCase):
    def track(self, status, codes):
        return {"releases": [{"status": status, "versionCodes": codes}]}

    def test_live(self):
        self.assertEqual(
            production_status(self.track("completed", ["41", "42"]), 42), ("live", 42)
        )

    def test_newer(self):
        self.assertEqual(
            production_status(self.track("completed", ["50"]), 42), ("newer", 50)
        )

    def test_older_or_draft_is_clear(self):
        self.assertEqual(production_status(self.track("completed", ["40"]), 42), (None, None))
        self.assertEqual(production_status(self.track("draft", ["50"]), 42), (None, None))
        self.assertEqual(production_status({}, 42), (None, None))


class RunTest(unittest.TestCase):
    def test_submit_commits_after_validate_and_keeps_edit(self):
        c = FakeClient()
        go(c)
        ops = c.ops()
        put = ops.index(("PUT", "/edits/e1/tracks/production"))
        validate = ops.index(("POST", "/edits/e1:validate"))
        commit = ops.index(("POST", "/edits/e1:commit"))
        self.assertLess(put, validate)
        self.assertLess(validate, commit)
        self.assertFalse(has(c, "DELETE", "/edits/e1"))
        self.assertFalse(has(c, "GET", "/tracks/internal"))
        self.assertEqual(
            c.calls[put][2],
            {
                "track": "production",
                "releases": [
                    {
                        "status": "completed",
                        "versionCodes": ["42"],
                        "releaseNotes": [{"language": "en-US", "text": "- Fixed"}],
                    }
                ],
            },
        )
        self.assertIn(
            "Android 3.2.9: promoted versionCode 42 to production (100%)", go.out
        )

    def test_fallback_reads_internal_track(self):
        c = FakeClient(
            internal={"releases": [{"name": V, "versionCodes": ["7", "9"]}]}
        )
        go(c, gh=gh_fail("release asset: no assets match the file pattern"))
        self.assertTrue(has(c, "GET", "/tracks/internal"))
        put = next(b for m, p, b in c.calls if m == "PUT")
        self.assertEqual(put["releases"][0]["versionCodes"], ["9"])

    def test_gh_missing_release_falls_back(self):
        c = FakeClient(internal={"releases": [{"name": V, "versionCodes": ["7"]}]})
        go(c, gh=gh_fail("release not found"))
        self.assertTrue(has(c, "POST", ":commit"))

    def test_gh_other_error_raises_before_any_edit(self):
        c = FakeClient()
        with self.assertRaises(StoreError):
            go(c, gh=gh_fail("HTTP 401: Bad credentials"))
        self.assertEqual(c.calls, [])

    def test_invisible_release_hints_at_draft(self):
        c = FakeClient()
        with self.assertRaises(StoreError) as ctx:
            go(c, gh=gh_fail("release not found"))
        self.assertTrue(str(ctx.exception).startswith("No Android versionCode recorded"))
        self.assertIn("if it is still a draft, publish it", str(ctx.exception))

    def test_nothing_found(self):
        c = FakeClient()
        with self.assertRaises(StoreError) as ctx:
            go(c, gh=gh_fail("no assets match"))
        self.assertEqual(
            str(ctx.exception),
            "No Android versionCode recorded for 3.2.9. Check the release "
            "workflow's build-android job uploaded it.",
        )
        self.assertTrue(has(c, "DELETE", "/edits/e1"))
        self.assertFalse(has(c, "POST", ":commit"))

    def test_already_live_skips(self):
        c = FakeClient(
            production={"releases": [{"status": "completed", "versionCodes": ["42"]}]}
        )
        go(c)
        self.assertIn(
            "Android 3.2.9 (versionCode 42) is already live on production; skipping.",
            go.out,
        )
        self.assertFalse(has(c, "PUT", "/tracks/production"))
        self.assertFalse(has(c, "POST", ":commit"))
        self.assertTrue(has(c, "DELETE", "/edits/e1"))

    def test_newer_live_fails(self):
        c = FakeClient(
            production={"releases": [{"status": "completed", "versionCodes": ["50"]}]}
        )
        with self.assertRaises(StoreError) as ctx:
            go(c)
        self.assertEqual(
            str(ctx.exception),
            "Google Play production already has a newer release "
            "(versionCode 50) than 3.2.9 (42).",
        )
        self.assertFalse(has(c, "PUT", "/tracks/production"))

    def test_check_never_writes(self):
        c = FakeClient()
        go(c, mode="check")
        self.assertFalse(has(c, "PUT", "/tracks/production"))
        self.assertFalse(has(c, "POST", ":validate"))
        self.assertFalse(has(c, "POST", ":commit"))
        self.assertTrue(has(c, "DELETE", "/edits/e1"))

    def test_dry_run_validates_but_never_commits(self):
        c = FakeClient()
        go(c, mode="check", dry_run=True)
        self.assertTrue(has(c, "PUT", "/tracks/production"))
        self.assertTrue(has(c, "POST", ":validate"))
        self.assertFalse(has(c, "POST", ":commit"))
        self.assertTrue(has(c, "DELETE", "/edits/e1"))
        self.assertIn("[dry run] would promote versionCode 42 to production at 100%", go.out)

    def test_delete_runs_on_failure_and_error_is_wrapped(self):
        boom = RuntimeError(
            "POST /edits/e1:validate failed with HTTP 403: "
            + json.dumps({"error": {"message": f"{EMAIL} cannot release"}})
        )
        c = FakeClient(fail={("POST", ":validate"): boom})
        with self.assertRaises(StoreError) as ctx:
            go(c)
        msg = str(ctx.exception)
        # Redaction happens at the log sink (store_common.log), not here.
        self.assertTrue(msg.startswith(f"{EMAIL} cannot release"))
        self.assertTrue(
            msg.endswith(
                "Android promotion for 3.2.9 failed; re-run with platforms=android."
            )
        )
        self.assertTrue(has(c, "DELETE", "/edits/e1"))
        self.assertFalse(has(c, "POST", ":commit"))

    def test_delete_failure_is_logged_not_raised(self):
        c = FakeClient(
            production={"releases": [{"status": "completed", "versionCodes": ["42"]}]},
            fail={("DELETE", "/edits/e1"): RuntimeError("DELETE x failed with HTTP 500: no")},
        )
        go(c)
        self.assertIn("could not delete edit e1", go.out)

    def test_failed_commit_still_deletes(self):
        c = FakeClient(fail={("POST", ":commit"): RuntimeError("POST x failed with HTTP 400: bad")})
        with self.assertRaises(StoreError):
            go(c)
        self.assertTrue(has(c, "DELETE", "/edits/e1"))


class PlayClientTest(unittest.TestCase):
    def client(self):
        c = PlayClient({"client_email": EMAIL, "private_key": "k"})
        c._token, c._minted_at = "tok", float("inf")
        return c

    def http_error(self, code, body=b"{}"):
        return urllib.error.HTTPError("u", code, "m", {}, io.BytesIO(body))

    def reply(self, payload):
        resp = mock.MagicMock()
        resp.__enter__.return_value.read.return_value = json.dumps(payload).encode()
        return resp

    def test_retries_with_backoff_then_succeeds(self):
        c = self.client()
        seq = [self.http_error(503), self.http_error(429), self.reply({"ok": 1})]
        with mock.patch("urllib.request.urlopen", side_effect=seq), mock.patch(
            "time.sleep"
        ) as sleep, redirect_stdout(io.StringIO()):
            self.assertEqual(c.request("GET", "/edits/e1"), {"ok": 1})
        self.assertEqual([a.args[0] for a in sleep.call_args_list], [5, 15])

    def test_gives_up_after_three_retries(self):
        c = self.client()
        with mock.patch(
            "urllib.request.urlopen", side_effect=lambda *a, **k: (_ for _ in ()).throw(self.http_error(500))
        ), mock.patch("time.sleep") as sleep, redirect_stdout(io.StringIO()):
            with self.assertRaises(RuntimeError):
                c.request("GET", "/edits/e1")
        self.assertEqual([a.args[0] for a in sleep.call_args_list], [5, 15, 45])

    def test_network_error_is_retried(self):
        c = self.client()
        seq = [urllib.error.URLError("down"), self.reply({})]
        with mock.patch("urllib.request.urlopen", side_effect=seq), mock.patch(
            "time.sleep"
        ) as sleep, redirect_stdout(io.StringIO()):
            c.request("GET", "/edits/e1")
        self.assertEqual(sleep.call_count, 1)

    def test_http_error_format_parses(self):
        c = self.client()
        body = json.dumps({"error": {"message": f"{EMAIL} has no access"}}).encode()
        with mock.patch(
            "urllib.request.urlopen", side_effect=self.http_error(403, body)
        ), mock.patch("time.sleep") as sleep:
            with self.assertRaises(RuntimeError) as ctx:
                c.request("POST", "/edits", body={})
        sleep.assert_not_called()
        self.assertTrue(
            str(ctx.exception).startswith("POST /edits failed with HTTP 403: ")
        )
        self.assertEqual(api_error(ctx.exception), (403, f"{EMAIL} has no access"))

    def test_from_env_requires_file(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(StoreError):
                PlayClient.from_env()
        with mock.patch.dict(
            "os.environ", {"GOOGLE_PLAY_SERVICE_ACCOUNT_FILE": "/nonexistent.json"}
        ):
            with self.assertRaises(StoreError):
                PlayClient.from_env()


if __name__ == "__main__":
    unittest.main()
