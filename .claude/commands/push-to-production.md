---
description: Submit a released version to App Store review and Google Play production
argument-hint: <version> [both|ios|android]
---

Push BibleMarker version `$ARGUMENTS` to the stores.

1. Run `just store-push $ARGUMENTS`. It dispatches the `store-submit` workflow, which submits the version to App Store review (released automatically once approved) and promotes it to Google Play production at 100%. Platforms default to `both`.
2. Report the run URL the recipe prints. Do not watch or poll the run.

The workflow needs `.github/release-notes/v<version>.md` on `main`: concise What's New bullets covering only what users need to know changed. If the run fails on a missing notes file, say so and offer to draft the notes from the commits since the previous release tag.
