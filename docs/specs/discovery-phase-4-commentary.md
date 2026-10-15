# Discovery Phase 4: Commentary

Status: Reviewed
Date: 2026-10-13
Summary: Add a commentary card at the end of the Discover panel's Look closer section that shows the original public-domain text of Matthew Henry's Concise Commentary for the current chapter, bundled with the app.

## Problem and goals

The Discover panel (`src/components/Discovery/DiscoveryPanel.tsx`) orients the reader with setting, facts, and cross-references, but it offers no voice that comments on the passage itself. The planned source of modern commentary, the `spearssoftware/open-commentaries` dataset, has no modernized text yet (Stage 0). This phase fills the gap now with the original text of Matthew Henry's Concise Commentary (MHCC), which is public domain and covers the whole Bible.

Goals:
- Give every Discover reader a classic commentary on the chapter they are reading, offline, from first launch.
- Let the reader move from a commentary section to the verses it covers, and read verses Henry cites without losing their place.
- Shape the card's data so a later phase can swap in other commentaries or open-commentaries' modernized text without redesigning the card.

Content principle: Phase 3's rule that Discover shows factual setting but no interpretation stays in force for every other card. The commentary card is the one deliberate exception. It is interpretation by design, so it is always attributed to Henry by name and placed inside Look closer, after the reader's own observation cards.

Success is judged by the product owner's manual read of the passages listed in the acceptance criteria. There is no numeric target.

## Non-goals

- Modernized commentary text. Deferred until open-commentaries publishes a release.
- Choosing between commentaries, or showing more than one. Deferred; the product owner may add commentaries later. This phase ships MHCC only.
- A "Show original" toggle. Deferred to the phase that brings in modernized text.
- Correcting MHCC's verse-range errors. Deferred: open-commentaries keeps a corrections table, and its data will replace MHCC. This phase shows the module's linked ranges as they are. Known cases: John 3:1 is linked to 3:1–8 but comments on 3:1–21; 1 Samuel 25:32–44 is labelled 32–39; Psalm 95:1–11 is labelled 1–7.
- Making plain-text references tappable (for example "ch. 1:13" or "ver. 5" written without markup). Out of scope; only references the module marks up are tappable.
- Remapping verse numbers between KJV versification and the reader's translation. Out of scope, as with cross-references.
- Replacing the hand-authored book intros in Setting with MHCC's book introductions. Out of scope; Setting stays the neutral facts layer.
- Per-chapter AI-generated setting text (listed as Phase 4 in the Phase 3 spec). Not in this phase; still deferred.
- Offering MHCC for download, or listing it anywhere as a translation. Out of scope for good.
- A separate remote kill switch for the card. Out of scope; Discover's existing kill switch covers it.
- Any change to `worker/`. Not needed: the worker's telemetry feature pattern (`^[a-z0-9_-]{1,32}$`) already accepts the new feature names.
- New npm dependencies. Out of scope.
- End-to-end tests. Out of scope; the manual read covers the experience.

## Users and flows

Users: every reader with Discover enabled (`useDiscoveryEnabled()`), in both discovery mode and inductive mode. The card behaves the same in both modes; it lives inside Look closer, so it inherits that section's per-mode default open state.

### Panel position

Look closer's order becomes: Repetition (`RepetitionCard`), Connectors (`ConnectorsCard`), Look-Again (`LookAgainCard`), Commentary (new). The rest of the panel is unchanged.

### Main flow

1. The reader opens Discover on a chapter and expands Look closer (or it is already open).
2. The card shows the title `Matthew Henry's Concise Commentary` and, beneath it, the muted line `Public domain · abridged from Matthew Henry's Exposition`.
3. Below that, blocks in this order (each block type is defined under Data and interfaces):
   1. **Book introduction.** Chapter 1 only. No heading.
   2. **Chapter introduction.** No heading.
   3. **Whole-chapter commentary.** No heading, no range tap.
   4. **Sections.** One block per section in this chapter, in verse order. Each has a heading:
      - `{outline title} · {chapter}:{first verse}–{last verse}` when the chapter has an outline title for that section, for example `Zacharias and Elisabeth · 1:5–25`.
      - `{chapter}:{first verse}–{last verse}` when it has none.
      - `{chapter}:{verse}` (with or without the title prefix) for a single-verse section.
4. Each block is clamped to 3 lines followed by `Read more`. Tapping `Read more` shows the whole block, and the link becomes `Show less`. A block whose full text fits within 3 lines shows no link. Every block returns to clamped when the chapter changes.
5. The chapter outline itself is never shown as a list; its titles appear only as section headings.

### Secondary flows

- **Range tap.** Tapping a section heading's verse range jumps the reader to the section's first verse (`navigateToVerse`). The outline title is not a tap target.
- **Reference tap.** Tapping a marked-up reference in a block (for example `Ac 16:10`) expands that passage inline, directly below the paragraph that contains it, in the reader's current translation. If the block is clamped, the tap also expands the block.
  - While loading: `Loading…`
  - On success: the verse text of the passage (see "Inline passage" under Data), then a secondary button `Go to {label}` that navigates the reader to the passage's first verse. `{label}` comes from `formatCrossRefTarget` (`src/lib/chapterAnalysis/crossRefs.ts`), for example `Go to Acts 16:10`.
  - On fetch failure: `Couldn't load that passage.`
  - When the current translation does not contain the passage: `This passage isn't in {translation abbreviation}.` and no `Go to` button.
  - Tapping the same reference again collapses it. Only one inline passage is open per block; opening another reference in the same block replaces it.
  - On a network translation (ESV), nothing is fetched until the reader taps a reference; the tap is their consent, as with cross-references.

## Data and interfaces

### Source and bundling

- The CrossWire SWORD module `MHCC`, downloaded once by the implementer from `https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/MHCC.zip`. Version 2.0 (SwordVersionDate 2021-02-14), `DistributionLicense=Public Domain`.
- The upstream zip is bundled unmodified as `src-tauri/resources/sword-MHCC.zip`. Its SHA-256 is `7d2f6365ca95e7086911431dabef5d874acb4f03bf659f808ae18171b8d8e149` (retrieved 2026-10-14). CrossWire regenerates the zip, so its hash drifts from the `8fa571b0…61074f` that open-commentaries recorded on 2026-10-12. The six module data files (`{ot,nt}.{bzs,bzv,bzz}`) match the per-file hashes in open-commentaries' `sources/manifest.json` exactly; only the computed `InstallSize` line in `mods.d/mhcc.conf` differs. If a future refresh changes any data file hash, stop and ask the product owner.
- The zip must be committed: add `!src-tauri/resources/sword-MHCC.zip` next to the existing ASV exception in `.gitignore` (line 63 ignores `src-tauri/resources/sword-*.zip`).
- Add it to `bundle.resources` in `src-tauri/tauri.conf.json` and to the resource installs in `flatpak/app.biblemarker.BibleMarker.yml` (beside the ASV and gnosis entries, around lines 112–113).
- It installs into `{appDataDir}/sword/` through the existing `install_bundled_module` Tauri command, with the same delete-and-reinstall-once retry the bundled ASV gets on a failed load.
- Format: zCom commentary, `BlockType=BOOK`, `CompressType=ZIP`, `SourceType=OSIS`, `Versification=KJV`. Files: `modules/comments/zcom/mhcc/{ot,nt}.{bzs,bzv,bzz}` and `mods.d/mhcc.conf`. The existing `loadFromZip` / `discoverFiles` in `src/lib/bible-api/sword-ztext.ts` accept this layout. Its verse-slot layout matches the app's KJV `BIBLE_BOOKS` (24,115 OT slots, 8,246 NT slots). `mhcc.conf` has no `Abbreviation` line, so `parseConf` cannot supply the module id; the id is fixed in code.

### Not a translation

MHCC must not appear in anything that lists translations or modules. It must not be added to `MODULE_REGISTRY` in `src/lib/bible-api/sword.ts`, because that registry feeds `SwordClient.getTranslations()` / `getAllTranslations()`, `getAvailableModules()` (the module download list in ModuleManager / BibleSection), and `isModuleBundled()`. The bundled install and load path must work for a non-registry module. The approach is the implementer's choice (for example, a separate non-translation entry, or install helpers that take a resource name).

### Reading the module

`getVerseRaw` in `sword-ztext.ts` reads verse slots only. This phase also needs:
- Book heading slots and chapter heading slots (the slots before each book's and each chapter's first verse).
- Linked runs: consecutive verse slots holding the same block, offset, and size are one entry, and the run's first and last slots are the entry's verse range. A slot of size 0 is empty and belongs to no entry. An entry pointer that reappears after a different pointer or an empty gap is an error. The current data has none; the reader must throw on it. `open-commentaries/src/sources/sword.ts` is a reference implementation of this rule.
- No entry's linked range crosses a chapter boundary in the current data. The derivation treats a crossing run as an error and logs it, then drops that entry.

New code lives in a new folder, `src/lib/commentary/`. A hook (`useChapterCommentary` in `src/hooks/`) loads one chapter's blocks for the card. Exact file split is the implementer's choice.

### Block derivation

All rules below apply to the decompressed OSIS text of an entry or heading slot.

Terms:
- **Preverse part**: the text before the `<div type="x-milestone" subType="x-preverse" eID="…"/>` milestone. An entry with no such milestone has no preverse part.
- **Label**: a `<hi type="bold">Verses N-M</hi>` or `<hi type="bold">Verse N</hi>` element.
- **Prose**: text that remains after the markup rules below, ignoring whitespace-only results.

Blocks for chapter C of book B:
1. **Book introduction** (C = 1 only):
   - Books other than Obadiah, Philemon, 2 John, 3 John, and Jude: the prose inside `<div type="introduction">` that appears in the preverse part of the book's first entry, before the first `<title type="x-s2">` (`Chapter N`) element.
   - Obadiah, Philemon, 2 John, 3 John, and Jude: the prose of the chapter-1 heading slot. (Their book heading slot holds only a `<title type="main">` element.)
2. **Chapter introduction**: the prose of the chapter's first entry that sits after its preverse part and before its label, plus, for any book except the five above, the prose of chapter C's heading slot. Examples: Psalm 119 has one; Leviticus 19 and Psalm 108 have no verse entries at all, so their whole commentary is the chapter heading slot's prose. About 21 chapters have a chapter introduction once outlines are removed; John 3 does not.
3. **Whole-chapter commentary**: an entry in chapter C with no label. About 119 chapters have one, linked to verse 1 only, for example Genesis 36 and Exodus 22. Its prose (minus anything already taken by rule 2) is one block with no heading.
4. **Sections**: every other entry whose range is in chapter C, ordered by first verse. Its range is the linked range, regardless of what its label says.

The card is not rendered when all four produce nothing.

### Outline titles

A chapter's outline gives a title to each section. It comes in two forms, both in the first entry's text for the chapter:
- **Table**: `<row><cell>{title}</cell><cell>({range})</cell></row>`, where `{range}` is `N-M` or `N`.
- **Plain text** (about 110 chapters, for example Genesis 21 and Exodus 12): consecutive `x-p` paragraphs, each paragraph matching `^\(\d+(-\d+)?\)$`, together with the paragraph immediately before it as the title. A plain-text `Chapter Outline` paragraph comes before them.
- **One paragraph** (about 190 chapters, mostly the prophets, Ecclesiastes and Song of Solomon, for example Isaiah 2 and Ecclesiastes 1): a single paragraph made up only of `{title} ({book abbreviation} {chapter}:{range})` segments, all in the same chapter, with or without reference markup, for example `The conversion of the Gentiles, Description of the sinfulness of Israel. (Is. 2:1-9) The awful punishment of unbelievers. (Is. 2:10-22)`. Each segment is a row keyed by the first verse of its range. Added during implementation under the plain-text outline decision; without it these paragraphs showed as chapter introductions.

A section's title is the outline row whose range starts at the section's first verse; `null` when no row starts there (about 635 sections, most of them in Proverbs, for example the sections of Proverbs 10 and the section starting at John 5:30). The title is trimmed and loses a trailing `.`, `--`, `;` or `,`. Run-together titles from the source (for example "The baptism of John of Christ John's testimony") are shown as they are.

### Markup rules

- `<reference osisRef="…">text</reference>` becomes a reference run: display text and `osisRef`. Adjacent references stay separate runs (in Luke 1, `Ac 16:10` and `11` are two runs).
- These are removed together with their text: every `<title>` element (types `x-ms`, `main`, `x-s2`, `x-IS`), every label, every outline table, and every plain-text outline paragraph including the `Chapter Outline` paragraph. A label's verse list that the source left outside the bold element (17 entries, for example `Verse 7` followed by `,8`, or `Verses 24-30` followed by `, 36-43` in Matthew 13) is part of the label and is removed with it.
- Every other tag is removed and its text kept, including `div` (`introduction`, `x-p`, milestones), `milestone`, `hi`, and `chapter`.
- Paragraph breaks come from `x-p` divs. Whitespace inside a paragraph collapses to single spaces.
- XML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`) are decoded.
- An `osisRef` whose book id is not in the app's `BIBLE_BOOKS` renders as plain text. (All references in the current module use valid ids; this is covered by a synthetic fixture.)
- An `osisRef` without a verse (chapter-only) renders as plain text, because it cannot open inline. (None exist in the current module.)
- Two typographic cleanups apply to all text: `--` becomes `—`, and the source artifact `#(` becomes `(` (35 occurrences, for example "ver. #(2)").

### Block shape

Keyed by commentary id so other commentaries can supply the same shape later:

| Field | Meaning |
|---|---|
| `commentaryId` | `'mhcc'` |
| `kind` | `'book-intro'`, `'chapter-intro'`, `'whole-chapter'`, or `'section'` |
| `book`, `chapter` | The chapter this block belongs to |
| `startVerse`, `endVerse` | The linked range for `'section'`; `null` otherwise |
| `title` | Outline title for a `'section'`, or `null` |
| `paragraphs` | Each paragraph is an ordered list of runs: `{ text }` or `{ text, osisRef }` |

### Inline passage

Expanding a reference shows:
- For `osisRef` of one verse: that verse.
- For a range within one chapter whose end is at or after its start: every verse in the range, uncapped.
- For any other range (crossing chapters, or end before start, as in the source's `Jer.50.1-Jer.3.8`, `Jer.50.4-Jer.7.17`, `Exod.13.2-Exod.10.13`): the first verse only, and the `Go to` label names the first verse only.

Text is fetched with the app's normal chapter fetch for the current translation (`fetchChapter`), with a per-session chapter cache and with results discarded when the reader's book, chapter, or translation changes before they arrive. `useCrossRefPassages` is the pattern to mirror but cannot be reused as is: it is built around `ChapterCrossRef`, caps passages at 3 verses, and reads same-chapter ranges only.

"Not in this translation" means the fetch resolves with none of the requested verses, or throws the SWORD client's empty-chapter `BibleApiError` (the "returned no verses" error from `SwordClient.getChapter`). Any other error is a fetch failure.

### Telemetry

Uses the existing opt-in counters through `trackChip` (`src/lib/discoveryTelemetry.ts`) with the chapter scope. New `TelemetryFeature` values in `src/lib/telemetry.ts`:

| Event | Feature | When |
|---|---|---|
| `discovery_chip_shown` | `commentary` | The card renders with at least one block |
| `discovery_chip_tapped` | `commentary` | `Read more` tapped |
| `discovery_chip_tapped` | `commentary_range` | A section's verse range tapped |
| `discovery_chip_tapped` | `commentary_reference` | A reference tapped to expand it |

`trackChip`'s local dedupe key is event, feature, book, chapter, and translation, so each counts at most once per chapter and translation. That is intended.

## Edge cases and failure modes

- **No commentary for the chapter.** All four block rules produce nothing: the card is not rendered.
- **Module fails to install or load, or an entry fails to parse.** The card is not rendered and the error is logged with `console.error`. The reader sees no message. Other Discover cards are unaffected.
- **Loading.** The card renders nothing until the chapter's blocks are ready. No spinner.
- **Very long chapters (Psalm 119).** Every section renders, each clamped to 3 lines.
- **One-chapter books (Jude).** One book introduction block, then sections.
- **Chapters with only heading-slot commentary (Leviticus 19, Psalm 108).** The chapter introduction is the only block.
- **Reference tapped in a clamped block.** The block expands and the passage opens below its paragraph.
- **Chapter change while a passage is loading.** The pending result is discarded; it never shows under the new chapter's card.
- **Look closer collapsed.** The card does not render and fires no telemetry.

## Constraints

- Stack: existing TypeScript/React/Zustand code; MHCC is read with the in-house SWORD reader, not a new library. No new npm dependencies.
- Styling: `scripture-*` theme variables only; shared `Button` (`variant="secondary"`, `size="sm"`) for `Go to …`. Raw `<button>` is acceptable for the range, reference, and `Read more` / `Show less` links, following the `VerseLinks` pattern in `src/components/Discovery/InlineDetail.tsx`.
- Clamping: CSS 3-line clamp (Tailwind `line-clamp-3`). Whether to show `Read more` is decided by measuring whether the clamped element's `scrollHeight` exceeds its `clientHeight`. Component tests mock that measurement.
- Copy: no "Precept" anywhere; no coined terms. User-facing strings are exactly as quoted in this spec.
- Runs locally with no network for MHCC itself. Only reference expansion on a network translation touches the network.
- App size grows by the MHCC zip (about 1.8 MB).
- Tests (Vitest):
  - Unit, module reading: linked runs and their ranges; empty slots; book and chapter heading slots; a pointer reappearing after a gap throws; a run crossing a chapter is dropped and logged. Use small synthetic fixtures; do not load the full bundled zip in unit tests.
  - Unit, derivation (fixtures built from real entry text for Luke 1, John 3, Psalm 119, Genesis 21, Genesis 36, Leviticus 19, and Jude): book intro on chapter 1 only and its `x-ms` title removed; one-chapter-book intro from the chapter heading slot; chapter intro (Psalm 119) and none for John 3; heading-slot-only chapter (Leviticus 19); whole-chapter entry (Genesis 36); table and plain-text outline titles (Luke 1, Genesis 21), trailing `.`/`--` trimmed, `null` when no row starts at the section; labels removed; no `<title>` text, outline rows, or `Chapter Outline` in any paragraph; paragraph breaks; separate adjacent reference runs; entity decoding; unmappable book becomes plain text (synthetic).
  - Unit, inline passage: single verse; same-chapter range uncapped; cross-chapter and inverted ranges expand the first verse only; empty result and the empty-chapter `BibleApiError` map to "not in this translation"; other errors map to failure.
  - Unit: MHCC is absent from `getAllTranslations()` and from `getAvailableModules()`, and `isModuleBundled()` is false for it.
  - Component (`src/components/Discovery/__tests__/`): title and attribution line; block order; heading formats (with title, without title, single verse); whole-chapter block has no heading; `Read more` shown only when measurement says the block overflows; `Show less`; reset on chapter change; range tap calls `navigateToVerse` with the first verse; reference tap states (loading, success with `Go to …`, failure, not in translation, collapse on second tap, one open per block, tap in a clamped block expands it); stale result discarded on chapter change; card hidden with no blocks and on load failure; each telemetry event with its feature.
- `just check` passes.

## Acceptance criteria

Verifiable by the implementing agent:

1. `shasum -a 256 src-tauri/resources/sword-MHCC.zip` prints `7d2f6365ca95e7086911431dabef5d874acb4f03bf659f808ae18171b8d8e149`.
2. `git check-ignore src-tauri/resources/sword-MHCC.zip` prints nothing and exits 1, and the file is tracked.
3. `src-tauri/tauri.conf.json` and `flatpak/app.biblemarker.BibleMarker.yml` both list `sword-MHCC.zip`.
4. Unit tests show MHCC is absent from `getAllTranslations()` and `getAvailableModules()`.
5. Derivation tests pass for the fixtures named under Constraints, including: Luke 1 book intro is the first block and begins "This evangelist is generally supposed"; Luke 2 has no book intro; Luke 1 has a section titled `Zacharias and Elisabeth` with range 5–25; John 3's first section has range 1–8 and John 3 has no chapter intro; Psalm 119 has a chapter intro; Genesis 36 has a whole-chapter block; Genesis 21's sections take their titles from the plain-text outline, and no paragraph contains `Chapter Outline` or a `(N-M)` line; Leviticus 19 yields a chapter intro only; Jude yields one book intro and no chapter intro.
6. Component tests cover every behavior listed under Constraints → Component, including the four telemetry events.
7. `just check` exits 0.

Product owner steps (on a device or `pnpm run tauri:dev`; not verifiable by the implementing agent):

8. With no network on a fresh install, open Discover on John 3 and expand Look closer: the commentary card shows text, last in Look closer, titled `Matthew Henry's Concise Commentary` with `Public domain · abridged from Matthew Henry's Exposition` beneath.
9. The translation picker and the module download list show nothing named "Matthew Henry" or "MHCC".
10. With inductive tools on and then off, the card appears in the same place with the same content once Look closer is open.
11. On Luke 1, tapping `1:5–25` jumps to Luke 1:5. Tapping `Ac 16:10` in the book introduction shows Acts 16:10 below that paragraph with `Go to Acts 16:10`; the button navigates there; tapping `Ac 16:10` again collapses it.
12. On ESV with the network off, tapping a reference shows `Loading…` then `Couldn't load that passage.`
13. Moving to the next chapter and back shows every block clamped again.
14. The product owner reads Luke 1, John 3, Psalm 119, Genesis 21, Genesis 36, Leviticus 19, Jude, and Genesis 1 in Discover and confirms the card reads well.

## Decisions

| Decision | Choice | Why | Decided by |
|---|---|---|---|
| Source | CrossWire MHCC module, whole Bible, original text | Public domain, covers both testaments, reuses the SWORD reader; open-commentaries has John only and no modern text | User |
| Delivery | Bundled app resource, upstream zip unmodified, pinned by SHA-256 | Works offline from first launch; provenance is checkable | User (bundling); agent default (pinning) |
| Interpretation rule | Commentary is an explicit, attributed exception; shown in both modes; no caveat text | Henry is named on the card; placement in Look closer keeps it after observation | Agent default ("your call") |
| Placement | Last card inside Look closer | Commentary traditionally follows the reader's own observation | User |
| Attribution line | `Public domain · abridged from Matthew Henry's Exposition` | The Concise is a later abridgment and others finished the Exposition after Henry died; no dates avoids a wrong claim | User |
| Multiple commentaries | Data keyed by `commentaryId`; no picker this phase | Owner may add commentaries later | User |
| Modernized text | Later phase replaces text and adds "Show original" | open-commentaries not released | User |
| Block layout | Intro blocks, then sections with range headings; 3-line clamp with `Read more`; reset on chapter change | Long archaic text needs to scan quickly | User |
| Section headings | Outline titles plus range; outline not shown as a list | Outline titles are the module's own section names | User |
| Plain-text outlines | Detected and used as titles, removed from text | Keeps 110 chapters consistent with table outlines | User |
| Whole-chapter entries | Block with no heading and no range tap | The entry covers the whole chapter; a verse-1 range would mislead | User |
| Book intros | MHCC book intro on chapter 1 inside the card; Setting's hand-authored intros unchanged | Setting stays neutral facts; Henry's intro carries interpretation and is attributed | Agent recommendation, accepted by user |
| References | Marked-up references tappable, expanding inline with `Go to …`; plain-text references stay text | Read the cited verse without losing place; only markup is reliable | User |
| Inline passage length | Full same-chapter range, uncapped; malformed or cross-chapter ranges show the first verse | Longest marked-up ranges are short; malformed source ranges exist | Agent default |
| Versification | Verse numbers used as-is | Matches cross-reference behavior | User |
| Range errors | Show linked ranges as-is | Curated data will carry corrections | Agent default |
| Translation lists | MHCC never listed or downloadable; kept out of `MODULE_REGISTRY` | It is not a Bible | User (outcome); agent default (registry) |
| Failure behavior | Hide card, `console.error` | No dead UI for readers | User |
| Telemetry features | `commentary`, `commentary_range`, `commentary_reference` | Distinguish the three taps with the existing `trackChip` API, as `crossref` / `crossref_later` do | Agent default |
| Inline passage copy | `Loading…`, `Couldn't load that passage.` | Reuse cross-reference strings | Agent default |
| Not-in-translation copy and detection | `This passage isn't in {translation abbreviation}.`; empty result or the empty-chapter `BibleApiError` | No code records which testaments a translation has | Agent default |
| Clamp detection | `line-clamp-3` plus `scrollHeight > clientHeight` | Exact "fits in 3 lines" behavior; mockable in tests | Agent default |
| Kill switch | None beyond Discover's | Avoid flag sprawl | Agent default |

## Open questions

None.

## Existing code touched

| File or module | Change |
|---|---|
| `src/components/Discovery/DiscoveryPanel.tsx` | Extended: renders the commentary card last inside `LookCloserSection` |
| `src/components/Discovery/LookCloserSection.tsx` | Left alone |
| `src/components/Discovery/DiscoveryCard.tsx` | Reused for card chrome |
| `src/components/Discovery/InlineDetail.tsx` | Left alone; its link style is the pattern to follow |
| `src/components/Discovery/index.ts` | Left alone (it exports only `DiscoveryPanel`) |
| `src/components/Discovery/__tests__/` | Extended: card tests; panel test asserts Look closer order |
| `src/lib/bible-api/sword-ztext.ts` | Extended: exports `getSlotIndex`, `readSlot` and `bzvPreambleOffset`; `getVerseRaw` shares the indexed read |
| `src/lib/bible-api/sword.ts` | Extended: `loadBundledModule` and a private bundled non-translation table; `MODULE_REGISTRY` unchanged |
| `src/lib/chapterAnalysis/crossRefs.ts` | Reused: `formatCrossRefTarget` for `Go to` labels |
| `src/lib/commentary/` | New: MHCC block derivation |
| `src/hooks/useChapterCommentary.ts` | New: loads a chapter's blocks |
| `src/hooks/useCommentaryPassage.ts` | New: loads an inline passage after a tap |
| `src/components/Discovery/CommentaryCard.tsx` | New: the card |
| `src/hooks/useCrossRefPassages.ts` | Extended: exports `getCachedChapter` so inline passages share its chapter cache |
| `src/lib/telemetry.ts` | Extended: three `TelemetryFeature` values |
| `src/lib/discoveryTelemetry.ts` | Reused |
| `src-tauri/resources/sword-MHCC.zip` | New |
| `src-tauri/tauri.conf.json` | Extended: bundle the new resource |
| `flatpak/app.biblemarker.BibleMarker.yml` | Extended: install the new resource |
| `.gitignore` | Extended: un-ignore `sword-MHCC.zip` |
| `worker/` | Left alone |
| `docs/specs/discovery-phase-3-setting-and-connections.md` | Left alone |
