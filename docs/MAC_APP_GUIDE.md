# Mac App Guide - Creating a Native Mac App with Tauri

This guide will walk you through converting your Bible Study web app into a native Mac application using Tauri.

## Overview

**Tauri** is a framework for building desktop applications using web technologies (React, Vite) with a Rust backend. Benefits:
- **Small bundle size**: ~3MB vs ~150MB (Electron)
- **Better performance**: Uses native webview
- **Rust backend**: Secure, fast, and allows native file access
- **Cross-platform**: macOS, Windows, Linux from one codebase

---

## Prerequisites

### 1. Install Rust

Tauri requires Rust. Install it using `rustup`:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After installation, restart your terminal or run:
```bash
source $HOME/.cargo/env
```

Verify installation:
```bash
rustc --version
cargo --version
```

### 2. Install System Dependencies (macOS)

Tauri needs system libraries for building. Install via Homebrew:

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install required dependencies
brew install libappindicator webkit2gtk
```

Actually, for macOS, you mainly need **Xcode Command Line Tools**:

```bash
xcode-select --install
```

---

## Installation Steps

### Step 1: Install Tauri CLI

```bash
pnpm add -D @tauri-apps/cli @tauri-apps/api
```

Or if you prefer npm:
```bash
npm install -D @tauri-apps/cli @tauri-apps/api
```

### Step 2: Initialize Tauri

Run the Tauri init command:

```bash
pnpm tauri init
```

This will ask you several questions:
- **App name**: `Bible Study` (or keep current)
- **Window title**: `Bible Study`
- **Where are your web assets?**: `../dist` (Tauri will build your Vite app and use the dist folder)
- **URL or path to dev server**: `http://localhost:5173` (for development)
- **Frontend dev server command**: `pnpm dev` (or `npm run dev`)
- **Frontend build command**: `pnpm build` (or `npm run build`)

This creates:
- `src-tauri/` directory with Rust code
- `src-tauri/tauri.conf.json` - Tauri configuration
- `src-tauri/Cargo.toml` - Rust dependencies
- `src-tauri/src/main.rs` - Rust entry point

### Step 3: Configure Tauri

Edit `src-tauri/tauri.conf.json` to customize your app:

```json
{
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devPath": "http://localhost:5173",
    "distDir": "../dist"
  },
  "package": {
    "productName": "Bible Study",
    "version": "0.1.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "all": false,
        "open": true
      },
      "dialog": {
        "all": false,
        "open": true,
        "save": true
      },
      "fs": {
        "all": false,
        "readFile": true,
        "writeFile": true,
        "readDir": true,
        "scope": ["**"]
      },
      "window": {
        "all": false,
        "close": true,
        "hide": true,
        "show": true,
        "maximize": true,
        "minimize": true,
        "unmaximize": true,
        "unminimize": true,
        "startDragging": true
      }
    },
    "bundle": {
      "active": true,
      "targets": "all",
      "identifier": "com.yourname.biblestudy",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "macOSPrivateApi": true
    },
    "security": {
      "csp": null
    },
    "windows": [
      {
        "fullscreen": false,
        "resizable": true,
        "title": "Bible Study",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600
      }
    ]
  }
}
```

### Step 4: Update package.json Scripts

Add Tauri commands to your `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

### Step 5: Install Tauri Rust Dependencies

Navigate to `src-tauri` and update Rust dependencies:

```bash
cd src-tauri
cargo update
cd ..
```

---

## Development

### Run the App in Development Mode

```bash
pnpm tauri dev
# or
pnpm run tauri:dev
```

This will:
1. Start your Vite dev server (`pnpm dev`)
2. Build and run the Tauri app
3. Hot-reload works for frontend changes
4. Rust code requires restart (changes to `src-tauri/`)

### Development Tips

- **Frontend changes**: Hot reload automatically
- **Rust/Config changes**: Restart with `pnpm tauri dev`
- **Console logs**: Show in terminal (Rust) and browser DevTools (Frontend)
- **DevTools**: Available in the app (right-click → Inspect or Cmd+Option+I)

---

## Building for Distribution

### Step 1: Build the Production App

```bash
pnpm tauri build
# or
pnpm run tauri:build
```

This creates:
- `src-tauri/target/release/bundle/` - Distribution files
- `.app` file for macOS (in `macos/` subdirectory)
- `.dmg` file (disk image) for easy distribution

### Step 2: Test the Build

Double-click the `.app` file in `src-tauri/target/release/bundle/macos/` to test.

### Version and build number

The app uses a **single source of truth** for version/build number:

- **`package.json`** – Update the `version` field here (e.g. `"0.2.0"`).
- **Tauri** – Reads version from `package.json` via `tauri.conf.json` (`"version": "../package.json"`).
- **Frontend** – Version is injected at build time as `__APP_VERSION__` (About screen, backups).
- **Cargo.toml** – Synced from `package.json` when you run `pnpm tauri:build` (via `pnpm version:sync`).

To bump the version: change it in `package.json` only, then run `pnpm tauri:build`. For frontend-only builds, run `pnpm version:sync` before releasing if you also ship the Tauri app.

---

## Code Signing & Notarization (for App Store/Distribution)

To distribute your app or submit to the Mac App Store, you need:

### 1. Apple Developer Account

- Sign up at https://developer.apple.com ($99/year)
- Enroll in the Apple Developer Program

### 2. Create Code Signing Certificates

In Xcode or Apple Developer Portal:
- Create an **App ID** (e.g., `com.yourname.biblestudy`)
- Create a **Development Certificate** (for testing)
- Create a **Distribution Certificate** (for release)
- Create a **Provisioning Profile**

### 3. Configure Signing in Tauri

Update `src-tauri/tauri.conf.json`:

```json
{
  "tauri": {
    "bundle": {
      "identifier": "com.yourname.biblestudy",
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
      "providerShortName": null,
      "entitlements": "entitlements.plist"
    }
  }
}
```

Create `src-tauri/entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

### 4. Build with Signing

```bash
pnpm tauri build
```

Tauri will automatically code sign the app if certificates are configured.

### 5. Notarization (for Distribution Outside App Store)

After building, notarize the app:

```bash
xcrun altool --notarize-app \
  --primary-bundle-id "com.yourname.biblestudy" \
  --username "your@email.com" \
  --password "@keychain:AC_PASSWORD" \
  --file "src-tauri/target/release/bundle/macos/Bible Study.app"
```

Or use `notarytool` (newer method):

```bash
xcrun notarytool submit "Bible Study.app" \
  --apple-id "your@email.com" \
  --team-id "TEAM_ID" \
  --password "@keychain:AC_PASSWORD" \
  --wait
```

### 6. Staple the Ticket

After notarization succeeds:

```bash
xcrun stapler staple "Bible Study.app"
```

---

## Updating File System Access (for iCloud Drive)

Since your app uses File System Access API for backup/restore, you'll need to use Tauri's file APIs in the desktop app.

### Install Tauri FS Plugin

```bash
pnpm add @tauri-apps/plugin-fs @tauri-apps/plugin-dialog
```

### Update Rust Dependencies

In `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri-plugin-dialog = "1.0"
tauri-plugin-fs = "1.0"
tauri = { version = "1.5", features = ["dialog-all", "fs-all"] }
```

In `src-tauri/src/main.rs`:

```rust
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Update Frontend Code

Update `src/lib/backup.ts` to detect Tauri and use Tauri APIs:

```typescript
import { exists } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';

// Check if running in Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export async function exportBackup() {
  if (isTauri) {
    // Use Tauri file dialog
    const filePath = await save({
      filters: [{
        name: 'JSON',
        extensions: ['json']
      }],
      defaultPath: `biblestudy-backup-${new Date().toISOString().split('T')[0]}.json`
    });
    
    if (filePath) {
      const data = await getBackupData();
      await writeTextFile(filePath, JSON.stringify(data, null, 2));
    }
  } else {
    // Use File System Access API (web)
    // ... existing web code ...
  }
}
```

---

## Icon Generation

Tauri needs app icons in multiple sizes. Create them:

### Option 1: Using Tauri Icon Generator

```bash
pnpm add -D @tauri-apps/cli
pnpm tauri icon path/to/your-icon.png
```

Place a 1024x1024 PNG icon in the project root and run:
```bash
pnpm tauri icon icon.png
```

This generates all required icon sizes in `src-tauri/icons/`.

### Option 2: Manual Icon Creation

Create icons at:
- `src-tauri/icons/32x32.png`
- `src-tauri/icons/128x128.png`
- `src-tauri/icons/128x128@2x.png`
- `src-tauri/icons/icon.icns` (macOS)
- `src-tauri/icons/icon.ico` (Windows)

Use a tool like [Image2icon](http://www.img2icnsapp.com/) or online converters.

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
- Verify `distDir` path in `tauri.conf.json` is correct

**File system access not working**
- Ensure `fs` allowlist is enabled in `tauri.conf.json`
- Check file paths (Tauri uses different path resolution than web)

### Code Signing Errors

**"code object is not signed at all"**
- Verify signing identity in `tauri.conf.json`
- Check certificates in Keychain Access
- Ensure `entitlements.plist` exists

**"The operation couldn't be completed" (notarization)**
- Check Apple ID and team ID
- Verify app identifier matches Developer Portal
- Check notarization logs in Xcode Organizer

---

## Distribution Options

### 1. Direct Distribution (.dmg)

Build creates a `.dmg` file:
- Share via website, email, or direct download
- Users drag app to Applications folder
- No App Store required

### 2. Mac App Store

Requires:
- Apple Developer Program membership
- Full code signing and notarization
- App Store Review Guidelines compliance
- Sandboxing (may require code changes)

Use `tauri build -- --target universal-apple-darwin` for universal binary.

### 3. Homebrew Cask

Create a Homebrew formula:
```ruby
cask 'bible-study' do
  version '0.1.0'
  sha256 '...'
  
  url "https://yourdomain.com/releases/BibleStudy-#{version}.dmg"
  name 'Bible Study'
  
  app 'Bible Study.app'
end
```

---

## Next Steps

1. **Test thoroughly** on different macOS versions
2. **Optimize performance** (Tauri is fast, but profile if needed)
3. **Add auto-updates** (Tauri Updater plugin)
4. **Create update server** (for auto-updates outside App Store)
5. **Set up CI/CD** (GitHub Actions for automated builds)
6. **Documentation** (user guide, changelog)

---

## Quick Reference

```bash
# Development
pnpm tauri dev

# Build for production
pnpm tauri build

# Check Tauri version
pnpm tauri --version

# Generate icons
pnpm tauri icon icon.png

# Open DevTools (in running app)
Cmd+Option+I
```

---

## Resources

- [Tauri Documentation](https://tauri.app/)
- [Tauri API Documentation](https://tauri.app/api/)
- [Tauri Examples](https://github.com/tauri-apps/tauri/tree/dev/examples)
- [macOS Code Signing Guide](https://developer.apple.com/documentation/security/code_signing_services)
- [Apple Notarization Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
