# BibleMarker

**BibleMarker** is a free, open-source Bible study app for desktop. Mark up scripture, take notes, track themes and observations, and organize your study—all in a fast, native app that runs on macOS, Windows, and Linux.

- **Lightweight** — Built with [Tauri](https://tauri.app/), so the app is small and quick instead of a heavy Electron bundle.
- **Offline-first** — Your data lives on your machine. Optional Bible APIs (ESV, Biblia, BibleGateway) for fetching translations when you want them.
- **Your data** — Export backups and restore anytime. No account required to use the app.

## Features

- **Markup & annotations** — Highlight verses, add symbols, and organize with presets.
- **Notes & lists** — Attach notes to verses and manage custom lists.
- **Study tools** — Observation (5W&H, themes, contrasts), interpretation worksheets, keywords, and summaries.
- **Multiple translations** — Fetch text from ESV API, Biblia.com, or BibleGateway (optional; configure API keys in Settings).
- **Backup & export** — Save and restore backups; export studies.

## Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Dexie (IndexedDB)
- **Desktop:** Tauri 2 (Rust)
- **Package manager:** pnpm

## Prerequisites

- **Node.js** LTS and **pnpm** — Install pnpm: `npm install -g pnpm` or enable [Corepack](https://nodejs.org/api/corepack.html).
- **Rust** — Required for the desktop app. Install via [rustup](https://rustup.rs/).
- **Platform-specific (Tauri):**
  - **macOS:** Xcode Command Line Tools: `xcode-select --install`
  - **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the “Desktop development with C++” workload
  - **Linux:** e.g. `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf` — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Getting started

```bash
# Clone the repo (or open your local copy)
git clone https://github.com/<your-username>/biblemarker.git
cd biblemarker

# Install dependencies
pnpm install

# Run in the browser (web only)
pnpm dev

# Or run the desktop app (Tauri + dev server)
pnpm tauri:dev
```

## Building for production

### Web

```bash
pnpm build
```

Output is in `dist/`.

### Desktop (Tauri)

Run on the OS you want to target (or use CI for all platforms):

```bash
pnpm tauri:build
```

Artifacts appear under `src-tauri/target/release/bundle/`:

- **macOS:** `macos/` — `.app` and `.dmg`
- **Windows:** `nsis/` or `msi/` — `.exe` installer
- **Linux:** `deb/`, `appimage/`, etc.

To build for another OS from one machine (advanced, with extra setup):

```bash
pnpm tauri build --target x86_64-pc-windows-msvc   # Windows 64-bit
pnpm tauri build --target x86_64-unknown-linux-gnu  # Linux 64-bit
```

## CI (GitHub Actions)

The repo includes [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds Tauri installers for **macOS (Intel + Apple Silicon), Windows, and Linux** and creates a **draft GitHub Release** with the installers.

- **Triggers:** Push to the `release` branch, or run the workflow manually from the Actions tab.
- **Required:** In the repo, set **Settings → Actions → General → Workflow permissions** to **Read and write permissions** so the action can create the release and tag.

## Project structure

```
biblemarker/
├── src/                 # React app (components, stores, lib)
├── src-tauri/           # Tauri config and Rust backend
│   ├── src/main.rs
│   ├── tauri.conf.json
│   └── icons/
├── public/
├── .github/workflows/   # CI
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## Scripts

| Script            | Description                 |
|-------------------|-----------------------------|
| `pnpm dev`        | Web dev server              |
| `pnpm build`      | Web production build        |
| `pnpm tauri:dev`  | Desktop app (dev)           |
| `pnpm tauri:build`| Desktop production build    |
| `pnpm lint`       | Run ESLint                  |

## Security & privacy

- **No credentials in the repo.** API keys (ESV, Biblia) and BibleGateway username/password are entered by you in the app and stored locally (IndexedDB). They are never committed.
- **`.env` files** are gitignored; do not commit env files that contain secrets.

## Documentation

- [Mac App Guide](docs/MAC_APP_GUIDE.md) — Tauri setup and distributing the macOS app
- [Cross-Platform Strategy](docs/CROSS_PLATFORM_STRATEGY.md) — Desktop (Mac, Windows, Linux) and future mobile (iOS/Android)

## License

BibleMarker is released under the **PolyForm Noncommercial 1.0.0** license. You may use, modify, and distribute it for noncommercial purposes (personal use, education, charities, etc.). Commercial use requires a separate license from the copyright holder. See [LICENSE](LICENSE) for full terms.
