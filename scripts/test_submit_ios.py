import io
import unittest
from contextlib import redirect_stdout
from unittest import mock

import submit_ios
from store_common import StoreError

V = "3.2.9"
HEADER = f"app-v{V} @ "


def version(id_, string, state):
    return {"id": id_, "attributes": {"versionString": string, "appStoreState": state}}


def build(id_, number, state="VALID", notes=None, expired=False, enc=False):
    return {
        "id": id_,
        "attributes": {
            "version": number,
            "processingState": state,
            "expired": expired,
            "usesNonExemptEncryption": enc,
        },
        "notes": notes if notes is not None else f"{HEADER}abc123",
    }


def builds_response(builds):
    """Render parsed-style builds as a /v1/builds response with includes."""
    data, included = [], []
    for b in builds:
        rel = {"data": []}
        if b["notes"] is not None:
            loc_id = "loc-" + b["id"]
            rel["data"].append({"type": "betaBuildLocalizations", "id": loc_id})
            included.append(
                {
                    "type": "betaBuildLocalizations",
                    "id": loc_id,
                    "attributes": {"locale": "en-US", "whatsNew": b["notes"]},
                }
            )
        data.append(
            {
                "type": "builds",
                "id": b["id"],
                "attributes": b["attributes"],
                "relationships": {"betaBuildLocalizations": rel},
            }
        )
    return {"data": data, "included": included}


class FakeClient:
    """Records calls; responses are keyed by (method, path) and may be lists."""

    def __init__(self, responses):
        self.responses = dict(responses)
        self.calls = []
        self.budgets = []

    def budget(self, seconds):
        self.budgets.append(seconds)

    def request(self, method, path, params=None, body=None):
        self.calls.append((method, path, params, body))
        resp = self.responses.get((method, path), {"data": []})
        if isinstance(resp, list):
            resp = resp.pop(0) if len(resp) > 1 else resp[0]
        if isinstance(resp, Exception):
            raise resp
        return resp

    def writes(self):
        return [c for c in self.calls if c[0] != "GET"]

    def paths(self):
        return [(c[0], c[1]) for c in self.calls]


def make_client(versions, builds, extra=None):
    responses = {
        ("GET", "/v1/apps"): {"data": [{"id": "APP"}]},
        ("GET", "/v1/apps/APP/appStoreVersions"): {"data": versions},
        ("GET", "/v1/builds"): builds_response(builds),
    }
    responses.update(extra or {})
    return FakeClient(responses)


def run(client, mode="submit", dry_run=False):
    out = io.StringIO()
    with redirect_stdout(out):
        submit_ios.run(client, V, "- Fixed a thing", mode=mode, dry_run=dry_run)
    return out.getvalue()


class ClassifyTest(unittest.TestCase):
    def test_editable_states_reuse(self):
        for state in submit_ios.EDITABLE:
            with self.subTest(state=state):
                self.assertEqual(
                    submit_ios.classify([version("1", V, state)], V), ("reuse", "1")
                )

    def test_in_review_states_skip(self):
        for state in submit_ios.IN_REVIEW:
            with self.subTest(state=state):
                self.assertEqual(
                    submit_ios.classify([version("1", V, state)], V),
                    ("skip", f"iOS {V} is already in App Store review ({state}); skipping."),
                )

    def test_approved_states_skip(self):
        for state in submit_ios.APPROVED:
            with self.subTest(state=state):
                self.assertEqual(
                    submit_ios.classify([version("1", V, state)], V),
                    (
                        "skip",
                        f"iOS {V} is already approved on the App Store ({state}); skipping.",
                    ),
                )

    def test_unexpected_state_fails(self):
        self.assertEqual(
            submit_ios.classify([version("1", V, "SOMETHING_NEW")], V),
            (
                "fail",
                f"App Store version {V} is in unexpected state SOMETHING_NEW; "
                "handle it in App Store Connect.",
            ),
        )

    def test_other_open_version_fails_naming_it(self):
        expected = (
            "fail",
            "App Store version 3.2.8 is still open (WAITING_FOR_REVIEW). Submit, "
            "withdraw, or delete it in App Store Connect, then re-run with "
            "platforms=ios.",
        )
        versions = [version("1", "3.2.8", "WAITING_FOR_REVIEW")]
        self.assertEqual(submit_ios.classify(versions, V), expected)
        self.assertEqual(
            submit_ios.classify(versions + [version("2", V, "PREPARE_FOR_SUBMISSION")], V),
            expected,
        )

    def test_other_version_in_unexpected_state_fails(self):
        versions = [version("1", "3.2.8", "SOMETHING_NEW")]
        self.assertEqual(
            submit_ios.classify(versions, V),
            (
                "fail",
                "App Store version 3.2.8 is in unexpected state SOMETHING_NEW; "
                "handle it in App Store Connect.",
            ),
        )

    def test_half_submitted_version_is_reused(self):
        # Added to a review submission, but the submit itself never landed.
        self.assertEqual(
            submit_ios.classify([version("1", V, "READY_FOR_REVIEW")], V),
            ("reuse", "1"),
        )

    def test_missing_state_fails_rather_than_crashing(self):
        versions = [{"id": "1", "attributes": {"versionString": V}}]
        self.assertEqual(submit_ios.classify(versions, V)[0], "fail")

    def test_create_when_none_and_newer(self):
        versions = [version("1", "3.2.8", "READY_FOR_SALE")]
        self.assertEqual(submit_ios.classify(versions, V), ("create", None))
        self.assertEqual(submit_ios.classify([], V), ("create", None))

    def test_not_newer_fails_and_compares_numerically(self):
        versions = [version("1", "3.10.0", "READY_FOR_SALE")]
        self.assertEqual(
            submit_ios.classify(versions, V),
            ("fail", f"{V} is not newer than the live App Store version 3.10.0."),
        )

    def test_not_newer_applies_to_equal_live(self):
        # An existing live 3.2.9 is a skip, not a not-newer failure.
        self.assertEqual(
            submit_ios.classify([version("1", V, "READY_FOR_SALE")], V)[0], "skip"
        )


class SelectBuildTest(unittest.TestCase):
    def select(self, builds):
        return submit_ios.select_build(builds, V)

    def test_header_match_beats_newer_main_build(self):
        builds = [
            build("new", "300", notes="main @ ffff"),
            build("rel", "200"),
        ]
        self.assertEqual(self.select(builds)["id"], "rel")

    def test_newest_failed_with_older_valid_fails(self):
        builds = [build("new", "300", state="FAILED"), build("old", "200")]
        with self.assertRaises(StoreError) as ctx:
            self.select(builds)
        self.assertEqual(
            str(ctx.exception), f"Build 300 for {V} is FAILED in App Store Connect."
        )

    def test_expired_fails(self):
        with self.assertRaises(StoreError) as ctx:
            self.select([build("a", "300", expired=True)])
        self.assertEqual(
            str(ctx.exception),
            f"Build 300 for {V} has expired in App Store Connect. Cut a new release.",
        )

    def test_null_encryption_fails(self):
        with self.assertRaises(StoreError) as ctx:
            self.select([build("a", "300", enc=None)])
        self.assertEqual(
            str(ctx.exception),
            "Build 300 has no export-compliance answer. Set it in App Store "
            "Connect, then re-run with platforms=ios.",
        )

    def test_no_header_match(self):
        with self.assertRaises(StoreError) as ctx:
            self.select([build("a", "300", notes="main @ x")])
        self.assertEqual(
            str(ctx.exception),
            f"No App Store Connect release build for {V}. If the release's "
            "testflight-notes job failed, re-run it, then re-run with platforms=ios.",
        )


class ParseBuildsTest(unittest.TestCase):
    def test_reads_en_us_notes_and_ignores_other_locales(self):
        resp = builds_response([build("a", "1")])
        resp["included"].append(
            {
                "type": "betaBuildLocalizations",
                "id": "other",
                "attributes": {"locale": "fr-FR", "whatsNew": "autre"},
            }
        )
        resp["data"][0]["relationships"]["betaBuildLocalizations"]["data"].append(
            {"type": "betaBuildLocalizations", "id": "other"}
        )
        self.assertEqual(
            submit_ios.parse_builds(resp)[0]["notes"], f"{HEADER}abc123"
        )


class PollingTest(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(submit_ios, "time")
        self.time = patcher.start()
        self.addCleanup(patcher.stop)
        self.clock = [0.0]
        self.time.monotonic.side_effect = lambda: self.clock[0]

        def sleep(seconds):
            self.clock[0] += seconds

        self.time.sleep.side_effect = sleep

    def test_processing_then_valid(self):
        processing = build("a", "300", state="PROCESSING", notes=None)
        valid = build("a", "300")
        client = make_client(
            [],
            [],
            {
                ("GET", "/v1/builds"): [
                    builds_response([processing]),
                    builds_response([processing]),
                    builds_response([valid]),
                ]
            },
        )
        client.responses[("POST", "/v1/appStoreVersions")] = {"data": {"id": "VER"}}
        client.responses[("POST", "/v1/reviewSubmissions")] = {"data": {"id": "SUB"}}
        out = run(client)
        self.assertEqual(self.time.sleep.call_count, 2)
        self.assertIn(f"iOS {V}: submitted build 300 for review", out)

    def test_processing_header_match_waits_then_resolves(self):
        processing = build("a", "300", state="PROCESSING")
        client = make_client(
            [],
            [],
            {
                ("GET", "/v1/builds"): [
                    builds_response([processing]),
                    builds_response([build("a", "300")]),
                ]
            },
        )
        run(client, mode="check", dry_run=True)
        self.assertEqual(self.time.sleep.call_count, 1)

    def test_no_builds_visible_waits(self):
        client = make_client(
            [],
            [],
            {
                ("GET", "/v1/builds"): [
                    builds_response([]),
                    builds_response([build("a", "300")]),
                ]
            },
        )
        run(client, mode="check")
        self.assertEqual(self.time.sleep.call_count, 1)

    def test_times_out_after_twenty_minutes(self):
        processing = build("a", "300", state="PROCESSING", notes=None)
        client = make_client([], [processing])
        with self.assertRaises(StoreError) as ctx:
            run(client, mode="check")
        self.assertEqual(
            str(ctx.exception),
            f"Build for {V} is still processing after 20 minutes. "
            "Re-run with platforms=ios later.",
        )
        self.assertEqual(self.clock[0], 1200)

    def test_valid_without_header_fails_immediately(self):
        client = make_client([], [build("a", "300", notes="main @ x")])
        with self.assertRaises(StoreError) as ctx:
            run(client, mode="check")
        self.assertIn(f"No App Store Connect release build for {V}", str(ctx.exception))
        self.time.sleep.assert_not_called()


class RunTest(unittest.TestCase):
    def test_skip_makes_no_build_or_write_calls(self):
        client = make_client([version("1", V, "IN_REVIEW")], [build("a", "300")])
        out = run(client)
        self.assertIn(f"iOS {V} is already in App Store review (IN_REVIEW); skipping.", out)
        self.assertEqual(client.paths(), [("GET", "/v1/apps"), ("GET", "/v1/apps/APP/appStoreVersions")])

    def test_unexpected_state_raises(self):
        client = make_client([version("1", V, "WEIRD")], [build("a", "300")])
        with self.assertRaises(StoreError):
            run(client)

    def test_check_mode_makes_no_writes(self):
        for dry_run in (False, True):
            with self.subTest(dry_run=dry_run):
                client = make_client(
                    [version("1", V, "PREPARE_FOR_SUBMISSION")], [build("a", "300")]
                )
                run(client, mode="check", dry_run=dry_run)
                self.assertEqual(client.writes(), [])

    def test_dry_run_logs_would_lines(self):
        client = make_client([], [build("a", "29815116")])
        out = run(client, mode="check", dry_run=True)
        lines = out.splitlines()
        self.assertEqual(len(lines), 5)
        self.assertTrue(all(line.startswith("[dry run] would ") for line in lines))
        self.assertIn(
            f"[dry run] would submit build 29815116 for {V} for App Store review", lines
        )
        self.assertIn("AFTER_APPROVAL", out)
        self.assertIn("What's New", out)

    def test_submit_creates_version_full_sequence(self):
        client = make_client(
            [version("9", "3.2.8", "READY_FOR_SALE")],
            [build("B1", "300")],
            {
                ("POST", "/v1/appStoreVersions"): {"data": {"id": "VER"}},
                ("GET", "/v1/appStoreVersions/VER/appStoreVersionLocalizations"): {"data": []},
                ("POST", "/v1/reviewSubmissions"): {"data": {"id": "SUB"}},
            },
        )
        out = run(client)
        self.assertEqual(
            [p for p in client.paths() if p[0] != "GET" or "/v1/apps" not in p[1]][1:],
            [
                ("POST", "/v1/appStoreVersions"),
                ("PATCH", "/v1/appStoreVersions/VER/relationships/build"),
                ("GET", "/v1/appStoreVersions/VER/appStoreVersionLocalizations"),
                ("POST", "/v1/appStoreVersionLocalizations"),
                ("GET", "/v1/reviewSubmissions"),
                ("POST", "/v1/reviewSubmissions"),
                ("POST", "/v1/reviewSubmissionItems"),
                ("PATCH", "/v1/reviewSubmissions/SUB"),
            ],
        )
        create = next(c for c in client.calls if c[:2] == ("POST", "/v1/appStoreVersions"))
        attrs = create[3]["data"]["attributes"]
        self.assertEqual(
            attrs, {"platform": "IOS", "versionString": V, "releaseType": "AFTER_APPROVAL"}
        )
        attach = next(c for c in client.calls if c[1].endswith("/relationships/build"))
        self.assertEqual(attach[3], {"data": {"type": "builds", "id": "B1"}})
        loc = next(c for c in client.calls if c[:2] == ("POST", "/v1/appStoreVersionLocalizations"))
        self.assertEqual(
            loc[3]["data"]["attributes"], {"locale": "en-US", "whatsNew": "- Fixed a thing"}
        )
        submit = client.calls[-1]
        self.assertEqual(submit[3]["data"]["attributes"], {"submitted": True})
        self.assertEqual(client.budgets, [submit_ios.WRITE_GRACE])
        self.assertTrue(out.endswith(f"iOS {V}: submitted build 300 for review\n"))

    def test_submit_reuses_version_and_open_submission(self):
        client = make_client(
            [version("VER", V, "REJECTED")],
            [build("B1", "300")],
            {
                ("GET", "/v1/appStoreVersions/VER/appStoreVersionLocalizations"): {
                    "data": [{"id": "LOC", "attributes": {"locale": "en-US"}}]
                },
                ("GET", "/v1/reviewSubmissions"): {"data": [{"id": "SUB"}]},
            },
        )
        run(client)
        writes = [(c[0], c[1]) for c in client.writes()]
        self.assertEqual(
            writes,
            [
                ("PATCH", "/v1/appStoreVersions/VER"),
                ("PATCH", "/v1/appStoreVersions/VER/relationships/build"),
                ("PATCH", "/v1/appStoreVersionLocalizations/LOC"),
                ("POST", "/v1/reviewSubmissionItems"),
                ("PATCH", "/v1/reviewSubmissions/SUB"),
            ],
        )
        self.assertEqual(
            client.writes()[0][3]["data"]["attributes"],
            {"releaseType": "AFTER_APPROVAL", "earliestReleaseDate": None},
        )

    def test_409_on_item_is_tolerated(self):
        conflict = RuntimeError(
            'POST /v1/reviewSubmissionItems failed with HTTP 409: '
            '{"errors":[{"detail":"already exists"}]}'
        )
        client = make_client(
            [version("VER", V, "PREPARE_FOR_SUBMISSION")],
            [build("B1", "300")],
            {
                ("GET", "/v1/reviewSubmissions"): {"data": [{"id": "SUB"}]},
                ("POST", "/v1/reviewSubmissionItems"): conflict,
            },
        )
        out = run(client)
        self.assertEqual(client.calls[-1][:2], ("PATCH", "/v1/reviewSubmissions/SUB"))
        self.assertIn("submitted build 300 for review", out)

    def test_other_item_error_is_a_write_failure(self):
        client = make_client(
            [version("VER", V, "PREPARE_FOR_SUBMISSION")],
            [build("B1", "300")],
            {
                ("GET", "/v1/reviewSubmissions"): {"data": [{"id": "SUB"}]},
                ("POST", "/v1/reviewSubmissionItems"): RuntimeError(
                    'POST x failed with HTTP 400: {"errors":[{"detail":"nope"}]}'
                ),
            },
        )
        with self.assertRaises(StoreError):
            run(client)

    def test_write_failure_message(self):
        client = make_client(
            [version("VER", V, "PREPARE_FOR_SUBMISSION")],
            [build("B1", "300")],
            {
                ("PATCH", "/v1/appStoreVersions/VER/relationships/build"): RuntimeError(
                    "PATCH /v1/appStoreVersions/VER/relationships/build failed with "
                    'HTTP 409: {"errors":[{"detail":"Missing required metadata."}]}'
                ),
            },
        )
        with self.assertRaises(StoreError) as ctx:
            run(client)
        self.assertEqual(
            str(ctx.exception),
            "Missing required metadata. iOS submission for 3.2.9 failed; fix it in "
            "App Store Connect, then re-run with platforms=ios.",
        )


if __name__ == "__main__":
    unittest.main()
