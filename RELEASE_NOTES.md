# BibleMarker v0.6.8

## Bug Fixes

- **Fixed backup/export crashing on native app**: The `interpretations` and `applications` tables were missing from the SQLite table name whitelist, causing all manual backups and auto-backups to fail with "Invalid table name" on macOS and Windows.
- **Fixed incomplete database clear on web restore**: Restoring a backup on web left stale `conclusions`, `interpretations`, and `applications` records because those tables were not cleared before import.

## Improvements

- **Safety backup before restore**: A safety auto-backup is now created automatically before restoring from a backup file, protecting against data loss if the restore fails partway through.
- **iCloud restore warning**: When restoring a backup with iCloud Sync enabled, the UI now warns that the restored data will sync to all connected devices.
- **Reduced iCloud log noise**: The iCloud container fallback message now logs once instead of on every API call.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
