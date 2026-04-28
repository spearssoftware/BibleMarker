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

## Questions?

Open an issue or email biblemarker@spearssoftware.com.
