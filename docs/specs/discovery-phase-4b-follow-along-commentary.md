# Discovery Phase 4b: Commentary that follows the reader

Status: Reviewed
Date: 2026-10-22
Summary: Add a card near the top of the Discover panel that shows the commentary section covering the verse the reader is reading, and switches sections as the reader scrolls.

## Problem and goals

Phase 4 added Matthew Henry's Concise Commentary (MHCC) as the last card in Look closer. Look closer is collapsed by default, so readers do not find the commentary, and when they do, the card lists every section of the chapter, not the one they are reading.

Goals:
- Show the commentary section for the verse the reader is on, near the top of Discover, without the reader doing anything.
- Switch to the next section as the reader scrolls into it, without the text changing while they are reading it.
- Keep the card independent of MHCC, so a second commentary can supply the same card later.
- Make the reader's current verse shared, correct state. Today it is wrong: `NavigationBar` listens for `window` scroll events (`NavigationBar.tsx:175`), but the app shell is `h-[100dvh] overflow-hidden` (`App.tsx:346`) and the verses scroll inside `MultiTranslationView`'s container (`verseContainerRef`, `MultiTranslationView.tsx:730`). The listener never fires on a real scroll; the value only updates when the effect re-runs (chapter change, picker close).

## Non-goals

- Choosing between commentaries, or showing more than one at a time. Deferred until a second commentary exists.
- Switching the card on verse tap or selection. Out of scope for good; tap opens the marking toolbar.
- A phone-only presentation. Out of scope for good; the phone uses the same split layout in vertical orientation and gets the same card.
- Remapping verse numbers between KJV versification and the reader's translation. Out of scope, as in Phase 4.
- Changing the Look closer Commentary card's behavior. It keeps showing the whole chapter; only its block rendering is shared (see Data and interfaces).
- Showing book intros, or chapter intros of chapters that have sections, in the new card. Out of scope for good; both stay in the Look closer card.
- Showing the verse number in the visible navigation-bar label. Out of scope; the label stays `{Book} {chapter}`.
- Modernized commentary text and a "Show original" toggle. Deferred until `spearssoftware/classic-commentaries` publishes a release.
- A remote kill switch for this card alone. Out of scope; Discover's existing kill switch covers it.
- New npm dependencies. Out of scope.

## Users and flows

Users: every reader with Discover enabled (`useDiscoveryEnabled()`), in both discovery mode and inductive mode, on desktop, iPad and phone. Behavior is identical on every platform, in both split orientations, and in both modes.

### Panel position

In `DiscoveryPanel.tsx`, the new card renders immediately after `SettingSection` and before `WorthNoticingCard`. When `SettingSection` renders nothing, the new card is the first card. The rest of the panel is unchanged.

### Main flow

1. The reader opens a chapter with Discover visible, for example Luke 1.
2. Until the first measurement, the current verse is `null` and the card shows the chapter's first section (or the no-section fallback). With the pane scrolled to the top, the first measurement is the chapter's first verse, so the card stays on the first section.
3. The card picks one block for the current verse (rules under Block selection) and shows:
   - Title: `Commentary on {chapter}:{first verse}–{last verse}` (en dash), for example `Commentary on 1:5–25`. For a single-verse section: `Commentary on {chapter}:{verse}`. For a chapter-intro or whole-chapter block: `Commentary on chapter {chapter}`.
   - A muted source line: the commentary's name from its metadata. For MHCC: `Matthew Henry's Concise Commentary · public domain`.
   - The section's outline title on its own line when it is not `null`, for example `Zacharias and Elisabeth`.
   - The block's paragraphs, rendered as in the Phase 4 card: clamped to 3 lines with `Read more` / `Show less`, and tappable marked-up references that open the passage inline. The Phase 4 section header (outline title plus tappable range) is not rendered in this card; the title above replaces it.
4. The reader scrolls the reader pane. Once scrolling stops, the current verse is re-measured. When it falls in a different block, the card switches to that block, collapsed.
5. The reader taps `Read more`, or taps a marked-up reference (which also expands the block, as in Phase 4). The card is now pinned: it keeps its block while the reader scrolls. Tapping `Show less` unpins it, and the card switches at once to the block for the current verse.
6. The reader moves to another chapter. The card unpins, collapses, and shows the new chapter's first section until the first measurement arrives (step 2). That brief first-section state is expected.

### Telemetry

`trackChip` (`src/lib/discoveryTelemetry.ts`) dedupes per event, feature, book, chapter and translation, so each row fires at most once per chapter.

| Event | Feature | When |
|-------|---------|------|
| `discovery_chip_shown` | `commentary_follow` | The card renders with a block |
| `discovery_chip_tapped` | `commentary_follow_more` | `Read more` tapped in this card |
| `discovery_chip_tapped` | `commentary_follow_reference` | A marked-up reference tapped in this card |

The Look closer card keeps its existing features (`commentary`, `commentary_range`, `commentary_reference`).

## Data and interfaces

### Current verse (shared state)

- `currentVerse: number | null` lives in a Zustand store readable by `NavigationBar` and the new card. It is not persisted.
- Measurement, against `verseContainerRef.current` (not `document`, not `window`):
  - Only verse row elements count: `.grid[data-verse]` inside the container. The inline `span[data-verse]` elements from `VerseText.tsx:1001` are ignored.
  - Scrolled to the top (`scrollTop` within 1 px of 0): the chapter's first verse.
  - Scrolled to the bottom (`scrollTop + clientHeight` within 1 px of `scrollHeight`): the chapter's last verse.
  - Otherwise: the row whose vertical center is nearest the container's vertical center.
  - The result is clamped to the loaded chapter's verse range.
- When it is measured:
  - 150 ms after the last `scroll` event on the container.
  - After the chapter's verses render.
  - When the container resizes (a `ResizeObserver` on the container): Discover opening or closing, divider drag, orientation change, font-size change, translations added or removed.
- When it is not measured:
  - While the DOM still shows the previous chapter (keep the guard at `NavigationBar.tsx:132-137`).
  - While a navigation picker is open (keep the guard at `NavigationBar.tsx:128-130`).
- Reset to `null` on chapter change.
- `NavigationBar` drops its own `currentVerse` state and its `window` listener, and reads the shared value where it reads it today: the `aria-label` at line 372 (`{currentVerse || 1}`) and the `currentVerse` passed to the picker at line 488.

### Block selection

A pure function in `src/lib/commentary/` selects the block from a chapter's `CommentaryBlock[]` (`src/lib/commentary/types.ts`) and the current verse:

1. When the chapter has `'section'` blocks:
   - Current verse `null`: the first section.
   - A section whose range contains the verse: that section.
   - Otherwise, the last section whose `startVerse` is less than the verse; when the verse is before the first section, the first section.
2. When the chapter has no `'section'` blocks: the `'whole-chapter'` block if present, otherwise the `'chapter-intro'` block, otherwise nothing.
3. `'book-intro'` blocks are never selected, and `'chapter-intro'` blocks are selected only under rule 2.
4. When nothing is selected, the card renders nothing.

### Commentary metadata (new)

A record in `src/lib/commentary/` keyed by commentary id supplies the source line, so the new card has no commentary-specific strings:

| Commentary id | Source line |
|---------------|-------------|
| `mhcc` | `Matthew Henry's Concise Commentary · public domain` |

`CommentaryBlock.commentaryId` stays typed as the literal `'mhcc'` this phase. The metadata record is keyed by that type, so adding a commentary means widening one union.

Blocks come from the existing `useChapterCommentary(book, chapter)` hook. No change to `src/lib/commentary/mhcc.ts`.

### Shared block rendering

`CommentaryBlockView` in `CommentaryCard.tsx` is shared by both cards. To serve the new card it gains:
- A controlled expanded state (`expanded` and `onExpandedChange`), so the new card knows when it is pinned. A reference tap that expands the block calls `onExpandedChange(true)`.
- The telemetry feature names for `Read more` and reference taps, passed in as props.
- An option to hide the section header (outline title plus tappable range).

The Look closer card passes its current feature names and keeps its own expanded state per block, so its behavior and tests are unchanged. The new card keys the view on `block.id`, so the clamp and any open passage reset on every switch.

### New card

Props: `book`, `chapter`, `translationId`, `translationAbbrev`, as `CommentaryCard`. Keyed on `${book}:${chapter}:${translationId}` so a chapter change resets it. No commentary-specific props or strings.

## Edge cases and failure modes

- **Commentary loading, failed to load, or empty for the chapter:** the card renders nothing. Load errors are already logged by `useChapterCommentary`.
- **Current verse not yet measured:** first section, or the no-section fallback.
- **Verse between sections, or past the last section:** the last section starting before it.
- **Verse before the first section:** the first section.
- **Short first or last section** (Luke 1:1–4, 1:67–80): reachable through the top and bottom rules.
- **Chapter with no sections** (Genesis 36: whole-chapter block; Leviticus 19: chapter intro only): that block, titled `Commentary on chapter {chapter}`, never switching.
- **Chapter with a chapter intro and sections** (Psalm 119): sections only; the intro stays in the Look closer card.
- **Single-verse section:** title `Commentary on {chapter}:{verse}`.
- **Pinned and the reader scrolls far away:** the card keeps its block until `Show less` or a chapter change.
- **Scrolling the Discover panel:** does not move the reader pane, so the current verse and the card do not change.
- **Layout changes without scrolling** (Discover opens, divider dragged, rotation, font size, translation added): re-measured through the container `ResizeObserver`.
- **Picker open:** no re-measurement until it closes.
- **Versification differences:** the card can be one section off where the reader's translation numbers verses differently from MHCC's KJV numbering. Accepted.
- **Discover kill switch off (`discovery-enabled`):** the panel shows "Discover is turned off right now.", so the card does not appear.
- **Chapter shorter than the pane** (no scrolling possible): `scrollTop` is 0, so the current verse is the first verse.

## Constraints

- Deterministic and local. The MHCC data is already bundled. No network calls, no new data files.
- No new npm dependencies.
- Use shared components and `scripture-*` color variables (`CLAUDE.md`). The card uses the existing `DiscoveryCard` chrome.
- Copy uses standard Bible-study terms and never the word "Precept".
- The new card's source file contains no "Matthew Henry" or "MHCC" text, in code or comments.
- The Look closer Commentary card's existing tests pass unchanged.
- Tests:
  - Unit: block selection, covering every rule under Block selection and every Edge case it decides, with fixtures for sections with gaps, a whole-chapter block, a chapter intro only, a chapter intro plus sections, a book intro plus sections, and a single-verse section.
  - Unit: the current-verse measurement rule (top, bottom, nearest center, row-only selection, clamping), with element geometry stubbed.
  - Component (`src/components/Discovery/__tests__/`): the card shows the title, source line and outline title for the selected block; switches when the store's `currentVerse` changes; does not switch while expanded through `Read more` or through a reference tap; switches immediately on `Show less`; renders nothing when blocks are empty or loading; fires the three telemetry rows.
  - Component: `NavigationBar` passes the shared `currentVerse` to its `aria-label` and picker.
  - Panel: `DiscoveryPanel` renders the new card after `SettingSection` and before `WorthNoticingCard`.
  - Real scrolling is verified manually (acceptance criteria 6–8, 12).

## Acceptance criteria

1. `just check` passes.
2. `pnpm vitest run src/components/Discovery src/components/BibleReader src/lib/commentary` passes and includes the tests listed under Constraints.
3. `grep -n -i -E "matthew henry|mhcc" <new card file>` prints nothing.
4. Given Luke 1 open with Discover visible and the reader pane scrolled to the top, then a card titled `Commentary on 1:1–4` with the outline title `The Preface` appears directly below the Setting card, with the source line `Matthew Henry's Concise Commentary · public domain`.
5. Given Luke 1, when the reader scrolls until verse 10 sits mid-pane and stops, then the card's title is `Commentary on 1:5–25` with the outline title `Zacharias and Elisabeth`.
6. Given the iPad in portrait with Discover open (reader in the top pane), when the reader scrolls Luke 1 until verse 30 is mid-pane and then opens the chapter/verse picker, then the picker highlights verse 30 (± 1), and the card shows `Commentary on 1:26–38`.
7. Given the iPad in landscape with Discover open (reader on one side), the same steps as criterion 6 give the same results.
8. Given the desktop app with Discover closed, when the reader scrolls John 3 until verse 16 is mid-pane and opens the picker, then the picker highlights verse 16 (± 1).
9. Given Luke 1 scrolled to the very bottom, then the card shows `Commentary on 1:67–80`.
10. Given the card on Luke 1:5–25, when the reader taps `Read more` and scrolls to verse 60, then the card still shows 1:5–25; when the reader taps `Show less`, then the card shows `Commentary on 1:57–66`.
11. Given Genesis 36, when the reader scrolls anywhere in the chapter, then the card shows `Commentary on chapter 36` and does not switch. Given Leviticus 19, then the card shows `Commentary on chapter 19` with the chapter intro.
12. On the phone with Discover open on Luke 1, the card appears below the Setting card and switches as in criterion 5.
13. Given a pinned card on Luke 1, when the reader moves to Luke 2 at the top, then the card is collapsed and shows Luke 2's first section.
14. The Look closer Commentary card on Luke 1 still lists every section with its tappable range headers.

## Decisions

| Decision | Choice | Why | Decided by |
|----------|--------|-----|------------|
| Card placement | New card right after Setting, before Worth noticing; Look closer card unchanged | Visible without expanding anything; full chapter stays available | User |
| Current-verse rule | Row nearest the center of the reader's scroll container; first verse at the top, last verse at the bottom | Center feels natural; top and bottom rules make short first and last sections reachable | User (center); agent default (top and bottom) |
| Switch timing | After scrolling stops; never while expanded | Text must not change mid-paragraph | User |
| Settle delay | 150 ms after the last scroll event | Existing tracker waits 100 ms; slightly longer avoids switching during momentum scrolling | Agent default |
| Edge tolerance | Within 1 px of top or bottom | Fractional scroll positions on high-DPI screens | Agent default |
| Re-measure triggers | Scroll settle, chapter render, container resize | Layout changes move the center verse without a scroll | Agent default |
| Picker guard | Keep: no measurement while a picker is open | Existing behavior; stops the picker's highlight jumping | Agent default |
| Pinning | Expanded by `Read more` or a reference tap pins; `Show less` unpins | One rule for both ways a block expands | Agent default |
| No-section chapters | Whole-chapter block, else the chapter intro | Still commentary on what is being read | User |
| Intros in chapters with sections | Not shown in this card | Not about the verse being read; Look closer still has them | Agent default |
| Verse tap | Does not switch the card | Tap already opens the marking toolbar | User |
| Phone | Same card and behavior | Phone uses the same split layout | User |
| Card title | `Commentary on {chapter}:{a}–{b}`, `Commentary on {chapter}:{v}`, `Commentary on chapter {n}` | Not tied to Matthew Henry | User (form); agent default (exact strings) |
| Source line | `Matthew Henry's Concise Commentary · public domain` from metadata | Names the source; Phase 4's longer attribution stays on the Look closer card | Agent default |
| Clamp and labels | 3 lines, `Read more` / `Show less` | Same as Phase 4 | User (Phase 4) |
| Multiple commentaries | One source at a time; no picker; `commentaryId` type not widened yet | No second commentary exists yet | User |
| Gaps between sections | Last section starting before the verse; first section before the first range | Always show something relevant | User |
| Modes and kill switch | Both modes; Discover's existing kill switch only | Same as Phase 4 | User |
| Telemetry | `commentary_follow`, `commentary_follow_more`, `commentary_follow_reference`; once per chapter | Separate dedupe keys from the Look closer card | User (names); agent default (reference feature) |
| Shared current verse | Store value measured on `verseContainerRef`; `NavigationBar` reads it | The window listener never fires | User |
| Manual check tolerance | ± 1 verse | Rows near the center line can tie | Agent default |
| Versification | Accept one-section drift | Same as Phase 4 | User |

## Open questions

None.

## Existing code touched

| File | Change |
|------|--------|
| `src/components/BibleReader/NavigationBar.tsx` | Extended: reads shared `currentVerse`; local state and `window` scroll listener removed |
| `src/components/BibleReader/MultiTranslationView.tsx` | Extended: its scroll container drives current-verse measurement |
| `src/stores/bibleStore.ts` (or a new store) | Extended: holds `currentVerse`, not persisted |
| `src/components/Discovery/DiscoveryPanel.tsx` | Extended: renders the new card after `SettingSection`; header comment's card order (line 9) updated |
| `src/components/Discovery/CommentaryCard.tsx` | Extended: `CommentaryBlockView` shared, with controlled expansion, feature-name props and a header option; Look closer behavior unchanged |
| `src/components/Discovery/<new card file>` | New |
| `src/lib/commentary/` | Extended: block-selection function and commentary metadata |
| `src/lib/telemetry.ts` | Extended: `TelemetryFeature` union gains `commentary_follow`, `commentary_follow_more`, `commentary_follow_reference` |
| `src/lib/discoveryTelemetry.ts` | Left alone |
| `src/lib/commentary/mhcc.ts` | Left alone |
| `src/components/Discovery/LookCloserSection.tsx` | Left alone |
