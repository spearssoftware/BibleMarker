# BibleMarker v0.6.5

## Bug Fixes

- **Fixed iCloud sync not working**: All data operations were going through IndexedDB instead of the SQLite database in the iCloud container. Database routing now correctly uses SQLite on native macOS/iOS, enabling cross-device sync via iCloud Drive.

## Improvements

- **iCloud status in Settings**: Moved sync status indicator from the navigation bar to Settings > Data tab, showing connection state, container path, and errors for easier diagnostics
- **Bundle ID migration**: Migrated from `com.biblemarker` to `app.biblemarker`
- **Precepts terminology**: Added Precept Ministries attribution and terminology

---

## v0.6.4

- Fixed sync indicator click in navigation bar
- Added iCloud debug logging

## v0.6.3

- Updated provisioning profile with correct iCloud container entitlements

## v0.6.2

- Fixed provisioning profile embedding in macOS app bundle

## v0.6.1

### iCloud Sync (macOS)
Your Bible study data now syncs automatically across all your Mac devices via iCloud. Markings, notes, observations, and studies are stored in your iCloud Drive and stay in sync.

- Database automatically stored in iCloud Documents container
- Sync status indicator in the navigation bar shows current sync state
- Graceful fallback to local storage if iCloud is unavailable

### Update Checker
- Added "Check now" button to manually check for app updates

### Bug Fixes
- Fixed duplicate time/place observations caused by race conditions
- Fixed memory leaks in sync and database modules
- Fixed SQL injection vulnerabilities in database queries
- Fixed potential array out-of-bounds in date formatting
- Improved platform detection for Tauri file system permissions

---

**macOS:** Signed and notarized builds open without Gatekeeper warnings. If you see "damaged", right-click → **Open** (or run `xattr -cr /path/to/BibleMarker.app`).

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
