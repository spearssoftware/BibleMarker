# Cross-Platform Strategy: Mac, Windows, Linux, iOS

BibleMarker uses **Tauri 2** for all native platforms — desktop and mobile — with a shared React codebase.

---

## Platform Coverage

| Platform | Framework | Status |
|----------|-----------|--------|
| **macOS** | Tauri 2 (desktop) | Shipping |
| **Windows** | Tauri 2 (desktop) | Shipping |
| **Linux** | Tauri 2 (desktop) | Shipping |
| **iOS** | Tauri 2 (mobile) | In development |

Tauri 2 added first-class iOS (and Android) support, so a single framework covers all platforms.

---

## Architecture

```
┌─────────────────────────────────────┐
│     Shared React Codebase           │
│  (Components, Logic, State, APIs)   │
└─────────────────────────────────────┘
                │
                ▼
         ┌──────────┐
         │ Tauri 2  │
         └──────────┘
              │
    ┌────┬────┼────┐
    ▼    ▼    ▼    ▼
   Mac  Win Linux  iOS
```

---

## Why Tauri for Everything

### Single Framework

- One Rust backend for all native platforms
- Tauri 2's mobile support eliminates the need for Capacitor
- Same plugin ecosystem (fs, dialog, sql, updater) across desktop and iOS
- Permissions model is consistent

### Code Reuse

**Shared across all platforms (~95%):**
- All React components
- TypeScript types
- Business logic and state management (Zustand)
- Database abstraction (`database.ts` routes to Dexie or SQLite)
- API clients (`bible-api/`)
- UI styling (Tailwind CSS)

**Platform-specific:**
- iCloud sync (macOS/iOS only — `icloud.rs`)
- Updater plugin (desktop only)
- Platform detection (`src/lib/platform.ts`)

---

## Sync Strategy

| Platform | Database | Sync Method |
|----------|----------|-------------|
| macOS (Tauri) | SQLite (local) | iCloud Drive (journal-based) |
| iOS (Tauri) | SQLite (local) | iCloud Drive (journal-based) |
| Windows (Tauri) | SQLite (local) | Manual backup (future: OneDrive) |
| Linux (Tauri) | SQLite (local) | Manual backup |

See [ICLOUD_SYNC.md](./ICLOUD_SYNC.md) for details on the journal-based sync system.

---

## Build Commands

```bash
# Development
pnpm run tauri:dev        # macOS desktop (uses scripts/tauri-dev.sh)
pnpm run ios:dev          # iOS simulator

# Production builds
pnpm run tauri:build      # macOS/Windows/Linux (uses scripts/tauri-build.sh)
pnpm run ios:build        # iOS

# Specific desktop target
CARGO_HOME="$(pwd)/.cargo-home" unset CI && pnpm tauri build --target aarch64-apple-darwin
```

---

## Distribution

### Desktop

**Mac:**
- `.app` bundle and `.dmg` installer
- Direct distribution via GitHub Releases
- Code signing + notarization for Gatekeeper
- See [MAC_APP_GUIDE.md](./MAC_APP_GUIDE.md)

**Windows:**
- `.exe` / `.msi` installer
- See [WINDOWS_CODE_SIGNING.md](./WINDOWS_CODE_SIGNING.md)

**Linux:**
- `.AppImage`, `.deb`, `.rpm` packages

### Mobile

**iOS:**
- TestFlight (beta testing)
- App Store (production)
- Requires Apple Developer account ($99/year)

### Cost

- **Apple Developer**: $99/year (Mac + iOS)
- **Google Play**: $25 one-time (if Android added later)
- **Windows / Linux**: Free (direct distribution)

---

## Platform-Specific Considerations

### macOS
- Code signing required for distribution
- Notarization for Gatekeeper
- iCloud sync via ubiquity container

### Windows
- Code signing recommended (SmartScreen warnings without it)
- No native cloud sync yet

### Linux
- Multiple package formats needed
- Desktop environment compatibility

### iOS
- Tauri 2 mobile support (WKWebView)
- iCloud sync shared with macOS
- App Store review process
- `developmentTeam` configured in `tauri.conf.json` under `bundle.iOS`

---

## Future Possibilities

- **Android**: Tauri 2 supports Android — could be added when ready
- **Cross-platform sync backend**: Custom server for Windows/Linux/Android sync
- **Selective sync**: Choose what data to sync across devices
