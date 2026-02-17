# BibleMarker v0.7.5

## Features

- **One observation list per keyword per study**: Clicking "Observe" on a keyword now auto-creates or reuses a single observation list for that keyword in the current study. No more duplicate lists.
- **Study-scoped observation lists**: The Add Observation dialog only shows lists belonging to the active study.
- **Create new list from Add Observation**: You can still create a new observation list directly from the Add Observation modal if needed.
- **Clickable verse references in observation lists**: Verse references in the observation panel are now clickable links that navigate to the verse.
- **Improved observation display**: Verse snippets and user observations now have distinct visual styles in the observation panel.
- **Study-scoped places and time expressions**: Places and time tracker entries are now tied to the active study.

## Bug Fixes

- **Verse highlight on search navigation**: Fixed verse not highlighting when navigating from search results.
- **Keyword matching for comma-separated phrases**: Fixed matching for keywords containing commas.
- **Duplicate list prevention**: Added deduplication guards with in-flight request caching to prevent race conditions from creating duplicate observation lists.

## Improvements

- **Simplified context menu**: Merged "Add to List" and "Observe" buttons into a single "Observe" action.
- **Removed verse number observation picker**: Observation lists are now managed through the text selection menu, not the verse number menu.
- **Adjusted marking symbols**: Updated symbol assignments.

---

**Windows:** SmartScreen may warn for unsigned builds. Click **More info** → **Run anyway**.
