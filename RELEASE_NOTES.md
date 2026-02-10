# BibleMarker v0.7.1

## Bug Fixes

- **Fixed iCloud sync "folder not found" on iOS**: On app relaunch, the iCloud container may not be locally materialized until the native API is called. The sync engine now re-triggers container materialization when the saved folder path isn't found, instead of giving up.

## Improvements

- **iOS CI**: Updated to macOS 26 runner with Xcode 26 / iOS 26 SDK, added icon generation step.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
