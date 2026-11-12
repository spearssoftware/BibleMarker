---
description: Submit a released version to App Store review and Google Play production
argument-hint: <version> [both|ios|android]
---

Push BibleMarker version `$ARGUMENTS` to the stores.

1. Check that `.github/release-notes/v<version>.md` exists on `origin/main` (`git fetch origin main` first; strip any leading `v` or `app-v` from the version). The workflow fails without it. If it is missing, say so and stop: the notes are concise What's New bullets covering only what users need to know changed, and the owner writes them.
2. Run `just store-push $ARGUMENTS`. It dispatches the `store-submit` workflow, which submits the version to App Store review (released automatically once approved) and promotes it to Google Play production at 100%. Platforms default to `both`.
3. Report the run URL the recipe prints, or the error it prints if the dispatch failed. Do not watch or poll the run.
