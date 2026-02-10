# BibleMarker v0.7.2

## Bug Fixes

- **Fixed iCloud sync not activating on iOS first launch**: The iCloud container may not be materialized when the app first calls the native API. Sync now retries at 3s and 10s delays, giving the OS time to set up the container.
- **Fixed "Sync folder not found" on iOS relaunch**: When iCloud evicts the local sync folder between launches, the app now re-creates it instead of showing an error.
- **Fixed translations not loading on first launch (iOS)**: Removed the legacy iCloud database migration check that blocked database initialization with a slow iCloud API call on startup.

## Improvements

- **Default translation is now KJV**: New installs and the settings dropdown default to KJV instead of "None (no default)".
- **Overlay close button and toolbar fixes**: Unified close button on drag bar, fixed toolbar overlay background.
- **Removed single-translation width cap**: Better use of screen space when viewing one translation.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
