# Discovery Phase 3: Setting, Worth Noticing, and Connections

Status: Reviewed
Date: 2026-10-03
Summary: Restructure the Discover side panel so it orients the reader in the chapter's world (when, where, who), surfaces a few notable facts, and ties the chapter to the rest of Scripture in both directions, with the analytic cards moved into a collapsed "Look closer" section.

## Problem and goals

The Discover panel (`src/components/Discovery/DiscoveryPanel.tsx`) today is mostly analytic: Genre Compass, a Look-Again checklist, repetition counts, connector words, older cross-references, and a people/places count. It explains how the text is built but not what is going on in it, so it does not draw a casual reader into the chapter.

Goals:
- Orient the reader: when this happens, where it happens, who is in it, and why the book was written.
- Surface a few interesting, verifiable facts about the chapter.
- Tie the chapter to the rest of the Bible, both to earlier and later passages.
- Keep the inductive analysis cards available, but out of the way for discovery-mode readers.

Content principle (relaxes the Phase 1 "never give the answer" rule): factual setting — author, audience, approximate date, place, occasion, who is present — is allowed. Interpretation, meaning, and application are not. Where authorship or dating is disputed, text says "traditionally attributed to…" or "traditional dating" rather than taking a side. Every displayed year is prefixed `about`, because the Gnosis chapter years are Ussher's traditional chronology.

Success is judged by the product owner's manual read of whether the panel draws a reader in. There is no numeric target.

The work ships in two phases:
- **Phase 3a:** panel restructure, Setting section (book intro, chapter line, mini map, era strip, event list), Who's here, Look closer.
- **Phase 3b:** Worth noticing, forward cross-references.

## Non-goals

- Per-chapter AI-generated setting text. Deferred to Phase 4 (one-time pre-computed pass shipped as data).
- Ranking or flagging New Testament quotations of the Old Testament. Deferred to a Gnosis pipeline follow-up. Phase 3 ranks cross-references by votes only.
- Event `Before this:` / `Part of:` links. Deferred: `predecessor_id` and `parent_event_id` are empty for all 450 events in the bundled Gnosis DB. Gnosis pipeline follow-up.
- Person name meanings. Out of scope: `person.name_meaning` holds Easton's dictionary articles, not name meanings.
- Date confidence on chapter years. Out of scope: `chapter_timeline` has no confidence column, which is why every year reads `about`.
- Any Gnosis schema or pipeline change. Out of scope for Phase 3.
- Gnosis API mode (`GnosisApiClient`) support for the new data. Out of scope: the API has no endpoints for it. In API mode, those pieces are hidden.
- Pan/zoom on the inline mini map. Out of scope for good; the full-map modal covers exploration.
- New npm dependencies. Out of scope.
- Numeric performance targets. None set.
- End-to-end tests. Out of scope; the manual read covers the experience.

## Users and flows

Users: every reader with Discover enabled (`useDiscoveryEnabled()`). Discovery-mode readers (`inductiveToolsEnabled === false`) and inductive-mode readers (`inductiveToolsEnabled === true`) see the same sections; only the default state of Look closer differs.

### Panel order

Top to bottom:

1. **Setting** (3a)
2. **Worth noticing** (3b)
3. **Connections** (the existing cross-reference card; extended in 3b)
4. **Who's here** (3a)
5. **Look closer** (3a; collapsible)

`GenreCard.tsx`, `PeoplePlacesCard.tsx`, and their tests are deleted (approved by the product owner). Their content moves into Setting and Who's here.

In Phase 3a, before 3b lands, the order is Setting → Connections → Who's here → Look closer.

### Setting

Rendered in this order inside one section:

1. **Book intro.** 1–3 sentences covering author, audience, approximate date, and occasion, from a hand-authored record for each of the 66 books.
   - On chapter 1 of a book, the intro shows in full.
   - On any other chapter it shows a collapsed row labelled `About <Book name>` (for example `About Philippians`). Tapping it expands the full intro.
   - Under the intro, Setting shows the genre label (`GENRE_LABEL`), the genre orientation line (`orientationFor`), and the genre question (`questionFor`). Each is omitted when its function returns nothing.
2. **Chapter line.** One line built from Gnosis data, pieces joined with ` · `. Example: `About 1921 BC · 3 people · 4 places · The call of Abram`.
   - **Year:** `about <year_display>` from `getChapterYear`. Omitted for Genesis 1–11 and for chapters with no year.
   - **People count:** people named in the chapter, excluding the deity slugs (see Data). `1 person` / `N people`.
   - **Places count:** `1 place` / `N places`.
   - **Event:** the title of the chapter's first event, ordered by `sortKey`, then by `slug` to break ties.
   - Any piece without data is omitted. When no piece has data, the line is hidden.
3. **Mini map.** A static inline map with one marker per place in the chapter that has latitude and longitude.
   - The map does not pan or zoom. Its view fits all markers. With a single marker, it centers on that marker at a fixed zoom.
   - Tapping a marker shows the place name and the verses in this chapter that name it (for example `Verses 6, 8`). Tapping a verse jumps the reader to that verse.
   - An `Open full map` link opens a large modal (80% of the viewport height, the shared `Modal` maximum) with the same places on a pannable, zoomable map. The modal is read-only and writes no user data. It closes back to the Discover panel.
   - The map is hidden when no place in the chapter has coordinates.
4. **Era strip ("you are here").** A horizontal strip of eight equal-width era bands, with a marker for this chapter.
   - Bands, in order: `Beginnings`, `Patriarchs`, `Exodus & Wilderness`, `Judges`, `Kingdom`, `Exile`, `Return`, `Jesus & the Church`. Each band has a start year and an end year, drafted by the agent and reviewed by the product owner.
   - The marker is placed proportionally to the chapter year within its band's start-to-end range.
   - Genesis 1–11: the marker sits in `Beginnings`, centered, with no year shown.
   - The strip shows the band label of the chapter's band. It is hidden when the chapter has no year and is not Genesis 1–11.
5. **Event list.** This chapter's Gnosis events, ordered by `sortKey`, then by `slug`. Shows up to 5 rows, with a `+N more` expander for the rest (Genesis 11 has about 30 events). Each row shows the event title, plus `about <startYearDisplay>` when one exists, except in Genesis 1–11. Tapping a row expands it inline (see Inline detail).
   - Hidden when the chapter has no events.

### Who's here

Replaces `PeoplePlacesCard`.
- Lists people named in the chapter, excluding the deity slugs.
- Shows up to 5 rows, ordered by the number of verses in this chapter that name the person (most first), then by name, then by slug. When there are more, a `+N more` expander reveals the rest.
- Each row shows:
  - the person's name
  - `First appears in <reference>`, the person's canonically first verse computed from `person_verse` (not `person.first_mention`, which is wrong for some people), formatted with `formatVerseRef`; or `First time in Scripture` when that verse falls in this chapter
  - `Named in N verses here` (`Named in 1 verse here` when N is 1)
- **Prophecy-tagged people:** Gnosis tags `jesus-son-of-joseph` in Old Testament verses read as prophecy, where the text does not name him. In an OT chapter his row reads `Foretold in N verses here` with no first-appears line, and he is left out of the chapter line's people count. In an NT chapter he shows `First named here` / `First named in <reference>` from his first NT verse, plus `Foretold from <OT reference>`, and his book list counts NT books only.
- When two people in the chapter share a name, each row is still listed separately. The first-appears reference tells them apart.
- Tapping a row expands it inline (see Inline detail).
- Hidden when the chapter names no people after the exclusion.

### Inline detail (people and events)

Tapping a Who's here or event-list row expands it in place. It does not leave the Discover panel.
- **Person:** the books they are named in (`Named in Genesis, Exodus, and 13 other books` style: up to 3 book names, then `and N other books`), plus the verses in this chapter that name them, each tappable to jump.
- **Event:** its year (`about <startYearDisplay>`) when present, its participants by name (Gnosis has no event-location data), and the verses in this chapter linked to it, each tappable.
- Both show a `More in Reference` link that opens the Reference panel on that entity's `PersonDetail` / `EventDetail`. This leaves the Discover panel. Phase 3a fixes the existing `referenceEntitySlug` deep link, which currently renders `No detail view for type: search` (`ReferenceToolsPanel.tsx`), so it opens the correct detail view.

### Worth noticing (3b)

Up to 4 facts, taken in this fixed priority order until 4 are shown. Within a kind, facts are ordered by first verse in the chapter, then by name.

1. **First mention (places only):** a place whose first mention in Scripture falls in this chapter. Example template: `Bethel is named for the first time here.` People's first mentions are shown in Who's here instead, so they are not repeated.
2. **Only here:** a person (excluding deity slugs) or place whose every mention in Scripture falls within this chapter. Example: `This is the only chapter that names Salem.`
3. **Heavily linked:** this chapter is in the top 5% of all chapters by cross-reference density. Text: `This chapter is one of the most cross-referenced in Scripture.`
4. **Reach:** a person in this chapter (excluding deity slugs) named in 10 or more distinct books. Example: `Abraham is named in 15 books of the Bible.`

The exact templates are drafted by the agent in this voice and reviewed in the 3b PR. The card is hidden when no fact qualifies.

### Connections

The existing `CrossRefsCard` keeps its current older-target behavior, title, and rows. In Phase 3b these rows sit under a new heading `Earlier in Scripture`, and the card's existing dynamic title stays above both groups.

Phase 3b adds a `Later in Scripture` group below:
- At most 3 rows per chapter, for cross-references from this chapter to later passages (see the "later" rule under Data).
- Only references with votes at or above `crossRefMinVotes` (`useDiscoveryConfig()`). Deduped per source verse, keeping the highest-voted target, the same way `mapChapterCrossRefIndexRows` dedupes older rows. Ordered by votes descending.
- Forward rows go through the same row pipeline as older rows in `useCrossRefPassages`: the same local-translation shared-word filter, the same expand behavior, and the same network-translation consent rule (nothing is fetched until a row is expanded). The cap of 3 applies to the rows that survive that filter.
- Forward rows light their source verses in the cross-reference lens. When a verse has both an earlier and a later row, the lens keys that verse to the earlier row, and tapping it opens the earlier row.

### Look closer

A collapsible section containing, in order: Repetition (`RepetitionCard`), Connectors (`ConnectorsCard`), Look-Again (`LookAgainCard`).
- Default state: collapsed when `inductiveToolsEnabled` is false, expanded when true. Until `preferencesStore` is hydrated, it renders collapsed and does not animate when hydration flips it open.
- When the reader toggles it, the state persists on this device only (Zustand `persist`, not the synced SQLite `preferences` row) and survives an app restart. Once the reader has toggled it, their choice wins over the mode default.
- Look-Again's person and place rows today scroll to the `peoplePlaces` anchor. In Phase 3a person rows scroll to Who's here (or Setting when Who's here is hidden) and place rows scroll to the Setting map (or Setting when there is no map); Who's here lists people only. Repetition and connector rows keep scrolling to their cards, which are inside Look closer and so already visible.

## Data and interfaces

### New app data (TypeScript modules next to `src/lib/chapterAnalysis/genres.ts`)

- **Book intros:** a record keyed by book id (the same ids `genreFor` uses) to a string of 1–3 sentences. All 66 books present.
- **Era bands:** an ordered list of `{ label, startYear, endYear }`. Years are in the `chapter_timeline.year` convention (astronomical: `-4003` is `4004 BC`). Bands are contiguous with no gaps: each band's `startYear` equals the previous band's `endYear + 1`. Both ends are inclusive. The first band starts at or before `-4003` and the last ends at or after `96`, the current `chapter_timeline` range. Event years (`fromGnosisYear`, direct negation) are never compared against bands.

Both are drafted by the agent and reviewed by the product owner.

### Deity exclusion

Gnosis person slugs `god` and `holy-spirit` are excluded from Who's here, the people count, "only here", and "reach". Jesus is included (`jesus-son-of-joseph` in Gnosis; the `jesus` slug is Jesus Justus, Col 4:11).

### Canonical order and the "later" rule

- Canonical order is book order from `BIBLE_BOOKS`, then numeric chapter, then numeric verse, computed in TypeScript. It is never `ORDER BY verse.id` or `ORDER BY osis_ref`, because both sort by OSIS string.
- A target is **later** when it is in a different book, and either the source is OT and the target is NT, or both are in the same testament and the target book comes later in canonical order. This is the mirror of `isOlderTarget` (`src/lib/chapterAnalysis/crossRefs.ts`), and like it, it excludes same-book references.

### Existing Gnosis data used (no schema change)

| Need | Source |
|------|--------|
| Chapter year + display | `chapter_timeline` via `getChapterYear` |
| Chapter people, places, events | `getChapterEntities` |
| Place coordinates | `place.latitude` / `place.longitude` |
| Place verses | `place_verse` |
| Person verses, first appearance | `person_verse` (first appearance computed in canonical order) |
| Event order and details | `event.sort_key`, `event_participant`, `event_verse` |
| Cross-references | `cross_reference` (votes may be negative) |

### New local-provider queries (`src/lib/gnosis/local-db.ts`)

Added as optional provider capabilities, following the existing pattern in `src/lib/gnosis/provider.ts`. `GnosisApiClient` does not implement them, and the UI hides the dependent pieces when they are absent.

- **Chapter people with counts:** each person in a chapter with the count of verses in this chapter that name them, One query per chapter, not one `getPerson` per person.
- **Chapter places with verses:** each place in a chapter with coordinates and the verse numbers in this chapter that name it.
- **Entity book spread (3b and inline detail):** for a set of person or place ids, the distinct books and the canonical-first verse. Used for "only here", "reach", place first mention, and the inline person detail. One batched query per chapter.
- **Forward cross-references (3b):** the chapter's cross-references with votes at or above `crossRefMinVotes`, filtered in TypeScript by the "later" rule, then deduped.
- **Chapter cross-reference density ranking (3b):** for every chapter, the count of cross-references originating in it with votes at or above `crossRefMinVotes`, divided by the chapter's verse count. Computed lazily on the first Worth noticing render after Gnosis is ready, cached for the session, and never blocking other sections. A chapter is "top 5%" when its density is at or above the 95th-percentile value; ties at the cutoff are included.

### Preferences

- New Zustand `persist` UI state: Look closer open/closed, unset until the reader first toggles it. It is local to the device and does not sync.

### Telemetry

Add these values to `TelemetryFeature` (`src/lib/telemetry.ts`): `setting`, `setting_map`, `setting_timeline`, `worth_noticing`, `crossref_later`, `look_closer`. Who's here keeps the existing `entity` feature, for continuity with the existing series.

| Feature | `discovery_chip_shown` fires when | `discovery_chip_tapped` fires when |
|---------|-----------------------------------|------------------------------------|
| `setting` | Setting renders | the intro expands |
| `setting_map` | the mini map renders | a marker is tapped or the full map opens |
| `setting_timeline` | the era strip or event list renders | an event row expands |
| `entity` | Who's here renders | a person row expands |
| `worth_noticing` | the card renders with at least 1 fact | (none) |
| `crossref_later` | at least 1 `Later in Scripture` row renders | a later row expands |
| `look_closer` | (none) | the reader toggles it |

All events are deduped per `{book, chapter, translation}`, matching `DiscoveryPanel`'s existing keys. The existing `repetition` and `connector` shown events fire only when Look closer is expanded and those cards are rendered.

## Edge cases and failure modes

- **Gnosis loading or failing:** every Gnosis-based piece (chapter line, map, era strip, event list, Who's here, Worth noticing, cross-references) is hidden while loading and on error, with no message. This matches the current `PeoplePlacesCard` convention. The book intro and genre lines always render, because they are local, and never wait on Gnosis.
- **Gnosis API mode:** pieces that depend on the new local-provider queries, or on `getChapterYear` (which returns null in API mode), are hidden.
- **Offline or map tiles unreachable:** when `isOnline()` is false, or the map style or tiles fail to load, or the map has not loaded within 10 seconds, the map is replaced by a plain list of the chapter's place names and the line `Map needs an internet connection.` The same applies inside the full-map modal. The 10-second timeout is an agent default.
- **Crowded chapters** (for example Genesis 10, 1 Chronicles 1–9): Who's here is capped at 5 with `+N more`. The map shows every place with coordinates, with no cap; its view fits all markers. All counts come from per-chapter queries, not per-person lookups.
- **Duplicate names:** listed as separate rows, and as separate facts in Worth noticing.
- **Genesis 1–11:** no year anywhere; the era strip marker sits in `Beginnings`.
- **Undated chapter outside Genesis 1–11:** the era strip is hidden and the chapter line omits the year.
- **Book without a genre entry:** the intro still shows; the genre lines are omitted.
- **Mobile sheet:** the static mini map does not capture scroll gestures; the panel scrolls normally over it.
- **Discover disabled:** unchanged — the panel shows `Discover is turned off right now.`

## Constraints

- Stack: existing React 19, Tailwind 4, Zustand, MapLibre (`maplibre-gl`, `react-map-gl`), PMTiles. No new dependencies.
- The mini map and full-map modal are a new Discovery component. They reuse the tile source and style setup from `PlaceMap.tsx` (`tiles.biblemarker.app`) without changing `PlaceMap`'s behavior.
- Styling: `scripture-*` variables and shared components, per `CLAUDE.md`.
- No Gnosis schema or pipeline changes.
- Branching: Phase 3a branches from `discovery` after Phase 2b merges, and its PR targets `discovery`. Phase 3b does the same after 3a.
- Tests required:
  - **Unit:**
    - Worth noticing fact selection: each kind, priority and in-kind order, cap of 4, deity exclusion, empty result.
    - Era band lookup and proportional marker position, including band edges and Genesis 1–11.
    - The "later" rule: OT→NT, same testament with a later book, same book (excluded), earlier book (excluded).
    - Forward selection: vote minimum, per-verse dedupe, cap of 3, vote ordering.
    - Year formatting (`about <year_display>`).
    - Density ranking and the 95th-percentile cutoff, including ties.
  - **Data:**
    - All 66 books have an intro of 1–3 sentences.
    - Era bands are ordered and contiguous, and cover `-4003` to `96`, with those values hard-coded in the test.
  - **Component:**
    - Panel section order.
    - Look closer default state in each mode, pre-hydration state, and the persisted override.
    - Each Gnosis-based section hides on empty, loading, error, and missing provider capability.
    - Intro full vs collapsed by chapter.
    - Inline expand for person and event rows.
    - The map offline fallback text.
    - The telemetry table above.
  - **Provider:** `local-db.test.ts` coverage for each new query, using its existing mocked-DB approach.
- Canonical gate: `just check`.

## Acceptance criteria

### Phase 3a

1. Given Discover is enabled, when the panel opens, sections appear in the order Setting → Connections → Who's here → Look closer. `GenreCard.tsx` and `PeoplePlacesCard.tsx` no longer exist. Verified by a component test and `git ls-files`.
2. Book intro:
   - Given chapter 1 of any book, Setting shows the full book intro.
   - Given any other chapter, it shows `About <Book name>` collapsed, and tapping it shows the full intro.
   - The genre label, orientation, and question render inside Setting when present.
   - Verified by a component test.
3. `pnpm test` includes a passing data test asserting that all 66 books have an intro of 1–3 sentences.
4. The chapter line shows only the pieces with data, joined by ` · `, with the year as `about <year_display>`. There is no year for Genesis 1–11, and the line is absent when no piece has data. Verified by a component test with fixtures.
5. Mini map:
   - Given a chapter with places that have coordinates, it renders one marker per such place.
   - Tapping a marker lists the verses in this chapter that name it, and tapping a verse navigates to it.
   - `Open full map` opens a pannable, zoomable modal and creates no `Place` rows.
   - Given no places with coordinates, the map is absent.
   - Given `isOnline()` is false, the place-name list and `Map needs an internet connection.` render.
   - Component tests cover marker count, absence, and the offline text. A manual check in `pnpm run tauri:dev` confirms the inline map does not pan or zoom, on Genesis 12 (with places), Psalm 23 (none), and with networking disabled.
6. Era strip and event list:
   - Given a dated chapter, the strip shows its band label with the marker placed proportionally within that band.
   - Given Genesis 1–11, the marker sits in `Beginnings` with no year.
   - Given an undated chapter outside Genesis 1–11, the strip is absent.
   - The event list shows events ordered by `sortKey`, then by `slug`.
   - Verified by unit tests (band lookup, position, formatting) and a component test.
7. Who's here:
   - It shows at most 5 people (excluding `god` and `holy-spirit`), ordered by verses in this chapter, with `+N more` when there are more.
   - Each row shows `First appears in <reference>` or `First time in Scripture`, and `Named in N verses here`.
   - Tapping a row expands inline detail without leaving Discover.
   - `More in Reference` opens that person's `PersonDetail`, not `No detail view for type: search`.
   - Verified by a component test and a manual check on Genesis 11.
8. Look closer:
   - It contains Repetition, Connectors, and Look-Again in that order.
   - It is collapsed by default when `inductiveToolsEnabled` is false, and expanded when true.
   - After the reader toggles it and restarts the app, their choice is restored on that device.
   - Look-Again person and place rows scroll to Who's here.
   - Verified by component tests and a manual restart check.
9. Given Gnosis is loading, errors, or is in API mode, every dependent Gnosis-based section is absent with no error text, and the book intro and genre lines still render. Verified by component tests.
10. Telemetry fires per the Telemetry table, deduped per `{book, chapter, translation}`. Verified by a component test with a mocked `track`.

### Phase 3b

11. Worth noticing:
    - It shows up to 4 facts in the order: first mention (places) → only here → heavily linked → reach (10 or more books).
    - It excludes the deity slugs.
    - It is absent when none qualify.
    - Verified by unit tests on fact selection and the density ranking, and a component test.
12. Connections:
    - It shows the existing rows under `Earlier in Scripture`, unchanged otherwise.
    - It shows up to 3 `Later in Scripture` rows that satisfy the "later" rule, have votes at or above `crossRefMinVotes`, are deduped per source verse, and are ordered by votes descending.
    - Forward rows light their verses in the lens. Where a verse has both groups, the lens opens the earlier row.
    - Verified by unit tests on the "later" rule and selection, and a manual check on Genesis 3 and Isaiah 53.

### Both phases

13. `just check` passes.

### Product owner step (not verifiable by the implementing agent)

14. The product owner has reviewed and approved the drafted book intros and era bands (and, in 3b, the Worth noticing templates) before the corresponding PR merges.

## Decisions

| Decision | Choice | Why | Decided by |
|----------|--------|-----|------------|
| Content principle | Factual setting allowed; meaning and application not | Orientation draws readers in without interpreting for them | User |
| Disputed authorship or date | "Traditionally attributed to…" / traditional dating | Neutral; no side-taking | User |
| Context source | Hand-authored book intros + Gnosis-derived chapter line; per-chapter AI deferred to Phase 4 | Zero runtime cost; settle the voice first | User |
| Phase 2b | Ship as-is; this is Phase 3 | 2b is already useful and fits this vision | User |
| Phase split | 3a Setting + Who's here + Look closer; 3b Worth noticing + forward cross-references | Matches the 2a/2b cadence; smaller PRs | User |
| Intro author | Agent drafts, product owner reviews | Speed, with editorial control | User |
| Quotation ranking | Dropped for Phase 3; rank by votes | No quotation data in Gnosis | User |
| Success measure | Manual read; no numeric target | Subjective goal | User |
| Genre card | Folded into Setting (label, orientation, question) | One orientation block | User |
| Intro display | Full on chapter 1, collapsed `About <Book>` elsewhere | Avoid repeating the same text every chapter | User |
| Timeline form | Era strip + chapter event list | "You are here" plus what happens | User |
| Dates | Always `about <year>`; no year for Genesis 1–11 | Gnosis years are Ussher's chronology, with no confidence data | User |
| Era bands | 8 hand-authored, contiguous bands (listed above) | No era data exists | User |
| Era strip scale | Equal-width bands, marker proportional within its band | A true-to-scale strip shrinks the NT to about 2% | User |
| Event predecessor/parent links | Dropped from Phase 3 | Fields are empty in the shipped data | User |
| Who's here content | Name, first appearance, verses named here; no name meaning | `name_meaning` is a dictionary article | User |
| Who's here cap | 5, with `+N more` | Crowded genealogy chapters | User |
| Person/event tap | Inline expand + `More in Reference` (fix the deep link) | Keep readers in Discover | User |
| Full map | Read-only large modal, not the Analyze panel | Analyze is inductive-mode UI and can write `Place` rows | User |
| Jesus in OT verses | Keep, worded `Foretold` rather than `Named` | The OT points to Jesus, but the text doesn't name him there | User |
| Deity exclusion | Exclude `god`, `holy-spirit`; keep Jesus | God tops every count otherwise | User |
| Look closer default | Collapsed in discovery mode, expanded in inductive mode, reader's toggle persisted | Keep analysis out of the way unless wanted | User |
| Worth noticing kinds | First mention (places), only here, heavily linked, reach; max 4 in that order | Deterministic from existing data | User |
| Heavily linked | Top 5% by density (cross-references at or above vote minimum ÷ verses) | Normalizes chapter length | User |
| Reach threshold | 10 or more books | Proposed by agent, accepted | User |
| Forward cross-reference cap | 3, at or above `crossRefMinVotes` | Long lists in Genesis and Isaiah | User |
| Delete replaced cards | Delete `GenreCard.tsx`, `PeoplePlacesCard.tsx` and their tests | Replaced by the new sections | User |
| Intro and era storage | TypeScript module next to `genres.ts` | Ships with the app; editable in a PR | User |
| Gnosis failure UX | Hide silently; local content always renders | Matches existing convention | User |
| Offline map | Place list + `Map needs an internet connection.` | Tiles are network-only | User |
| Mini map interaction | Static; tap markers only | Avoid scroll-gesture conflict in the mobile sheet | User |
| Map marker cap | None; fit bounds | Bounds fitting handles density | User |
| Schema changes | None in Phase 3 | Keep the scope in app code | User |
| Performance | No numeric target; intro never waits on Gnosis | Only hard rule needed | User |
| Branching | 3a/3b off `discovery`; spec on its own branch | Same as earlier phases | User |
| People first-mention placement | Who's here only; Worth noticing first mention covers places | Avoid saying the same thing twice | Agent default |
| "Later" rule | Mirror of `isOlderTarget`; excludes same-book references | Keep forward and older symmetric | Agent default |
| Forward row pipeline | Same `useCrossRefPassages` filter and expand flow as older rows | One row behavior | Agent default |
| Lens conflict | The earlier row wins when a verse has both | The lens holds one key per verse | Agent default |
| Look closer persistence | Device-local Zustand `persist`, not synced | It's a UI convenience | Agent default |
| API mode | Hide pieces that need the new local queries | The API has no endpoints for them | Agent default |
| Telemetry names | Table above; Who's here keeps `entity` | Series continuity | Agent default |
| Map load timeout | 10 seconds | Some failures never fire an error event | Agent default |
| Event and person ordering ties | Break by `slug` / name | Real `sortKey` ties exist (Genesis 12) | Agent default |
| Mini map component | New Discovery component reusing `PlaceMap`'s tile setup | `PlaceMap` is a two-column interactive layout | Agent default |

## Open questions

- **Quotation flag in Gnosis** (owner: product owner, later): add a NT→OT quotation flag to the Gnosis pipeline so Connections can rank quotations first.
- **Event links in Gnosis** (owner: product owner, later): populate `predecessor_id` / `parent_event_id` to enable `Before this:` / `Part of:`.
- **Worth noticing copy** (owner: product owner, in the 3b PR): final wording of the four fact templates.

## Existing code touched

| File / module | Change |
|---------------|--------|
| `src/components/Discovery/DiscoveryPanel.tsx` | Extended: new section order, Setting, Who's here, Look closer, Worth noticing, telemetry |
| `src/components/Discovery/GenreCard.tsx` (+ tests) | Deleted; content moves into Setting |
| `src/components/Discovery/PeoplePlacesCard.tsx` (+ tests) | Deleted; replaced by Who's here |
| `src/components/Discovery/CrossRefsCard.tsx` | Extended: `Earlier in Scripture` / `Later in Scripture` groups |
| `src/components/Discovery/LookAgainCard.tsx` | Extended: person/place rows target Who's here |
| `src/components/Discovery/RepetitionCard.tsx`, `ConnectorsCard.tsx` | Left alone (moved inside Look closer) |
| `src/components/Observation/PlaceMap.tsx` | Left alone; its tile/style setup is reused by the new Discovery map |
| `src/components/Summary/Timeline.tsx` | Left alone |
| `src/components/Reference/ReferenceToolsPanel.tsx` | Extended: fix the `referenceEntitySlug` deep link so it opens `PersonDetail` / `EventDetail` |
| `src/components/Reference/PersonDetail.tsx`, `EventDetail.tsx` | Left alone |
| `src/lib/chapterAnalysis/genres.ts` | Left alone; new sibling modules for book intros and era bands |
| `src/lib/chapterAnalysis/crossRefs.ts` | Extended: "later" rule and forward selection |
| `src/lib/gnosis/local-db.ts`, `provider.ts` | Extended: the new optional local queries |
| `src/lib/gnosis/api-client.ts` | Left alone (does not implement the new capabilities) |
| `src/hooks/useGnosis.ts`, `src/hooks/useDiscoveryHost.ts`, `src/hooks/useCrossRefPassages.ts` | Extended: load the new data and forward rows |
| `src/stores/discoveryStore.ts` | Extended: forward cross-reference rows, persisted Look closer state |
| `src/lib/telemetry.ts` | Extended: new `TelemetryFeature` values |
| `src/lib/discovery-config.ts` | Left alone; `crossRefMinVotes` reused |
