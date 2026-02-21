# BibleMarker v0.8.5

## Bug Fixes

- **Fix iOS sync writes**: On iOS, `std::fs::write` to the iCloud ubiquity container returns success but files never appear or sync. Now uses Apple's `NSFileManager.setUbiquitous` API: writes to a temp file first, then moves it into the iCloud container, which properly notifies the iCloud daemon. macOS continues using direct writes (FSEvents handles change detection there).

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
