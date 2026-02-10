# BibleMarker v0.7.0

## Features

- **Journal-based iCloud sync**: Replaced direct SQLite-over-iCloud with a journal-based sync engine. Each device keeps a local database and syncs changes via JSON journal files in iCloud Drive, eliminating database corruption from concurrent access.
- **Improved first boot experience (iOS)**: Branded launch screen, inline splash while JS loads, theme-aware background to eliminate white flash during startup.
- **Platform-aware onboarding**: Welcome screen now shows touch-specific tips on iOS and keyboard shortcuts on desktop.

## Bug Fixes

- **Fixed "database disk image is malformed" on iOS**: iCloud was syncing SQLite WAL/SHM files independently, corrupting the database. Migration now skips WAL/SHM files and validates integrity before use.
- **Automatic corruption recovery**: If a corrupt database is detected at runtime, the app deletes it and starts fresh rather than showing "Failed to initialize".
- **Fixed sync folder access on iOS**: Added iCloud container path to Tauri filesystem scope so the sync engine can read/write journal files.
- **Fixed missing translation on fresh iOS install**: Resolved race condition where `currentModuleId` wasn't set when `activeView` was populated from synced data but localStorage was fresh.

## Improvements

- **Deferred non-critical initialization**: Studies, lists, auto-backup, and debug flags load after first render for faster perceived startup.
- **Parallel API initialization**: API configs and sample data now load concurrently.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
