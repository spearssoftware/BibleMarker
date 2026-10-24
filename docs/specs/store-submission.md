# Store submission on request

Status: Reviewed
Date: 2026-10-24
Summary: One on-demand command submits a released version to App Store review (auto-release on approval) and promotes it to 100% on Google Play production, using the version's release-notes file.

## Problem and goals

Every release already uploads an iOS build to TestFlight and an Android AAB to the Play `internal` track, as a draft. Getting either one into the public stores is manual console work:
- creating the App Store version
- attaching the build
- pasting "What's New"
- submitting for review
- promoting on Play

The owner wants to say "push 3.2.9 to production" and have all of that happen.

Goals:
- A `workflow_dispatch`-only GitHub Actions workflow that, for one version:
  - **iOS:** creates or reuses the App Store version, attaches the release build, sets "What's New", sets release type to automatic after approval, and submits for review.
  - **Android:** promotes the release AAB to `production` at 100% with the same notes.
- A dry-run mode that runs every check and makes no change visible in either store.
- Three entry points: `just store-push`, `just store-check`, and a `/push-to-production` slash command.
- Every unmet precondition fails with a message naming the version, the problem, and the next step.

Success: the owner runs one command and both stores end up in the target state described under Acceptance criteria, with no console clicks.

## Non-goals

Permanently out of scope:
- Triggering store submission from a tag, a merged release PR, or anything else automatic.
- Phased (iOS) or staged (Android) rollouts, or manual release after approval.
- Coupling to desktop promotion (`promote-release.yml`). Desktop auto-updates on its own cadence.
- Rolling back one platform after the other fails.
- Writing or editing "What's New" text. The owner writes the notes file. This feature only reads it.

Deferred to a later phase:
- Store metadata (description, keywords, promo text) and screenshot sync. The owner will supply the content.
- Locales other than `en-US`.

## Users and flows

The only user is the repo owner, or an agent acting on the owner's explicit request.

### Release notes content

`.github/release-notes/v<v>.md` is the store "What's New" text. Its content follows the existing CLAUDE.md "What's New" rules, tightened by the owner for this feature: **concise, and only what users need to know about what changed.** No internal fixes, no jargon.

A purely internal patch has nothing for users. It is not expected to go to the stores. If the owner does want to push one, they must first add a notes file with at least one user-facing line.

### Main path: push

1. The owner runs `just store-push 3.2.9` (or `/push-to-production 3.2.9`). Platforms default to `both`.
2. The recipe dispatches the workflow with `version=3.2.9`, `platforms=both`, `dry_run=false`, and prints the run's URL.
3. **Preflight job** (read-only). It checks everything for every selected platform before anything is written:
   - the shared preconditions
   - the iOS read checks
   - the Android read checks

   Any failure stops the run here. Neither store changes.
4. **iOS job** (needs preflight; runs when `platforms` is `both` or `ios`):
   1. Re-resolve the release build and the App Store version state.
   2. Create or reuse the 3.2.9 App Store version.
   3. Attach the build.
   4. Set the `en-US` "What's New".
   5. Set `releaseType: AFTER_APPROVAL`.
   6. Submit for review.
5. **Android job** (needs preflight; runs when `platforms` is `both` or `android`):
   1. Read the release `versionCode` (see Data and interfaces).
   2. Put a `production` release `status: completed` with that `versionCode` and `en-US` notes.
   3. Commit the edit.
6. Each platform job ends with one summary line: submitted, promoted, skipped, or failed. The iOS and Android jobs run independently, so one failing does not cancel the other.

### Secondary paths

- **Check (dry run):** `just store-check 3.2.9` dispatches with `dry_run=true`. Preflight runs in full and logs a "[dry run] would …" line for every write a real run would make. The platform jobs do not run.
- **Single platform:** `just store-push 3.2.9 ios` or `just store-push 3.2.9 android` checks and touches only that store. This is the retry path after one platform job fails.
- **Slash command:** `/push-to-production <version> [both|ios|android]` runs `just store-push` and reports the run URL. It does not watch the run.

### Before first use

`workflow_dispatch` workflows can only be dispatched once the workflow file is on the default branch. End-to-end checks against the real stores (AC 8–10) happen after merge to `main`. Before merge, verification is unit tests only.

## Data and interfaces

### Workflow: `.github/workflows/store-submit.yml` (new)

- Trigger: `workflow_dispatch` only.
- `permissions: contents: read`.
- `concurrency: { group: store-submit, cancel-in-progress: false }`. Two dispatches queue rather than open competing Play edits or double-submit.

Inputs:

| Input | Type | Required | Default | Description text |
|-------|------|----------|---------|------------------|
| `version` | string | yes | — | "Version to submit (e.g. 3.2.9 — leading v / app-v optional)" |
| `platforms` | choice: `both`, `ios`, `android` | no | `both` | "Which stores to submit to" |
| `dry_run` | boolean | no | `false` | "Check everything and change nothing" |

Jobs:
- `preflight`
- `ios` (needs `preflight`; `if: !inputs.dry_run && inputs.platforms != 'android'`)
- `android` (needs `preflight`; `if: !inputs.dry_run && inputs.platforms != 'ios'`)

All jobs run on `ubuntu-latest`, check out the dispatch ref (the default branch), and run `actions/setup-python@v7` with `pip install cryptography`. No Xcode, Rust, or build.

### Version input

- Strip surrounding whitespace, then a leading `app-v` or `v`.
- The result must match `^\d+\.\d+\.\d+$`.
- A suffix such as `-beta.1` gets the prerelease message. Anything else (`3.2`, `3.2.9.1`, empty) gets the format message. Both messages are under Edge cases.

### Tag check

Check that `refs/tags/app-v<v>` exists with `git ls-remote --tags origin` or `gh api`. The default checkout has no tags, so a local `git tag` lookup is not enough.

### Release notes input

- Read `.github/release-notes/v<v>.md` from the dispatch checkout (the default branch), not from the tag. This lets notes be added after the release was cut.
- Trim leading and trailing whitespace, then send the text verbatim, including the `- ` bullets, to both stores. No markdown conversion.
- Length is counted in Unicode code points (Python `len()` on the decoded UTF-8 string).
- The limit is 500, Google Play's limit. It applies even to `platforms=ios`, so one notes file is always valid for both stores.

### iOS: which build

The release build is identified by its TestFlight notes. `release.yml`'s `testflight-notes` job writes a header that starts with `app-v<v> @ ` (branch label = tag, from `github.ref_name`). A `testflight.yml` build of any branch has a different header, even when its marketing version is the same.

Selection:
1. Builds for the app with marketing version `<v>` (`filter[preReleaseVersion.version]`). This is safe here: prerelease versions are rejected up front, so the drift warned about in `testflight-notes.py` `find_build` can't occur.
2. Keep builds whose `en-US` beta build localization `whatsNew` starts with `app-v<v> @ `.
3. Of those, take the newest by `uploadedDate`.
   - It must be `processingState: VALID` and `expired: false`.
   - If it is `PROCESSING`, wait as described under Edge cases.
   - If it is `FAILED` / `INVALID` / expired, fail. Do not fall back to an older build.

Export compliance: a build whose `usesNonExemptEncryption` is null fails. It is never answered automatically.

### iOS: App Store version states

`appStoreVersionState` of the iOS App Store version for `<v>`, and of any other version on the iOS platform:

| Group | States | Behavior |
|-------|--------|----------|
| Editable | `PREPARE_FOR_SUBMISSION`, `DEVELOPER_REJECTED`, `REJECTED`, `METADATA_REJECTED`, `INVALID_BINARY` | Reuse the `<v>` version: attach the build, overwrite notes and release type, submit |
| In review | `WAITING_FOR_REVIEW`, `IN_REVIEW`, `WAITING_FOR_EXPORT_COMPLIANCE`, `READY_FOR_REVIEW` | Skip with notice |
| Approved / live | `PENDING_DEVELOPER_RELEASE`, `PENDING_APPLE_RELEASE`, `PROCESSING_FOR_APP_STORE`, `READY_FOR_SALE`, `ACCEPTED`, `REPLACED_WITH_NEW_VERSION`, `REMOVED_FROM_SALE`, `DEVELOPER_REMOVED_FROM_SALE` | Skip with notice |
| Unlisted state | anything not above | Fail, naming the state |

If a *different* version is in the Editable or In review group, fail. Apple allows only one open version. Never rename it.

Submission uses the `reviewSubmissions` API: create a submission for platform `IOS`, add a `reviewSubmissionItems` entry for the App Store version, then PATCH `submitted: true`. Do not use the deprecated `appStoreVersionSubmissions` endpoint.

If an open review submission already exists (for example `UNRESOLVED_ISSUES` after a rejection), reuse it rather than creating a second one.

If the `en-US` `appStoreVersionLocalization` does not exist on a newly created version, create it.

### Android: which versionCode

Play does not expose `versionName` on track releases or bundles, and every `internal` upload replaces the previous draft. So the release `versionCode` is recorded at build time:

- **Change to `release.yml` `build-android`:**
  - Write `$VERSION_CODE` to `android-version-code.txt` and attach it to the `app-v<v>` GitHub release, alongside `BibleMarker-android.aab`.
  - Also pass `releaseName: <version>` to the existing `r0adkll/upload-google-play@v1` step, so the internal draft is named by version.
- **Promotion reads, in order:**
  1. the `android-version-code.txt` asset on the `app-v<v>` GitHub release
  2. otherwise, for releases cut before this change, the `internal` track release whose `name` equals `<v>` or contains `(<v>)`, using the highest `versionCode` in it
  3. otherwise, fail

  The uploaded bundle stays promotable by `versionCode` even after its internal draft is replaced, so step 1 works for older versions too.
- **Production track write:** `tracks.update` on `production` with a `releases` array that contains only the new release (`status: completed`, `versionCodes: [<code>]`, `releaseNotes: [{language: en-US, text: <notes>}]`). This replaces any existing `draft` / `inProgress` / `halted` production release. Then `edits.validate`, then `edits.commit`.
- **Dry run:** opening an edit (`edits.insert`) and running `tracks.update` plus `edits.validate` inside it is allowed. This exercises the real payload and the service account's production permission. The edit is then deleted (`edits.delete`), never committed.

### Credentials

All exist as repo secrets. None are added.
- **ASC:** `APP_STORE_CONNECT_API_KEY` is base64. Decode it to `~/.appstoreconnect/private_keys/AuthKey_<key id>.p8`, exactly as `testflight-notes.yml` does. Pass `APP_STORE_CONNECT_KEY_ID` and `APP_STORE_CONNECT_ISSUER_ID` as env.
- **Play:** write `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` to a file under `$RUNNER_TEMP` with mode 600. Sign a service-account JWT (RS256) with `cryptography` and exchange it for an OAuth token.
- Never print the key, the JSON, a token, or the service account's `client_email`. Actions does not mask that address.

### Scripts (new unless noted)

Python 3, stdlib plus `cryptography`. Underscored names so tests can import them.

| File | Contents |
|------|----------|
| `scripts/asc.py` | Moved unchanged from `testflight-notes.py`: `log`, `Transient`, `Unauthorized`, `b64url`, `mint_token`, `Client`, `resolve_app_id`, and the `TOKEN_LIFETIME` / `TOKEN_REFRESH` constants. `cryptography` stays a lazy import inside `mint_token`. |
| `scripts/testflight-notes.py` (existing) | Imports the above from `asc.py`. Keeps `find_build`, `wait_for_build`, `DONE_STATES`, `WRITE_GRACE`, and the notes functions. Behavior unchanged. |
| `scripts/store_common.py` | Version normalization, notes loading and validation, tag check, dry-run logging. |
| `scripts/submit_ios.py` | `--version`, `--check` / `--submit`, `--dry-run`. Build selection, state decisions, submission. New code; does not reuse `find_build` / `wait_for_build`. |
| `scripts/promote_android.py` | `--version`, `--check` / `--submit`, `--dry-run`. versionCode lookup, Play auth, track write. |
| `scripts/test_store_submit.py` | Unit tests. |

Retries: ASC calls use `asc.Client` as is. Play calls retry 429, 5xx, and network errors three times with 5s / 15s / 45s backoff, then fail.

### `just` recipes (extended `justfile`)

- `store-push version platforms="both"`
  - Doc comment: "Submit a released version to the App Store and Google Play production (platforms: both, ios, android)."
- `store-check version`
  - Doc comment: "Dry run of store-push: check every precondition for both stores without changing anything."
- `test-scripts`
  - Doc comment: "Run the Python unit tests for the release scripts."
  - Runs `python3 -m unittest discover -s scripts -p 'test_*.py'`.
  - Added to `check`.

`store-push` and `store-check` run `gh workflow run store-submit.yml -f version=… -f platforms=… -f dry_run=…`, then print the URL of the run that was created. If `gh workflow run` itself does not print it, find the run with `gh run list --workflow store-submit.yml --event workflow_dispatch --user @me --limit 1 --json url,createdAt`. Only print a run created after the dispatch.

### Slash command: `.claude/commands/push-to-production.md` (new)

- Takes `<version> [platforms]`, runs `just store-push`, and reports the run URL.
- `.gitignore` gains `!.claude/commands/` next to the existing `!.claude/agents/`, so the command is committed.

### CI

`ci.yml` job `test-and-build` gains a step running `python3 -m unittest discover -s scripts -p 'test_*.py'`. The `ci-node` image has `python3`.

The tests must not need `cryptography`. Keep it lazily imported and don't exercise signing in tests.

## Edge cases and failure modes

Every failure exits non-zero and prints the message shown, with `<v>` replaced by the normalized version. The wording below is the requirement. The implementer may add a detail line but must not drop the named items.

### Shared preconditions (preflight)

| Condition | Message |
|-----------|---------|
| Bad format | "'<input>' is not a version like 3.2.9." |
| Prerelease suffix | "<v> is a prerelease; only final versions can go to the stores." |
| `app-v<v>` tag missing | "No tag app-v<v>. Cut the release first (pnpm run release) or check the version." |
| Notes file missing | "Missing .github/release-notes/v<v>.md. Add concise What's New bullets for <v> on main and re-run." |
| Notes file empty after trim | "Notes file .github/release-notes/v<v>.md is empty." |
| Notes over 500 code points | "Notes for <v> are <n> characters; Google Play allows 500. Shorten .github/release-notes/v<v>.md." |

Notes are never truncated.

### iOS

| Condition | Behavior / message |
|-----------|-------------------|
| No build for <v> with an `app-v<v> @ ` notes header | Fail: "No App Store Connect release build for <v>. If the release's testflight-notes job failed, re-run it, then re-run with platforms=ios." |
| Release build not visible yet, or `PROCESSING` | Poll every 30s, up to 20 minutes total. Then fail: "Build for <v> is still processing after 20 minutes. Re-run with platforms=ios later." |
| Release build `FAILED` / `INVALID` | Fail: "Build <build number> for <v> is <state> in App Store Connect." |
| Release build expired | Fail: "Build <build number> for <v> has expired in App Store Connect. Cut a new release." |
| `usesNonExemptEncryption` is null | Fail: "Build <build number> has no export-compliance answer. Set it in App Store Connect, then re-run with platforms=ios." |
| <v> version In review | Skip, succeed: "iOS <v> is already in App Store review (<state>); skipping." |
| <v> version Approved / live | Skip, succeed: "iOS <v> is already approved on the App Store (<state>); skipping." |
| Different version Editable or In review | Fail: "App Store version <other> is still open (<state>). Submit, withdraw, or delete it in App Store Connect, then re-run with platforms=ios." |
| <v> lower than or equal to the live version, with no <v> version existing | Fail: "<v> is not newer than the live App Store version <live>." |
| Unlisted state | Fail: "App Store version <v> is in unexpected state <state>; handle it in App Store Connect." |
| Apple rejects creating or submitting the version (for example, required metadata missing) | Fail with Apple's error `detail` text, plus "iOS submission for <v> failed; fix it in App Store Connect, then re-run with platforms=ios." |

The 20-minute wait applies in preflight too: a dry run of a still-processing build waits the same way.

### Android

| Condition | Behavior / message |
|-----------|-------------------|
| No versionCode from the release asset or the internal track | Fail: "No Android versionCode recorded for <v>. Check the release workflow's build-android job uploaded it." Never fall back to the newest build. |
| `production` already has that versionCode at `completed` | Skip, succeed: "Android <v> (versionCode <code>) is already live on production; skipping." |
| `production` has a lower versionCode for a newer version live | Fail: "Google Play production already has a newer release (versionCode <live>) than <v> (<code>)." |
| Play validation or commit rejected (including managed publishing, `changesNotSentForReview` required, or no production access) | Fail with the API's error message, plus "Android promotion for <v> failed; re-run with platforms=android." The edit is deleted, not committed. |

### Partial failure

The iOS and Android jobs are independent. If one fails, the other's result stands. The run is red, and the failing job's last line says "re-run with platforms=<ios|android>".

### Dry run

- Preflight logs "[dry run] would <action>" for each write. Example: "[dry run] would submit build 29815116 for 3.2.9 for App Store review".
- App Store Connect receives no POST, PATCH, or DELETE.
- On Play, the only writes are inside an edit that is deleted, never committed. Nothing changes in Play Console.

## Constraints

- **Not automated.** `store-submit.yml` declares only `workflow_dispatch`.
- **Secrets stay in GitHub Actions.**
  - The `just` recipes and the slash command only call `gh`.
  - No local script reads store credentials.
  - No secret, token, key content, or `client_email` is printed.
- **Stdlib Python plus `cryptography`.** Same setup as `testflight-notes.yml`. No fastlane, no Google client libraries.
- **Release pipeline changes are limited to the following:**
  - `release.yml` `build-android` gets the versionCode asset and `releaseName`.
  - `testflight-notes.py` changes only its imports.
  - The triggers of `release.yml`, `testflight.yml`, `testflight-notes.yml`, and `promote-release.yml` are unchanged.
- **Locale:** `en-US` only on both stores.
- **Testing:**
  - Unit tests in `scripts/test_store_submit.py` (stdlib `unittest`, canned API responses, no network, no `cryptography`) cover:
    - version normalization
    - notes loading (missing, empty, over 500, trimming)
    - iOS build selection (header match, newest, `FAILED` newest with an older `VALID` → fail, null encryption)
    - iOS state groups (each group plus "other version open")
    - Android versionCode lookup (asset, internal-name fallback, none) and the already-live skip
    - `--platforms` routing (no ASC client constructed for android-only, no Play client for ios-only)
  - `just check` passes.

## Acceptance criteria

AC 1–7 are checked by `just test-scripts` against canned responses. AC 8–12 are checked after the workflow is merged to `main`.

1. Notes file missing for `<v>` → preflight fails with the "Missing .github/release-notes/v<v>.md …" message, and no write is attempted.
2. Each shared-precondition row and each iOS and Android fail row under Edge cases produces its listed message, and no write call is made.
3. iOS build selection: given an `app-v<v> @` build and a newer `main @` build of the same version, the `app-v<v>` build is chosen. Given a newest release build that is `FAILED` plus an older `VALID` one, the run fails.
4. iOS state handling: each state in the Editable / In review / Approved groups maps to reuse / skip / skip. A different open version fails, naming it.
5. Android: given the asset, that versionCode is used. Given no asset and an internal release named `3.2.9`, its highest versionCode is used. Given neither, the run fails. Given production already `completed` at that code, the run skips and succeeds.
6. With `platforms=android`, no ASC client is constructed. With `platforms=ios`, no Play client is constructed.
7. `python3 -m unittest discover -s scripts -p 'test_*.py'` passes, and `just check` passes.
8. After merge, with a version that has a notes file and both release builds: `just store-push <v>` succeeds, and then:
   - **In App Store Connect:**
     - the `<v>` App Store version has the `app-v<v>` build attached
     - its `en-US` "What's New" equals the trimmed notes file
     - its release option is "Automatically release this version"
     - its state is `WAITING_FOR_REVIEW` or `IN_REVIEW`
   - **In Play Console:** `production` shows a 100% release of the recorded versionCode with `en-US` notes equal to the trimmed notes file.
9. Running `just store-push <v>` again right after AC 8 succeeds, logging the iOS "already in App Store review" and Android "already live on production" skip lines.
10. `just store-check <v>` for a version not yet submitted logs "[dry run] would …" lines for both platforms. Afterwards, App Store Connect shows no new or changed App Store version, and Play Console shows no new production release.
11. `/push-to-production <v>` in Claude Code dispatches the workflow and prints the run URL.
12. Searching the AC 8 run logs for `BEGIN PRIVATE KEY`, `"private_key"`, `iam.gserviceaccount.com`, and `eyJ` (JWT prefix) finds nothing.
13. `git check-ignore .claude/commands/push-to-production.md` prints nothing, and `store-submit.yml` contains no trigger besides `workflow_dispatch`.

## Decisions

| Decision | Choice | Why | Decided by |
|----------|--------|-----|-----------|
| Trigger | `workflow_dispatch` only | Owner does not want tag-triggered submission | user |
| Apple release | `AFTER_APPROVAL`, not phased | Owner preference | user |
| Play rollout | `production`, `completed`, 100% | Owner preference | user |
| Notes source | `.github/release-notes/v<v>.md`, verbatim with `- ` dashes | One file feeds GitHub, App Store, and Play | user |
| Notes content | Concise; only what users need to know changed | Owner instruction | user |
| Platforms | One workflow, `platforms` input `both`/`ios`/`android`, default `both` | Lets a failed side be retried alone | user |
| Partial failure | No rollback; red run names the platform to re-run | Store actions are not cleanly reversible | user |
| iOS build choice | Newest processed build whose TestFlight notes header is `app-v<v> @` | The owner chose "newest processed". Same-version `testflight.yml` builds of other branches would otherwise win, so it is narrowed to builds from the release tag. | agent default (refines user answer; confirm) |
| Android build choice | versionCode recorded on the GitHub release; fallback to internal release name, highest code | Play exposes no versionName, and internal drafts are replaced on each upload. The owner chose "highest versionCode"; that survives as the fallback rule. | agent default (refines user answer; confirm) |
| Android draft on `internal` | Not needed; promote by versionCode | Bundle stays in the library regardless of track | agent default |
| iOS existing state | Reuse editable `<v>`; skip in-review/approved; fail if another version is open | Avoids clobbering a review or renaming a version | user (skip-vs-fail: agent default) |
| Re-run behavior | Already in review/live is a skip with success on both platforms | Re-running `both` after success stays green | agent default |
| Check order | All read checks for all selected platforms before any write | A failing check never leaves one store changed | agent default |
| iOS processing wait | Up to 20 minutes, poll 30s | Owner estimates 5–10 min; 2× upper bound | user |
| Tag precondition | Require `app-v<v>` tag | Catches typo versions early | user |
| Desktop promotion | Not checked or touched | Desktop auto-updates on its own | user |
| Dry run | `dry_run` input; `just store-check`; Play edit validated then deleted | Validate before touching stores, including Play permissions | user (Play validate: agent default) |
| Names | `/push-to-production`; `just store-push`, `just store-check`, `just test-scripts`; `store-submit.yml` | Owner named the slash command and accepted the recipe names | user |
| Locales | `en-US` only | Only listed locale | user |
| Export compliance | Fail on null; never answer automatically | An auto-answer is a legal statement | user |
| Prerelease versions | Reject | Store versions can't carry beta suffixes | agent default |
| Notes read from | Default branch at dispatch, not the tag | Notes can be added after the release is cut | agent default |
| ASC client | Move shared parts into `scripts/asc.py` | Hyphenated script can't be imported; duplication is worse than a move | agent default |
| Concurrency | One `store-submit` group, queued | Prevents double submission and competing Play edits | agent default |
| Slash command tracking | Add `!.claude/commands/` to `.gitignore` | Otherwise the command is never committed | agent default |

## Open questions

1. **Confirm the two refined build-selection rules** (owner). Both refine answers given during the interview:
   - iOS: tag-header match.
   - Android: versionCode asset, which requires the `release.yml` change.

   If the owner rejects either, revert to the plain rule ("newest processed" / "highest internal versionCode") and accept the risk described in Decisions.
2. **Play production access** (owner, before the first real run).
   - Confirm the service account has release rights on `production`.
   - Confirm the developer account has no closed-testing gate on production access.

   The dry run's `edits.validate` should surface a permission failure, but this is not guaranteed.

## Existing code touched

| Path | Change |
|------|--------|
| `.github/workflows/store-submit.yml` | New |
| `.github/workflows/release.yml` | Extended: `build-android` attaches `android-version-code.txt` and sets `releaseName` |
| `.github/workflows/ci.yml` | Extended: Python unit-test step in `test-and-build` |
| `scripts/asc.py`, `scripts/store_common.py`, `scripts/submit_ios.py`, `scripts/promote_android.py`, `scripts/test_store_submit.py` | New |
| `scripts/testflight-notes.py` | Extended: imports from `asc.py`; behavior unchanged |
| `justfile` | Extended: `store-push`, `store-check`, `test-scripts`; `test-scripts` added to `check` |
| `.claude/commands/push-to-production.md` | New |
| `.gitignore` | Extended: `!.claude/commands/` |
| `CLAUDE.md` | Extended: `store-submit` row in the CI table; "Submitting to the stores" note under Release Workflow |
| `.github/workflows/testflight.yml`, `testflight-notes.yml`, `promote-release.yml` | Left alone |
| `.github/release-notes/` | Left alone; read only |
