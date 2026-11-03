"""Submit the release build of a version to App Store review.

Called by store_submit.py with an asc.Client. In check mode it makes only GET
calls; in submit mode it creates or reuses the App Store version, attaches the
build, sets "What's New" and automatic release, and submits for review.
"""
import re
import time

import asc
from store_common import StoreError, api_error, log, would

BUNDLE_ID = "app.biblemarker"

POLL_DEADLINE = 20 * 60
POLL_INTERVAL = 30

# Retry window for each poll and for the writes. Client's own deadline is set
# once, so without re-budgeting a long poll would leave later calls none.
WRITE_GRACE = 120

# Read from attributes.appStoreState; appVersionState uses different values.
# READY_FOR_REVIEW counts as editable: a version shows it once it is added to a
# review submission but before that submission is sent, so a run that failed
# between the two must be able to finish the job on retry.
EDITABLE = {
    "PREPARE_FOR_SUBMISSION",
    "READY_FOR_REVIEW",
    "DEVELOPER_REJECTED",
    "REJECTED",
    "METADATA_REJECTED",
    "INVALID_BINARY",
}
IN_REVIEW = {
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "WAITING_FOR_EXPORT_COMPLIANCE",
}
APPROVED = {
    "PENDING_DEVELOPER_RELEASE",
    "PENDING_APPLE_RELEASE",
    "PROCESSING_FOR_APP_STORE",
    "READY_FOR_SALE",
    "ACCEPTED",
    "REPLACED_WITH_NEW_VERSION",
    "REMOVED_FROM_SALE",
    "DEVELOPER_REMOVED_FROM_SALE",
}

RETRY_HINT = "re-run with platforms=ios."


def version_tuple(s):
    # Tolerates historical version strings with suffixes, e.g. "1.0b2".
    return tuple(int(p) for p in re.findall(r"\d+", s))


def classify(versions, v):
    """Decide what to do with the App Store versions on the IOS platform.

    Returns (action, value): ("reuse", version id), ("create", None),
    ("skip", message) or ("fail", message).
    """
    ours = next(
        (x for x in versions if x["attributes"]["versionString"] == v), None
    )

    if ours:
        state = ours["attributes"].get("appStoreState")
        if state in IN_REVIEW:
            return "skip", f"iOS {v} is already in App Store review ({state}); skipping."
        if state in APPROVED:
            return (
                "skip",
                f"iOS {v} is already approved on the App Store ({state}); skipping.",
            )
        if state not in EDITABLE:
            return (
                "fail",
                f"App Store version {v} is in unexpected state {state}; "
                "handle it in App Store Connect.",
            )

    # Apple allows one open version at a time, and we never rename it.
    for other in versions:
        attrs = other["attributes"]
        if attrs["versionString"] == v:
            continue
        state = attrs.get("appStoreState")
        if state in EDITABLE | IN_REVIEW:
            return (
                "fail",
                f"App Store version {attrs['versionString']} is still open "
                f"({state}). Submit, withdraw, or delete it in "
                f"App Store Connect, then {RETRY_HINT}",
            )
        if state not in APPROVED:
            return (
                "fail",
                f"App Store version {attrs['versionString']} is in unexpected "
                f"state {state}; handle it in App Store Connect.",
            )

    if ours:
        return "reuse", ours["id"]

    live = [
        x["attributes"]["versionString"]
        for x in versions
        if x["attributes"].get("appStoreState") == "READY_FOR_SALE"
    ]
    if live:
        highest = max(live, key=version_tuple)
        if version_tuple(v) <= version_tuple(highest):
            return (
                "fail",
                f"{v} is not newer than the live App Store version {highest}.",
            )
    return "create", None


def parse_builds(resp):
    """Flatten a /v1/builds response into dicts carrying the en-US notes."""
    included = {
        (item["type"], item["id"]): item for item in resp.get("included", [])
    }
    builds = []
    for build in resp.get("data", []):
        refs = (
            build.get("relationships", {})
            .get("betaBuildLocalizations", {})
            .get("data")
            or []
        )
        notes = ""
        for ref in refs:
            loc = included.get((ref["type"], ref["id"]))
            if loc and loc["attributes"].get("locale") == "en-US":
                notes = loc["attributes"].get("whatsNew") or ""
        builds.append({"id": build["id"], "attributes": build["attributes"], "notes": notes})
    return builds


def release_builds(builds, v):
    """Builds whose notes header marks them as the release tag's build, newest first."""
    return [b for b in builds if b["notes"].startswith(f"app-v{v} @ ")]


def select_build(builds, v):
    """The newest release build, which must be usable. No fallback to older ones."""
    matches = release_builds(builds, v)
    if not matches:
        raise StoreError(
            f"No App Store Connect release build for {v}. If the release's "
            "testflight-notes job failed, re-run it, then re-run with platforms=ios."
        )

    build = matches[0]
    attrs = build["attributes"]
    number = attrs["version"]
    state = attrs["processingState"]
    if state != "VALID":
        raise StoreError(f"Build {number} for {v} is {state} in App Store Connect.")
    if attrs.get("expired"):
        raise StoreError(
            f"Build {number} for {v} has expired in App Store Connect. "
            "Cut a new release."
        )
    if attrs.get("usesNonExemptEncryption") is None:
        raise StoreError(
            f"Build {number} has no export-compliance answer. Set it in App "
            "Store Connect, then re-run with platforms=ios."
        )
    return build


def fetch_builds(client, app_id, v):
    resp = client.request(
        "GET",
        "/v1/builds",
        {
            "filter[app]": app_id,
            "filter[preReleaseVersion.version]": v,
            "filter[preReleaseVersion.platform]": "IOS",
            "sort": "-uploadedDate",
            "limit": 50,
            "include": "betaBuildLocalizations",
        },
    )
    return parse_builds(resp)


def wait_for_release_build(client, app_id, v):
    """Poll until the release build is no longer in flight, then select it.

    A PROCESSING build has no notes header yet: the release's testflight-notes
    job writes it after processing finishes. So an unmatched build that is
    still processing may be the release build. A VALID build with no header and
    nothing processing means that job failed, and waiting won't fix it.
    """
    deadline = time.monotonic() + POLL_DEADLINE
    while True:
        client.budget(WRITE_GRACE)
        builds = fetch_builds(client, app_id, v)
        matches = release_builds(builds, v)
        processing = any(
            b["attributes"]["processingState"] == "PROCESSING" for b in builds
        )
        if matches:
            waiting = matches[0]["attributes"]["processingState"] == "PROCESSING"
        else:
            waiting = processing or not builds
        if not waiting:
            return select_build(builds, v)

        if time.monotonic() >= deadline:
            raise StoreError(
                f"Build for {v} is still processing after 20 minutes. "
                "Re-run with platforms=ios later."
            )
        log(f"  build for {v} not ready; waiting {POLL_INTERVAL}s")
        time.sleep(POLL_INTERVAL)


def relationship(type_, id_):
    return {"data": {"type": type_, "id": id_}}


def ensure_version(client, app_id, v, version_id):
    """Reuse version_id, or create the version when it is None."""
    if version_id:
        client.request(
            "PATCH",
            f"/v1/appStoreVersions/{version_id}",
            body={
                "data": {
                    "type": "appStoreVersions",
                    "id": version_id,
                    "attributes": {
                        "releaseType": "AFTER_APPROVAL",
                        "earliestReleaseDate": None,
                    },
                }
            },
        )
        return version_id

    resp = client.request(
        "POST",
        "/v1/appStoreVersions",
        body={
            "data": {
                "type": "appStoreVersions",
                "attributes": {
                    "platform": "IOS",
                    "versionString": v,
                    "releaseType": "AFTER_APPROVAL",
                },
                "relationships": {"app": relationship("apps", app_id)},
            }
        },
    )
    return resp["data"]["id"]


def set_whats_new(client, version_id, notes):
    locs = client.request(
        "GET", f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations"
    )["data"]
    existing = next((x for x in locs if x["attributes"].get("locale") == "en-US"), None)
    if existing:
        client.request(
            "PATCH",
            f"/v1/appStoreVersionLocalizations/{existing['id']}",
            body={
                "data": {
                    "type": "appStoreVersionLocalizations",
                    "id": existing["id"],
                    "attributes": {"whatsNew": notes},
                }
            },
        )
        return
    client.request(
        "POST",
        "/v1/appStoreVersionLocalizations",
        body={
            "data": {
                "type": "appStoreVersionLocalizations",
                "attributes": {"locale": "en-US", "whatsNew": notes},
                "relationships": {
                    "appStoreVersion": relationship("appStoreVersions", version_id)
                },
            }
        },
    )


def submit_for_review(client, app_id, version_id):
    open_subs = client.request(
        "GET",
        "/v1/reviewSubmissions",
        {
            "filter[app]": app_id,
            "filter[platform]": "IOS",
            "filter[state]": "READY_FOR_REVIEW,UNRESOLVED_ISSUES",
        },
    )["data"]
    if open_subs:
        submission_id = open_subs[0]["id"]
    else:
        submission_id = client.request(
            "POST",
            "/v1/reviewSubmissions",
            body={
                "data": {
                    "type": "reviewSubmissions",
                    "attributes": {"platform": "IOS"},
                    "relationships": {"app": relationship("apps", app_id)},
                }
            },
        )["data"]["id"]

    try:
        client.request(
            "POST",
            "/v1/reviewSubmissionItems",
            body={
                "data": {
                    "type": "reviewSubmissionItems",
                    "relationships": {
                        "reviewSubmission": relationship(
                            "reviewSubmissions", submission_id
                        ),
                        "appStoreVersion": relationship(
                            "appStoreVersions", version_id
                        ),
                    },
                }
            },
        )
    except RuntimeError as exc:
        # A reused submission may already hold this version.
        if api_error(exc)[0] != 409:
            raise

    client.request(
        "PATCH",
        f"/v1/reviewSubmissions/{submission_id}",
        body={
            "data": {
                "type": "reviewSubmissions",
                "id": submission_id,
                "attributes": {"submitted": True},
            }
        },
    )


def run(client, v, notes, mode, dry_run):
    app_id = asc.resolve_app_id(client, BUNDLE_ID)
    versions = client.request(
        "GET",
        f"/v1/apps/{app_id}/appStoreVersions",
        {"filter[platform]": "IOS", "limit": 200},
    )["data"]

    action, value = classify(versions, v)
    if action == "skip":
        log(value)
        return
    if action == "fail":
        raise StoreError(value)

    build = wait_for_release_build(client, app_id, v)
    number = build["attributes"]["version"]
    client.budget(WRITE_GRACE)

    if mode == "check":
        if dry_run:
            would(
                "create the App Store version for " + v
                if action == "create"
                else f"reuse the App Store version for {v}"
            )
            would(f"attach build {number} to {v}")
            would(f"set What's New for {v}")
            would(f"set release type to AFTER_APPROVAL for {v}")
            would(f"submit build {number} for {v} for App Store review")
        else:
            log(f"iOS {v}: checks passed for build {number}")
        return

    try:
        version_id = ensure_version(
            client, app_id, v, value if action == "reuse" else None
        )
        client.request(
            "PATCH",
            f"/v1/appStoreVersions/{version_id}/relationships/build",
            body={"data": {"type": "builds", "id": build["id"]}},
        )
        set_whats_new(client, version_id, notes)
        submit_for_review(client, app_id, version_id)
    except RuntimeError as exc:
        detail = api_error(exc)[1]
        raise StoreError(
            f"{detail} iOS submission for {v} failed; fix it in App Store "
            "Connect, then re-run with platforms=ios."
        ) from None

    log(f"iOS {v}: submitted build {number} for review")
