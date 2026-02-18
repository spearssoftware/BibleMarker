# BibleMarker v0.7.9

## Bug Fixes

- **KJV fallback when translation fails to load**: When a Bible translation (e.g. ESV) fails to load — due to missing API keys, network issues, or a cleared cache — the app now falls back to KJV instead of showing blank text. A notice appears in the translation header so you know which version you're reading.
- **Auto-retry chapters after sync restores API keys**: After iCloud sync completes and API keys become available, chapters that previously failed to load are automatically retried with the correct translation. Previously, you had to manually re-enter your API keys to get translations working after a fresh install or update.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
