# Mac App Guide - Native Mac App with Tauri 2

BibleMarker is a native Mac application built with Tauri 2.0 (React + Rust).

## Overview

**Tauri** is a framework for building desktop applications using web technologies (React, Vite) with a Rust backend. Benefits:
- **Small bundle size**: ~3MB vs ~150MB (Electron)
- **Better performance**: Uses native webview
- **Rust backend**: Secure, fast, and allows native file access
- **Cross-platform**: macOS, Windows, Linux, and iOS from one codebase

---

## Opening a Downloaded App (GitHub Releases)

If you downloaded the macOS app from [GitHub Releases](https://github.com/spearssoftware/BibleMarker/releases) and see **"BibleMarker is damaged and can't be opened"**, the app is not actually damaged. macOS Gatekeeper blocks unsigned apps downloaded from the internet.

**To open the app:**

1. **Right-click** (or Control-click) the BibleMarker app.
2. Choose **Open**, then click **Open** in the dialog.

Or remove the quarantine attribute in Terminal (adjust the path if needed):

```bash
xattr -cr /Applications/BibleMarker.app
```

After that, you can open the app normally. For signed builds and notarization, see the **Code Signing & Notarization** section below.

---

## Prerequisites

### 1. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After installation, restart your terminal or run:
```bash
source $HOME/.cargo/env
```

Verify:
```bash
rustc --version
cargo --version
```

### 2. Install Xcode Command Line Tools

```bash
xcode-select --install
```

---

## Project Structure

The Tauri project is already set up in `src-tauri/`:

```
src-tauri/
├── src/
│   ├── lib.rs          # Plugin registration, Tauri commands
│   └── icloud.rs       # iCloud container access (macOS/iOS)
├── tauri.conf.json     # Tauri 2 configuration
├── Cargo.toml          # Rust dependencies (Tauri 2.0, plugins 2.x)
├── entitlements.plist  # macOS code signing entitlements
└── icons/              # App icons (generated via pnpm generate-icons)
```

### Tauri 2 Configuration

`tauri.conf.json` uses the Tauri 2 format — no `allowlist` (Tauri 2 uses a permissions system instead):

```json
{
  "productName": "BibleMarker",
  "version": "../package.json",
  "identifier": "app.biblemarker",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{ "title": "BibleMarker", "width": 1200, "height": 800 }],
    "security": { "csp": null }
  },
  "bundle": { ... },
  "plugins": { ... }
}
```

Key differences from Tauri 1:
- `devUrl` / `frontendDist` instead of `devPath` / `distDir`
- No `package` wrapper — `productName` and `version` are top-level
- No `tauri.allowlist` — permissions are declared per-plugin in `capabilities/`
- Plugins use 2.x APIs (`@tauri-apps/plugin-*` on the JS side, `tauri-plugin-*` 2.x in Cargo)

### Rust Dependencies (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2.0", features = [] }
tauri-plugin-dialog = { version = "2.0" }
tauri-plugin-fs = { version = "2.0" }
tauri-plugin-sql = { version = "2.2", features = ["sqlite"] }
tauri-plugin-opener = { version = "2.0" }
```

### Frontend Dependencies (package.json)

```json
"@tauri-apps/api": "^2.10.1",
"@tauri-apps/plugin-dialog": "^2.6.0",
"@tauri-apps/plugin-fs": "^2.4.5",
"@tauri-apps/plugin-sql": "^2.3.2"
```

---

## Development

### Run the App in Development Mode

Always use the project scripts (they set `CARGO_HOME` correctly):

```bash
pnpm run tauri:dev
```

This will:
1. Start your Vite dev server (`pnpm dev`)
2. Build and run the Tauri app
3. Hot-reload works for frontend changes
4. Rust code requires restart (changes to `src-tauri/`)

### Development Tips

- **Frontend changes**: Hot reload automatically
- **Rust/Config changes**: Restart with `pnpm run tauri:dev`
- **DevTools**: Cmd+Option+I in the running app
- **Console logs**: Show in terminal (Rust) and browser DevTools (Frontend)

---

## Building for Distribution

### Build the Production App

```bash
pnpm run tauri:build
```

This creates:
- `src-tauri/target/release/bundle/` - Distribution files
- `.app` file for macOS (in `macos/` subdirectory)
- `.dmg` file (disk image) for easy distribution

### Version and Build Number

The app uses a **single source of truth** for version/build number:

- **`package.json`** – Update the `version` field here (e.g. `"0.7.8"`).
- **Tauri** – Reads version from `package.json` via `tauri.conf.json` (`"version": "../package.json"`).
- **Frontend** – Version is injected at build time as `__APP_VERSION__` (About screen, backups).
- **Cargo.toml** – Synced from `package.json` when you run `pnpm tauri:build` (via `pnpm version:sync`).

To bump the version: change it in `package.json` only, then run `pnpm tauri:build`.

---

## Code Signing & Notarization (for Distribution)

### 1. Apple Developer Account

- Sign up at https://developer.apple.com ($99/year)
- Enroll in the Apple Developer Program

### 2. Create Code Signing Certificates

In Xcode or Apple Developer Portal:
- Create an **App ID** (e.g., `app.biblemarker`)
- Create a **Development Certificate** (for testing)
- Create a **Distribution Certificate** (for release)
- Create a **Provisioning Profile**

### 3. Configure Signing in Tauri

In `tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "hardenedRuntime": true,
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
      "entitlements": "entitlements.plist"
    }
  }
}
```

### 4. Build with Signing

```bash
pnpm run tauri:build
```

Tauri will automatically code sign the app if certificates are configured.

### 4b. Re-sign for Notarization (Hardened Runtime + Timestamp)

Apple notarization requires the main executable to be signed with **hardened runtime** and a **secure timestamp**. If notarization returns "Invalid" with errors about "signature does not include a secure timestamp" or "executable does not have the hardened runtime enabled", re-sign after building:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
./scripts/sign-macos.sh
```

Then zip and submit for notarization (see below).

### 5. Notarization

Submit a .zip of the signed .app:

```bash
cd src-tauri/target/release/bundle/macos
ditto -c -k --keepParent BibleMarker.app BibleMarker.zip
xcrun notarytool submit BibleMarker.zip \
  --apple-id "your@email.com" \
  --team-id "TEAM_ID" \
  --keychain-profile "AC_PASSWORD" \
  --wait
```

Use `--keychain-profile "AC_PASSWORD"` if you stored credentials with `notarytool store-credentials "AC_PASSWORD" ...`.

### 6. Staple the Ticket

After notarization succeeds, staple to the **.app** (not the zip):

```bash
xcrun stapler staple BibleMarker.app
```

Then distribute the stapled `BibleMarker.app` (or a DMG containing it).

---

## CI (GitHub Actions)

The release workflow (`.github/workflows/release.yml`) can sign and notarize the macOS build in CI. It:

1. **prepare** – Creates a draft release and tag.
2. **publish-tauri** (matrix) – For **macOS**: imports your Apple cert, builds, re-signs (hardened runtime + timestamp), notarizes, staples, and uploads `BibleMarker-macos-aarch64.zip` / `BibleMarker-macos-x64.zip`. For **Linux/Windows**: builds and uploads to the same release.

**Required GitHub secrets** (for macOS signing and notarization):

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` (export from Keychain, then `base64 -i cert.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | Password you set when exporting the `.p12` |
| `KEYCHAIN_PASSWORD` | Temporary keychain password (random string; used only in CI) |
| `APPLE_ID` | Apple ID email (for notarytool) |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from [appleid.apple.com](https://appleid.apple.com) |
| `APPLE_TEAM_ID` | Team ID from [developer.apple.com/account](https://developer.apple.com/account) |

---

## Auto-Updates (Tauri Updater)

The app uses `tauri-plugin-updater` for in-app updates. To enable signed updates:

1. Generate signing keys: `pnpm tauri signer generate -w ~/.tauri/biblemarker.key`
2. Add the public key content to `tauri.conf.json` under `plugins.updater.pubkey`
3. Add `TAURI_SIGNING_PRIVATE_KEY` (path or content) to GitHub Actions secrets for release builds
4. CI creates `latest.json` and platform-specific `.tar.gz`/`.sig` artifacts on release

---

## Troubleshooting

### Build Errors

**Error: "command not found: cargo"**
- Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

**Error: "linker 'cc' not found"**
- Install Xcode Command Line Tools: `xcode-select --install`

**Error: "failed to resolve: use of undeclared crate"**
- Run `cargo update` in `src-tauri/` directory

### Runtime Errors

**App won't start / blank window**
- Check browser console in DevTools (Cmd+Option+I)
- Check terminal for Rust errors
- Verify `frontendDist` path in `tauri.conf.json` is correct

### Code Signing Errors

**"code object is not signed at all"**
- Verify `signingIdentity` in `tauri.conf.json` under `bundle.macOS`
- Check certificates in Keychain Access
- Ensure `entitlements.plist` exists

---

## Distribution Options

### 1. Direct Distribution (.dmg)

Build creates a `.dmg` file:
- Share via website, email, or direct download
- Users drag app to Applications folder

### 2. Mac App Store

Requires:
- Apple Developer Program membership
- Full code signing and notarization
- App Store Review Guidelines compliance
- Sandboxing (may require code changes)

Use `pnpm run tauri:build` with `--target universal-apple-darwin` for universal binary.

---

## Quick Reference

```bash
# Development
pnpm run tauri:dev

# Build for production
pnpm run tauri:build

# Check Tauri version
pnpm tauri --version

# Generate icons
pnpm generate-icons
pnpm tauri icon icon.png

# Open DevTools (in running app)
Cmd+Option+I
```

---

## Resources

- [Tauri 2 Documentation](https://v2.tauri.app/)
- [Tauri 2 API Documentation](https://v2.tauri.app/reference/)
- [macOS Code Signing Guide](https://developer.apple.com/documentation/security/code_signing_services)
- [Apple Notarization Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
