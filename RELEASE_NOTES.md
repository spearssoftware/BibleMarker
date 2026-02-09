# BibleMarker v0.6.9

## Bug Fixes

- **Fixed update link not opening**: Clicking "A new version is available" in Settings did nothing on the desktop app. Added the Tauri opener plugin so external links open in the system browser.

## Improvements

- **About section moved to top of Help tab**: Version info and update check are now the first thing you see when opening Settings → Help, making it easier to check which version you're on.
- **Migrated iCloud FFI to objc2**: Replaced the deprecated `objc` (0.2) crate with `objc2` for safer, memory-managed Objective-C bindings in iCloud sync code.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
