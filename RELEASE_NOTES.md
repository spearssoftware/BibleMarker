# BibleMarker v0.7.1

## Bug Fixes

- **Fixed iCloud sync "folder not found" on iOS**: On app relaunch, the iCloud container may not be locally materialized until the native API is called. The sync engine now re-triggers container materialization when the saved folder path isn't found, instead of giving up.

## Improvements

- **iOS CI**: Updated to macOS 26 runner with Xcode 26 / iOS 26 SDK, added icon generation step.
- **iOS minimum version raised to 17.0**: Resolves Xcode 26 Swift compatibility linker errors. Drops support for iOS 16 and earlier (~88% of active devices are on iOS 17+).
- **CI hardening**: Added TypeScript type checking, Vite build verification, Rust checks (cargo check, clippy, fmt), and dependency auditing.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
