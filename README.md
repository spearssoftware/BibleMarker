# BibleMarker

**BibleMarker** is a free, open-source Bible study app for desktop. It’s built for anyone who wants to work through scripture systematically: mark up verses, take notes, track observations and themes, and keep everything in one place without signing up or syncing to the cloud.

The app runs as a native desktop application on **macOS**, **Windows**, and **Linux**—small and fast thanks to [Tauri](https://tauri.app/) (Rust + web frontend), not a heavy Electron bundle. Your data stays on your machine. You can optionally connect Bible APIs (ESV, Biblia.com, BibleGateway) to pull in translations; otherwise you can use the built-in sample text or your own workflow. There’s no account required: install, create a study, and start marking. Backup and export are built in so you can save or move your data anytime.

---

## Using BibleMarker

### What it does

- **Markup & annotations** — Highlight verses, add symbols (e.g. repeated words, contrasts, key ideas), and group them with presets. Build a visual map of a passage as you study.
- **Notes & lists** — Attach notes to verses and organize verses into custom lists (e.g. “promises,” “commands,” “questions”).
- **Study tools** — Observation tools (5 W’s & H, themes, contrasts, places, time), interpretation worksheets, keyword finder, and summary views (book overview, chapter-at-a-glance).
- **Multiple translations** — Optionally fetch text from ESV API, [Biblia.com](https://biblia.com), or [BibleGateway](https://www.biblegateway.com/) by entering your own API keys or credentials in Settings. GetBible is also supported for some public-domain texts.
- **Backup & export** — Save full backups and restore them later. Export studies for sharing or safekeeping.

### How to get the app

- **Pre-built installers** — When the project is published, installers will be available from the [Releases](https://github.com/<your-username>/biblemarker/releases) page (macOS `.app`/`.dmg`, Windows `.exe`, Linux `.deb`/AppImage). Download for your OS and install as usual.
- **Run from source** — If you prefer to run the app from source (e.g. for development), see [Developing BibleMarker](#developing-biblemarker) below.

### Quick start (after installing)

1. Open BibleMarker.
2. Create or open a study from the home screen.
3. Pick a book and chapter to read. Use the toolbar to add symbols, notes, and observations.
4. (Optional) In **Settings → Module Manager**, add API keys or BibleGateway credentials to fetch translations. Otherwise you can rely on sample text or paste your own.

Your data is stored locally. Use **Backup & restore** in Settings to save or load a backup file.

---

## Developing BibleMarker

This section is for anyone who wants to build, run, or modify the app from source.

### Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Dexie (IndexedDB)
- **Desktop:** Tauri 2 (Rust)
- **Package manager:** pnpm

### Prerequisites

- **Node.js** LTS and **pnpm** — Install pnpm: `npm install -g pnpm` or enable [Corepack](https://nodejs.org/api/corepack.html).
- **Rust** — Required for the desktop app. Install via [rustup](https://rustup.rs/).
- **Platform-specific (Tauri):**
  - **macOS:** Xcode Command Line Tools: `xcode-select --install`
  - **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the “Desktop development with C++” workload
  - **Linux:** e.g. `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf` — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Getting started

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

### Building for production

**Web:**

```bash
pnpm build
```

Output is in `dist/`.

**Desktop (Tauri):** Run on the OS you want to target (or use CI for all platforms):

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

### CI (GitHub Actions)

The repo includes [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds Tauri installers for **macOS (Intel + Apple Silicon), Windows, and Linux** and creates a **draft GitHub Release** with the installers.

- **Triggers:** Push to the `release` branch, or run the workflow manually from the Actions tab.
- **Required:** In the repo, set **Settings → Actions → General → Workflow permissions** to **Read and write permissions** so the action can create the release and tag.

### Project structure

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

### Scripts

| Script             | Description                 |
|--------------------|-----------------------------|
| `pnpm dev`         | Web dev server              |
| `pnpm build`       | Web production build        |
| `pnpm tauri:dev`   | Desktop app (dev)           |
| `pnpm tauri:build` | Desktop production build    |
| `pnpm lint`        | Run ESLint                  |

### Security & privacy (for developers)

- **No credentials in the repo.** API keys (ESV, Biblia) and BibleGateway username/password are entered by users in the app and stored locally (IndexedDB). They are never committed.
- **`.env` files** are gitignored; do not commit env files that contain secrets.

### Documentation

- [Mac App Guide](docs/MAC_APP_GUIDE.md) — Tauri setup and distributing the macOS app
- [Cross-Platform Strategy](docs/CROSS_PLATFORM_STRATEGY.md) — Desktop (Mac, Windows, Linux) and future mobile (iOS/Android)

---

## License

BibleMarker is released under the **PolyForm Noncommercial 1.0.0** license. You may use, modify, and distribute it for noncommercial purposes (personal use, education, charities, etc.). Commercial use requires a separate license from the copyright holder. See [LICENSE](LICENSE) for full terms.
