# Read mode

Status: Reviewed
Date: 2026-11-13
Summary: Read mode reopens on the verse the reader left, puts text settings one tap away in an "Aa" panel, and hides the top bar while reading.

This is Phase 3 of the three-modes roadmap. It builds on `docs/specs/three-modes-foundation.md` (Phase 2), which created the Read, Discover and Study modes.

## Problem and goals

Read mode today is the Study screen with tools removed. The top bar never hides. Text settings are spread through Settings › Appearance. The app reopens on the last chapter but at verse 1. A band naming the translation sits above the text even when there is only one translation.

Goals:

1. The app reopens on the verse the reader was on, on that device.
2. Font size, font, theme and verse numbers are reachable in one tap from the reader, in every mode.
3. In Read, the top bar and chapter arrows get out of the way while reading and come back when asked for.
4. In Read with one translation, no band naming the translation sits above the text. (A chapter title, where one exists, still shows.)

The work ships as three stacked PRs into `discovery`, in this order:

- **3a.** Saved verse position.
- **3b.** "Aa" panel, the verse-numbers option, and the translation band rule.
- **3c.** Hiding top bar.

## Non-goals

Deferred to a later phase:

- Flowing paragraphs. Each verse stays on its own row. A paragraph layout means rebuilding the reader's row-per-verse grid, which verse tracking, marks and side-by-side translations depend on.
- A finer font-size control. The four sizes stay.
- A visible "Continue reading" card or screen. It arrives with reading plans (Phase 4).
- Syncing the reading position between devices.
- Showing one translation by default on phones in Read. It needs a decision on how the reader's translation choice is remembered per mode. See Open questions.
- Icon, spacing and color changes to the reader. That is Phase 6.

Out of scope for good:

- Hiding the top bar in Discover or Study.
- Using the `reading_history` table. It stays unused.

## Users and flows

### 3a. Reopening on your verse

1. The reader scrolls through John 3 and stops with verse 16 in the middle of the screen.
2. They quit the app.
3. They open it again. John 3 loads with verse 16 in the middle of the screen. Nothing is highlighted and nothing animates.

Rules:

- The saved verse is the one the reader's current-verse tracking already reports (the verse nearest the middle of the text area).
- It is restored once per launch, for the chapter the app reopens on. Moving to another chapter during a session starts at the top, as today.
- It is restored in every mode.
- Navigation that names a verse (search result, cross-reference, verse picker) wins over the saved verse.
- The position is per device. It is one position, not one per translation or per book.
- "The middle" is the middle of the visible text area, the same measure the tracking uses. A verse too near the start or end of a chapter to reach the middle is brought as close as the chapter allows; it must be fully on screen.

Ordering rules the implementation must hold, because the reader already scrolls itself in several places:

- The saved verse is read once at startup, before verse tracking can report anything. Tracking reports verse 1 (or nothing) while a chapter is loading at the top; that must not overwrite the saved verse. Nothing is saved until the restore has either happened or been skipped.
- The restore happens after the chapter's verses are on screen and after the existing reset to the top that runs when a chapter opens.
- The restore is skipped if, before it happens, the reader scrolls by touch, wheel, trackpad or keyboard, or anything navigates to a named verse (`bibleStore.navigateToVerse`, `highlightVerse`, a search result). Scrolling done by the app itself does not count as the reader scrolling.
- Every way of changing book or chapter clears the saved verse: `setLocation`, `nextChapter`, `previousChapter`, `goBack` and `navigateToVerse` to another chapter.

### 3b. The "Aa" panel

Opening it:

- Wide layouts (the same landscape ≥768px rule the mode switch uses): an "Aa" button in the top bar, to the left of the mode switch. Its accessible name is "Text options".
- Narrow layouts: a "Text options" item in the ⋯ menu, above "Settings". The top bar has no room for another button at phone width.
- It is available in Read, Discover and Study.

The panel is a popover anchored to its trigger, like the mode menu. It closes on a tap outside, on Escape, and when another top-bar menu opens. It holds, in order:

| Control | Label | Options |
|---|---|---|
| Segmented control | "Font Size" | "Small", "Medium", "Large", "Extra Large" |
| Font list | "Scripture Font" | "Crimson Pro", "Lora", "Merriweather", "Literata", each shown in its own face |
| Segmented control | "Theme" | "Dark", "Light", "Auto" |
| Toggle | "Verse numbers" | on or off; shown only in Read |

Each change applies at once and is saved the way that setting is saved today.

Settings › Appearance afterwards:

- "Font Size" and "Scripture Font" are removed from it.
- "Theme", "High Contrast Mode" and the Study-only symbol settings stay.
- Theme is therefore in two places. Both must show the same value at all times, including when Settings is open as a side panel while "Aa" changes the theme. Today the theme and High Contrast values live only inside the Settings panel, so they need one shared home.
- Changing the theme in "Aa" never changes High Contrast Mode.
- The panel shows the saved font as selected after a relaunch. Today the saved font is applied at startup but not loaded into app state, so Settings shows "Crimson Pro" selected whatever was saved; that is fixed here.

Verse numbers:

- The option applies in Read only. Discover and Study always show verse numbers, because their verse menu holds cross-references, Hebrew/Greek and the study actions.
- It is on by default.
- With it off in Read, the verse numbers are not shown and the verse menu cannot be opened. Existing notes still show. Adding a note needs verse numbers on, or another mode.
- Switching mode shows or hides the numbers at once. The reader's choice is kept for the next time they are in Read.
- Marks, verse tracking, the saved verse and jumps to a verse work the same with numbers off.

The translation band:

- In Read, when exactly one translation is showing, has loaded and has no error, the band naming it is not shown. The translation's short name is already on the top-bar chip.
- While that translation is loading, or shows an error or the KJV fallback notice, the band is shown as today.
- With two or three translations, and in Discover and Study, the band is unchanged.

### 3c. Hiding top bar

Applies in Read only, at every screen size.

- The top bar and the two chapter arrows hide when the reader scrolls down through the text.
- They return when the reader:
  - scrolls up;
  - reaches the top of the chapter;
  - taps the text somewhere that does nothing else (not a marked word, not a verse number, not a link, and not the end of a text selection);
  - moves keyboard or screen-reader focus into the top bar;
  - presses Cmd/Ctrl+F.
- They stay shown while any of these is open or showing: a top-bar menu or picker (including "Aa"), search, a side panel, the marking sheet, the Welcome screen, the translation library, the tour, or a banner (update, three-modes).
- They are shown after every chapter change and after every mode change.
- Hiding and showing do not move the text. The bar overlays the text area instead of resizing it. The first verse of a chapter is never underneath the bar while the reader is at the top.
- A tap that reveals the bar does nothing else. A tap that does something else (opens the mark editor for a marked word, opens the verse menu, closes a menu or sheet, clears a text selection) does not also reveal the bar.
- A tap on the text never hides the bar.
- Swiping left or right to change chapter works whether the bar is shown or hidden.
- With "Reduce Motion" on, the bar appears and disappears without sliding or fading.
- While hidden, the bar's controls stay reachable by keyboard and screen reader; focusing one shows the bar.
- Banners (update, three-modes) look and behave as today; because the bar stays shown while one is showing, they never end up under it or detached from it.
- While the bar is hidden, the area behind the iOS status bar is the page background color, so text never shows behind the clock.

## Data and interfaces

- **Saved verse (3a).** One number stored on the device next to the current book and chapter (`bibleStore`'s persisted state, localStorage key `bible-reading-state`). It is cleared when the book or chapter changes and filled again as the reader scrolls. It is not written to SQLite and not synced.
- **Verse numbers (3b).** A new optional field `showVerseNumbers` on the preferences row (`src/types/preferences.ts`). Absent means on. It travels with the other text settings in the synced row. Like font and size today, a value that arrives by sync takes effect on the next launch, not live. It is not added to `DEFAULT_PREFERENCES`.
- **Font size, font, theme.** No change to where they are stored.
- **No schema change, no new table, no new synced table.**
- **Telemetry.** None added.

## Edge cases and failure modes

- **Saved verse no longer exists** (the reader switched to a translation where the chapter has fewer verses): open at the top of the chapter.
- **Saved verse is 1, or nothing is saved:** open at the top.
- **Chapter fails to load or falls back to KJV:** restore the verse if that verse exists in what loaded; otherwise open at the top.
- **Stored value is not a positive whole number** (hand-edited or corrupt): ignore it.
- **The reader scrolls before the restore happens:** the restore is skipped. It never pulls the reader back.
- **Welcome screen or tour on first launch:** nothing is saved yet, so nothing is restored.
- **A sync changes the preferences row while the app is running:** text settings on screen do not change until the next launch; a change the reader makes afterwards is saved as usual.
- **Mode changes to Discover or Study while "Aa" is open:** the "Verse numbers" toggle disappears from the panel and numbers show.
- **Translation count changes from one to two in Read:** the band appears.
- **Very short chapter that does not scroll** (for example Psalm 117): the bar never hides.
- **Bar hidden, then the device rotates or the window resizes:** the bar is shown.
- **Bar hidden when a side panel opens** (the mark editor from a tapped word, Settings from a shortcut): the bar is shown and stays shown while the panel is open.
- **iOS rubber-band scroll at the top or bottom of a chapter:** does not flicker the bar.
- **Text selection:** dragging to select does not hide or reveal the bar; the marking sheet opening keeps it shown.

## Constraints

- Stack and conventions as in `CLAUDE.md`: shared components, `scripture-*` colors, `@/` imports, no new dependencies.
- User-facing copy says "inductive", never "Precept", and uses standard Bible-study terms.
- The top bar keeps its safe-area padding on notched devices, shown or hidden.
- Mode checks go through `src/lib/appMode.ts`; the wide/narrow rule is the existing `panelStore.orientation`.
- Study and Discover behave exactly as before this phase, apart from gaining "Aa" and losing two rows from Settings › Appearance.
- Tests, each shipped in the PR that changes the behavior:
  - 3a: unit tests for saving, clearing on chapter change, ignoring bad stored values, and the "reader scrolled first" skip.
  - 3b: component tests for the panel's controls per mode, the two entry points by layout, the Settings rows removed, the verse-number rule per mode, and the band rule (one translation, loading, error, two translations, other modes).
  - 3c: unit tests for the show/hide rules as a pure function or hook (scroll direction, top of chapter, the "stay shown" list, mode other than Read), plus a component test that focus inside the bar shows it.
  - `just check` passes on each PR.
- Each PR is checked in the iOS Simulator at phone portrait and iPad landscape before it is handed over.

## Acceptance criteria

3a

1. Given John 3 scrolled so verse 16 is nearest the middle, when the app is quit and reopened, then John 3 is showing, all of verse 16 is on screen, verse 1 is not, and no verse is tinted.
2. Given the app reopened as in 1, when the reader goes to John 4 and back to John 3, then John 3 opens at the top.
3. Given a saved verse of 30 and a chapter that loads with 25 verses, when the app opens, then the chapter is at the top.
4. Given localStorage `bible-reading-state` edited so the saved verse is `"abc"`, when the app opens, then the chapter is at the top and no error is logged.
5. Given John 3 open at the top on launch with a saved verse of 16, when the reader scrolls by hand before the text has moved, then the app does not move the text afterwards.

3b

6. On iPad landscape in each mode, the top bar has a button with the accessible name "Text options" showing "Aa"; on iPhone portrait the top bar has no such button and the ⋯ menu lists "Text options" directly above "Settings".
7. The panel shows "Font Size", "Scripture Font" and "Theme" in every mode, and "Verse numbers" only in Read.
8. Choosing "Large" changes the text size at once; after quitting and reopening, the text is still Large and the panel shows "Large" selected.
9. Settings › Appearance has no "Font Size" and no "Scripture Font" heading, and still has "Theme". On iPad landscape with Settings open on that tab, choosing "Light" in "Aa" shows "Light" selected in Settings too, and High Contrast Mode keeps its value.
9a. After choosing "Lora" and relaunching, the text is in Lora and the panel shows "Lora" selected.
10. In Read with "Verse numbers" off, no verse number is visible; switching to Discover shows them; switching back to Read hides them again.
11. In Read with "Verse numbers" off, a highlight made by selecting text appears on the selected words.
11a. Criterion 1 passes with "Verse numbers" off.
12. In Read with one loaded translation, the band with the translation's full name is not in the page; with two translations it is; in Study with one translation it is.

3c

13. In Read on a chapter longer than the screen, scrolling down hides the top bar and both chapter arrows; scrolling up shows them.
14. With the bar hidden, tapping plain text shows the bar and opens nothing; tapping a marked word opens the mark editor and the bar is shown while it is open.
15. With the bar hidden, the scroll position of the text (`scrollTop` of the verse container) and that container's height are the same immediately before and after the bar is revealed by a tap. Checked in a component test and by eye in the simulator.
16. In Discover and Study, scrolling never hides the top bar.
17. With the bar hidden, pressing Tab until focus lands on a top-bar control shows the bar; pressing Cmd/Ctrl+F shows the bar and opens search.
18. With `prefers-reduced-motion: reduce` matching (iOS "Reduce Motion" on), the bar hides and shows with no transition. The app has no reduced-motion handling today, so this is new.
19. In Read on Psalm 117 at phone size, the bar never hides.
20. `just check` exits 0 on each of the three branches.

## Decisions

| Decision | Choice | Why | Decided by |
|---|---|---|---|
| What "done" means | Reopen on your verse; only text while reading; text settings in one tap | Round 1 recommendation | user (accepted recommendation) |
| Where "Aa" is offered | All three modes | Text settings are not a Read-only concern | user (accepted recommendation) |
| Where the top bar hides | Read only | Discover and Study keep their tools in it | user (accepted recommendation) |
| Paragraph layout | Deferred; verse-numbers option only | Rebuilding the reader grid is the largest cost and risk | user (accepted recommendation) |
| Font sizes | Keep the four steps | Enough for this phase | user (accepted recommendation) |
| "Continue reading" | Reopen on the exact verse, per device; no card | A card belongs with reading plans | user (accepted recommendation) |
| Delivery | Three stacked PRs: 3a, 3b, 3c | Safest first, gesture work last | user (accepted recommendation) |
| "Aa" entry on phones | "Text options" in the ⋯ menu | No room in the top bar at phone width | agent default |
| Settings › Appearance | Loses "Font Size" and "Scripture Font"; keeps "Theme" | One home for text settings; theme also belongs with High Contrast | agent default |
| Verse numbers scope | Read only; always shown in Discover and Study | Their verse menu needs the number as its handle | agent default |
| Verse numbers storage | Synced preferences row, with the other text settings | Same kind of setting as font and size | agent default |
| Saved verse storage | Device localStorage beside book and chapter | Matches where the chapter is saved; no sync cost | agent default |
| Restore placement | Saved verse in the middle of the text area, no tint, no animation | Mirrors how the verse is measured | agent default |
| Translation band in Read | Hidden for one loaded, error-free translation | The chip already names it; errors must stay visible | agent default |
| Bar while hidden | Overlays the text; text never moves | A resizing text area makes the page jump | agent default |
| Chapter arrows | Hide and show with the top bar | They are chrome too | agent default |

## Open questions

1. **Adding a note with verse numbers off.** In Read, the verse number is the only way to add a note. With numbers off, notes cannot be added. Accept that, or add "Add note" to the marking sheet? (Kevin)
2. **How far the reader scrolls before the bar hides.** No distance is specified, so criterion 13 has no threshold. The plan for 3c proposes one and it is tuned in the simulator. (Kevin, at 3c review)
3. **One translation on phones in Read.** The roadmap lists it. Should Read on a phone show only the first translation while the others stay selected for Discover and Study, or should it be left as the reader's own choice? (Kevin)
4. **Theme in two places.** Keep it in both "Aa" and Settings › Appearance, or only in "Aa"? Only in "Aa" is less work, since the two copies then need no shared state. (Kevin)
5. **Help text.** Settings › Help says "Click verse numbers to add inline notes (supports Markdown)". Leave it, since numbers are on by default, or reword it for Read? (Kevin)

## Existing code touched

| File | Change |
|---|---|
| `src/stores/bibleStore.ts` | Extended: saved verse in the persisted state |
| `src/stores/readingPositionStore.ts`, `src/hooks/useCurrentVerseTracker.ts` | Read from; extended only as needed to save and restore |
| `src/components/BibleReader/MultiTranslationView.tsx` | Extended: restore on launch, band rule, verse-number rule, bar reveal tap |
| `src/components/BibleReader/VerseText.tsx` | Extended: verse number can be hidden |
| `src/components/BibleReader/NavigationBar.tsx` | Extended: "Aa" button, "Text options" menu item, hide/show |
| New "Aa" panel component under `src/components/BibleReader/` | New |
| `src/components/Settings/AppearanceSection.tsx` | Two sections removed; their controls reused by the panel |
| `src/types/preferences.ts` | Extended: `showVerseNumbers` |
| `src/stores/annotationStore.ts` | Extended: holds the verse-numbers setting with the other text settings; the saved font is loaded into it at startup; `toolbarVisible` left alone |
| `src/components/Settings/SettingsPanel.tsx`, `src/lib/theme.ts` | Extended: theme and High Contrast values move to a shared home |
| `src/components/MarkingToolbar/Toolbar.tsx` | Extended: chapter arrows follow the bar |
| `src/components/SplitLayout/SplitLayout.tsx`, `src/App.tsx` | Extended: top bar overlays the text area in Read |
| `src/lib/appMode.ts` | Extended: mode rules for the bar and verse numbers |
| `src/lib/database.ts`, `src/lib/sqlite-db.ts` (`reading_history`) | Left alone |
