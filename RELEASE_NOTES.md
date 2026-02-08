# BibleMarker v0.6.6

## Bug Fixes

- **Fixed backup restore not working on native app**: Restoring from a backup on macOS/iOS wrote data to IndexedDB instead of the SQLite database, making restored data invisible. Backup, restore, and auto-backup now correctly use the database abstraction layer, routing to SQLite on native and IndexedDB on web.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.