# Contributing to BibleMarker

Thanks for your interest in contributing! This document explains how the contribution process works and what to expect.

## License & CLA

BibleMarker is licensed under [AGPL-3.0-or-later](./LICENSE). Contributions are accepted under that license, but we also ask contributors to sign a [Contributor License Agreement (CLA)](./CLA.md) before their first PR can be merged.

### Why a CLA?

The CLA grants the project owner the right to relicense the project — for example, to grant a commercial license to an organization that wants to ship BibleMarker as part of a paid product or curriculum without the AGPL's source-disclosure requirements.

You retain full ownership of your contribution. You can still use, modify, and distribute your own code under any terms you like — the CLA only governs how *this project* may use it.

### How to sign

When you open your first pull request, the **CLA Assistant bot** will comment on the PR with a link. Click it, sign in with GitHub, and click "I agree." That's it — one-click, ~30 seconds. Your signature persists across all future PRs to this project.

If you'd prefer to read the full agreement first, it's at [CLA.md](./CLA.md).

## Getting started

1. Fork the repo and create a feature branch (`feat/short-description` or `fix/short-description`)
2. Run the dev environment:
   ```bash
   pnpm install
   pnpm run tauri:dev
   ```
3. Make your changes, ideally with tests
4. Run checks before pushing:
   ```bash
   pnpm test
   pnpm run lint
   ```
5. Open a PR against `main`

## What we're looking for

- Bug fixes (always welcome)
- Feature work that aligns with the project roadmap — for non-trivial features, please open an issue first to discuss
- Documentation improvements
- Test coverage

## Code style

See [CLAUDE.md](./CLAUDE.md) for the project's code conventions — TypeScript, React, Tauri, and styling guidelines.

## Bible text, NASB, and trademark

A few non-code things worth knowing as a contributor:

**NASB is not in this repository.** The NASB SWORD modules are distributed by Spears Software via `biblemarker.app/modules/<file>.zip` under a license from The Lockman Foundation. The endpoint authenticates requests with an HMAC signature using a build-time secret (`NASB_SIGNING_KEY`) that is set in CI for official builds and is **not** in the public source. Local dev builds and forks built from public source cannot fetch NASB. Use ASV (bundled) or any of the public-domain SWORD modules from CrossWire instead.

**If you want NASB locally for development**, ask Kevin for the signing key. Set it as a shell env var before running `pnpm tauri:dev` and the embedded build will be able to fetch from biblemarker.app like an official build would.

**Don't bundle NASB into a fork.** The Lockman license is non-sublicensable, so even if you obtain NASB through some other channel, you cannot redistribute it as part of a forked BibleMarker. If you want to ship a fork with NASB, you must obtain your own license from [The Lockman Foundation](https://www.lockman.org).

**Trademark.** The "BibleMarker" name and logo are trademarks of Spears Software. The AGPL license covers source code, not branding. Forks must rebrand under a different name.

## Linux builds

BibleMarker's Linux distribution is moving to Flatpak (via Flathub) plus AppImage. The Tauri bundler is configured to build only AppImage on Linux; `.deb` and `.rpm` are no longer produced. If you run `pnpm tauri build` on Linux, you'll get a single `.AppImage` artifact under `src-tauri/target/release/bundle/appimage/`.

## Questions?

Open an issue or email biblemarker@spearssoftware.com.
