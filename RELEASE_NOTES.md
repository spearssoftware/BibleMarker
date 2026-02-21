# BibleMarker v0.8.6

## Diagnostics

- **Write verification**: The Diagnostics button now runs a test write to the iCloud container and reports whether `std::fs::write` and `NSFileManager.fileExistsAtPath` agree on whether the file landed on disk. This will reveal whether writes are silently failing or succeeding but not appearing in directory listings.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
