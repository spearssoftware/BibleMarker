# BibleMarker v0.8.0

## Features

- **Timeline study tool**: New Timeline tab in Study Tools shows a visual swim-lane chart of time expressions and people with year data. Entries are proportionally scaled on a year axis, with dedicated lanes for chapter time references and person lifespans. Click any entry to navigate to its verse.
- **Year fields on people**: People entries now support year start/end fields (e.g., a king's reign or prophet's ministry duration), displayed as bars on the Timeline.
- **Add Time Expression from verse menu**: Click any verse number and choose "Add Time Expression" to quickly create a time entry tied to that specific verse, with the year field available inline.

## Improvements

- **Group-level year editing**: Years for people and time expressions are edited at the keyword group header level, applying to all matching records across chapters.
- **Per-chapter years for standalone time entries**: Manual time expressions are grouped by chapter so each chapter can have its own year, useful for books like Jeremiah where chapters span different time periods.
- **Timeline verse navigation**: Clicking a timeline entry highlights the verse, scrolls it into view, and minimizes the panel so you can see the highlighted text.
- **Chapter at a Glance**: Now includes auto-highlighted keywords and renders symbols correctly.

## Bug Fixes

- **Text overlap on window resize**: Fixed verse annotations overlapping when resizing the window.
- **Short-word selection**: Fixed keyword matching for short words like "he" incorrectly matching inside "the" or "When".
- **Previously used bar removed**: Removed redundant bottom bar, as the context menu already provides this functionality.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
