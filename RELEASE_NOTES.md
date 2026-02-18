# BibleMarker v0.7.6

## Features

- **People tracker**: New observation tool for people and characters. Use 👤 or 👥 symbols to mark people keywords; they auto-populate in the People tab. Supports keyword grouping, Populate from Chapter, and full CRUD like Time and Places.
- **Time expressions: optional year**: Add a year (e.g., 233, 586, 33) with AD/BC radio buttons. Era defaults to BC in Old Testament books and AD in New Testament books.
- **Timeline**: Time tool shows a horizontal timeline at the top when years are set. Chronological order (BC before AD) with verse references.
- **Group by keyword**: Time, Places, and People now group entries by keyword (like observation lists). Collapsible sections per keyword; "Manual" for entries without a preset.
- **Populate from Chapter**: Time, Places, and People each have a "Populate from Chapter" button to manually re-run keyword-based auto-populate for the current chapter.

## Bug Fixes

- **Tauri init race**: Fixed "Cannot read properties of undefined (reading 'invoke')" on app launch. Database init now waits for Tauri internals before loading SQLite.
- **People in auto-backup**: People data is now included in automatic backups.

## Improvements

- Observation tools reorganized: Time and Places grouped by keyword; People tool mirrors Time/Places functionality.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
