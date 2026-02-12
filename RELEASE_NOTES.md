# BibleMarker v0.7.4

## Features

- **Study-scoped Study Tab**: Chapter titles, section headings, theme, observations, interpretations, and applications are now tied to studies. When you select a study, the Study tab shows only that study's content. Clear the study to see global content only.
- **Migration for existing data**: Existing chapter titles and section headings are automatically assigned to your active study (or first study) on upgrade.

## Bug Fixes

- **Study tab refresh**: Section headers and chapter title now clear immediately when you clear the active study, without needing to change chapters.
- **Add sin symbol**: New sin symbol in the marking palette.
- **Remove circled numbers/letters**: Simplified symbol set.
- **Translation cache**: Cache cleared only when preferences sync, not on every sync.

## Improvements

- **Tauri dev/build scripts**: Added `scripts/tauri-dev.sh` and `scripts/tauri-build.sh` using workspace CARGO_HOME for reliable builds in Cursor/IDEs.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
