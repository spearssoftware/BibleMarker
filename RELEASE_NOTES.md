# BibleMarker v0.6.5

## Bug Fixes

- **Fixed iCloud sync not working**: All data operations were going through IndexedDB instead of the SQLite database in the iCloud container. Database routing now correctly uses SQLite on native macOS/iOS, enabling cross-device sync via iCloud Drive.

## Improvements

- **iCloud status in Settings**: Moved sync status indicator from the navigation bar to Settings > Data tab, showing connection state, container path, and errors for easier diagnostics
- **Bundle ID migration**: Migrated from `com.biblemarker` to `app.biblemarker`
- **Precepts terminology**: Added Precept Ministries attribution and terminology

---

**macOS:** Signed and notarized builds open without Gatekeeper warnings. If you see "damaged", right-click → **Open** (or run `xattr -cr /path/to/BibleMarker.app`).

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
