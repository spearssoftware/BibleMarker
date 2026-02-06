# BibleMarker v0.6.1

## What's New

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

### Developer Experience
- Added security scanning (Semgrep) to CI pipeline
- Refactored forms to use shared UI components
- Added Cursor rules for consistent AI-assisted development

---

**macOS:** Signed and notarized builds open without Gatekeeper warnings. If you see "damaged", right-click → **Open** (or run `xattr -cr /path/to/BibleMarker.app`).

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
