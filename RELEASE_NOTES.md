# BibleMarker v0.8.4

## Bug Fixes

- **Fix iPad sync**: Device IDs were stored in `localStorage`, which iCloud silently syncs across devices via WebKit data. This caused Mac and iPad to share the same device ID, so the iPad wrote journal files into the Mac's sync folder instead of its own. Device IDs are now stored in the local SQLite database, which is not synced by iCloud.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
