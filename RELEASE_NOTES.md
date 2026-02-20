# BibleMarker v0.8.1

## Bug Fixes

- **iPad sync**: Fixed iPad (and other devices) not appearing in the sync panel on other devices. iCloud does not sync empty folders — devices with no pending changes never wrote their device folder, so they were invisible to other devices. Now a `meta.json` is written immediately on sync initialization so the device is always visible.
- **Timeline**: Fixed timeline only showing entries from chapters you had already viewed. Data was incorrectly persisted in localStorage instead of being loaded fresh from the database on mount.
- **Sync state**: Fixed "Synced just now" showing even when the initial sync snapshot failed, masking the real error.

## Security

- **Filesystem scope**: Removed overly broad `$HOME/**` permission that granted read/write access to the entire home directory (including `~/.ssh`, `~/.aws`, etc.). The specific iCloud paths needed for sync were already covered.
- **Sync path traversal**: Remote device folder names are now validated as UUIDs before being read, preventing path traversal attacks from malicious sync files.
- **Sync operation validation**: Remote sync journal entries with unknown `op` values are now skipped rather than applied.

## Improvements

- **Sync diagnostics**: Added a "Diagnostics" button to the Sync section in Settings, showing schema version, change log counts, and device ID — useful for troubleshooting sync issues.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
