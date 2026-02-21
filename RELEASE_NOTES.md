# BibleMarker v0.8.2

## Bug Fixes

- **iPad sync (critical)**: Fixed iPad annotations and data never syncing to other devices. On iOS, the Tauri JS filesystem plugin writes files to the app sandbox rather than the actual iCloud container path. Reads worked (pulling from iCloud's download cache) but writes never reached iCloud. Sync file writes now go through a Rust command that uses direct file I/O, matching how the sync folder path is created.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
