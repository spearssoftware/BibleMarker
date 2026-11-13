# Reading plans

Status: Reviewed
Date: 2026-11-13
Summary: A reader can start a plan to read a book, a testament or the whole Bible in a chosen number of days, see today's reading, mark days complete, and catch up without being scolded.

This is Phase 4 of the three-modes roadmap. It builds on Phase 3 (`docs/specs/read-mode.md`). It was written without an interview, on the owner's instruction to proceed on the roadmap's recommendations; every choice not taken from the approved roadmap is marked "agent default" in Decisions.

## Problem and goals

The app has no way to read toward a goal. Read mode is meant to be the home of plans such as "John in 30 days" or "the Bible in a year".

Goals:

1. Start a plan in a few taps: what to read, how many days.
2. Always know today's reading and get to it in one tap.
3. Mark a day complete by hand; undo it by hand.
4. Fall behind without penalty: no streaks, no "missed" counts, one action to move the dates.
5. Progress follows the reader's account to their other devices, and two devices marking different days while offline both keep their marks.

Ships as three stacked PRs into `discovery`:

- **4a.** Schedule generator, the two tables, store, sync and backup.
- **4b.** The "Reading plans" panel: list, new plan, plan detail.
- **4c.** The in-reader strip and end-of-chapter actions, and telemetry.

## Non-goals

Deferred:

- Fixed plans (M'Cheyne, chronological, topical). The tables allow them later.
- Reminders and notifications.
- Streaks, badges, statistics.
- Sharing a plan or reading with others.
- Marking a day complete automatically from scrolling or time spent.
- Pausing a plan (moving the dates covers it).

Out of scope for good:

- Any wording that counts missed days or resets progress.

## Users and flows

Plans are available in Read, Discover and Study.

### Opening the panel

The ⋯ menu gains "Reading plans", directly below "Export page…". That puts it above "Text options" on narrow layouts and above "Settings" on wide ones (wide means `panelStore.orientation === 'horizontal'`, as elsewhere). It opens a side panel titled "Reading plans", like Settings does. The panel is offered in every mode.

### Starting a plan

1. With no plans, the panel shows "No reading plans yet." and a primary button "New plan".
2. "New plan" shows a form:
   - "What to read": "Whole Bible", "Old Testament", "New Testament", "One book". Choosing "One book" shows a book list.
   - "How many days": a number field. Suggested values are offered as chips: for the whole Bible "90", "180", "365"; for a testament "30", "90", "180"; for a book "7", "14", "30", limited to values the selection allows. A selection with fewer chapters than its smallest suggestion (a one-chapter book) shows no chips.
   - "Start": "Today" (the only option in this phase).
   - A preview line: "About {n} chapters a day" (rounded to one decimal place, or "1 chapter a day").
   - Buttons "Start plan" (primary) and "Cancel" (secondary).
3. The number of days must be a whole number from 1 to the number of chapters in the selection. Outside that range the field shows "Choose between 1 and {max} days." and "Start plan" is disabled.
4. The plan's name is generated: "{selection} in {n} days" ("John in 30 days", "Whole Bible in 365 days", "New Testament in 90 days"). With 1 day: "{selection} in 1 day".
5. More than one plan can be active. Starting the same selection twice is allowed.

### The plan list

Each plan is a card showing its name, "Day {d} of {n}" for the first incomplete day, that day's reading ("John 5–6"), and a button "Read" that goes to the first chapter of that day. A finished plan shows "Finished" and no "Read" button. Plans are listed with unfinished ones first, newest first within each group.

If the first incomplete day was due before today, the card also shows "{k} days behind" (or "1 day behind") and a secondary button "Shift my dates". Pressing it moves the plan so that day is due today; the line disappears. Nothing is marked or unmarked.

### Plan detail

Tapping a card's name opens the plan: a list of every day with its reading and a checkbox labelled with the day ("Day 12: John 5–6"). Checking marks the day complete; unchecking removes the mark. Days can be completed in any order. Tapping a reading goes to its first chapter. The list opens scrolled to the first incomplete day (a whole-Bible plan can have 1,189 rows). At the bottom, a destructive button "Delete plan" asks "Delete this plan? Your marks and notes in the text are not affected." with "Delete" and "Cancel".

### In the reader (4c)

When the open chapter belongs to the first incomplete day of a plan:

- A strip sits at the top of the chapter text, inside the scrolling text so it scrolls away: "{plan name} · Day {d} · {reading}".
- At the end of the chapter:
  - if the day has a later chapter: a primary button "Continue to {Book} {chapter}";
  - if this is the day's last chapter: a primary button "Mark day {d} complete". After pressing it the area reads "Day {d} complete." and, if the plan has another day, "Next: {reading}" with a secondary button "Read on" that opens the first chapter of that next day.
- Pressing "Mark day {d} complete" makes a later day the first incomplete one, so the completed state is remembered for that plan and chapter until the reader leaves the chapter; the strip and the "Day {d} complete." area stay until then.
- If the chapter belongs to the current day of more than one plan, the strip and the end action are shown for each, stacked, in the list order.
- With two or three translations side by side, the strip and the end actions appear once, across the full width, not once per column.
- The strip is part of the text: it scrolls with it and is not affected by the hiding top bar. It must not push a restored verse off screen (Phase 3a) or change which verse is reported as being read; plans are loaded before the chapter's saved position is restored, or the restore's anchoring absorbs the strip appearing.

When the open chapter is not part of any plan's current day, nothing is shown.

The strip and the end actions are plain text and shared buttons; they follow the reader's text size setting only for the reading reference, not the buttons.

## Data and interfaces

### The schedule

A plan's days are computed, not stored, from its selection and number of days:

- The selection is the list of chapters in canonical order: all 66 books, the Old Testament (Genesis–Malachi), the New Testament (Matthew–Revelation), or one book.
- Days are contiguous runs of whole chapters; every day has at least one chapter.
- Balance uses `KJV_VERSE_COUNTS` (`src/types/bible.ts`), which covers all 1,189 chapters. With `C` chapters, `total` verses and `n` days, day `d` (1-based, `d < n`) ends at a chapter index `e` chosen from the range `previous end + 1 … C − (n − d)` only, so every day has at least one chapter and enough are left for the remaining days. Within that range it is the chapter whose cumulative verse count `cum(e)` minimises `|cum(e) × n − d × total|` (integers, so no rounding); on a tie the earlier chapter wins. The last day takes the rest. Worked example, chapters of 10, 10 and 30 verses: into 2 days gives [1–2], [3]; into 3 days gives [1], [2], [3].
- The rule is version 1. Each plan records `scheduleVersion: 1` so a later change to the rule cannot move the days of an existing plan.

### Tables

Two new tables, both synced, both cleared on reset, both in backups, neither study-scoped. `SCHEMA_VERSION` goes from 11 to 12.

`reading_plans`, one row per plan:

| Field | Meaning |
|---|---|
| `id` | UUID |
| `scope` | `{ kind: 'bible' }`, `{ kind: 'ot' }`, `{ kind: 'nt' }` or `{ kind: 'book', bookId }`, where `bookId` is a `BIBLE_BOOKS` id such as `'Gen'` |
| `days` | whole number ≥ 1 |
| `startDate` | local calendar date `YYYY-MM-DD` on which day 1 is due |
| `scheduleVersion` | `1` |
| `createdAt`, `updatedAt` | timestamps |

`reading_plan_days`, one row per completed day:

| Field | Meaning |
|---|---|
| `id` | `{planId}:{day}` |
| `planId` | the plan |
| `day` | 1-based day number |
| `completedAt` | timestamp |
| `updatedAt` | timestamp |

A day is complete if and only if its row exists. Unmarking deletes the row. Completing or unmarking a day never writes the plan row. Deleting a plan deletes the plan row and the day rows this device has, each logged for sync.

Sync is whole-row, newest wins by the row's update time (not `completedAt`). "Shift my dates" rewrites only `startDate` on the plan row. Because each completed day is its own row with an id both devices compute the same way, two devices completing different days offline both survive, and both completing the same day converge on one row.

### Dates

"Today" is the device's local calendar date. Day `d` is due on `startDate + (d − 1)` days, computed on calendar fields (year, month, day), never by adding milliseconds, so daylight-saving changes cannot shift a date. A plan is behind by `today − dueDate(first incomplete day)` days when that is positive. Dates are compared as calendar dates, never as instants, so a change of time zone cannot move a day by more than the calendar does.

### Devices on an older version

An older app version skips sync entries for tables it does not know and still advances past them (`sync-engine.ts`, the `SYNCED_TABLES` checks and the watermark update). After such a device upgrades, the skipped rows are never replayed, and compaction may have removed their journal entries, leaving them only in a peer's latest snapshot.

Required: after upgrading, the device ends up with the plans and completed days written while it was old, without the user doing anything.

Mechanism (chosen for safety over the alternative of clearing every sync watermark, which re-applies every table and can bring back rows this device deleted): the device records which synced tables it has already caught up on. When the set of synced tables contains one it has not recorded, the next successful sync reads each peer's latest snapshot and remaining journals from the beginning and applies only the rows of the new tables, through the normal newest-wins path, leaving watermarks alone. The table is recorded as caught up only after that succeeds, so an offline first launch retries later. This is generic: it also covers tables added in future versions.

### Telemetry

Two opt-in events with no details: `plan_started` and `plan_day_completed`. Both names are added to the worker's allow-list (`worker/src/events.ts`). The worker must be deployed before any build that sends them.

## Edge cases and failure modes

- **Days greater than chapters** (John has 21 chapters; 30 days asked): refused by the form as above. The chip "30" is not offered for John.
- **One-chapter books** (Obadiah, Philemon, 2 John, 3 John, Jude): only 1 day is possible.
- **Plan row arrives by sync without its day rows, or the reverse:** day rows whose plan is missing are ignored and not shown; they are not deleted, because the plan row may still be on its way.
- **A day row for a day number beyond the plan's length:** ignored.
- **A plan with an unknown `scheduleVersion` or a malformed scope** (written by a newer version): listed by name as "This plan needs a newer version of BibleMarker." with only "Delete plan" available.
- **Same day completed on two devices:** one row; the newer write wins, and either way the day is complete.
- **Day completed on one device, unmarked on another while offline:** newest change wins, as for any row.
- **Plan deleted on one device while another completes a day offline:** the plan stays deleted; the orphan day row is ignored and left in place.
- **Plan deleted on one device while another uses "Shift my dates" offline, later:** newest wins, so the shifted plan row comes back on every device, with whatever day rows survive. This is accepted; the reader can delete it again.
- **Day rows that arrive before their plan row:** ignored until the plan row arrives, then shown.
- **Clock set back, or travel across time zones:** "behind" is recomputed from the local date each time the panel or strip renders; no data changes.
- **Start date in the future** (clock moved): the plan shows "Day 1 of {n}" and is not behind.
- **Midnight passes with the app open:** the next render uses the new date; no timer is required.
- **Saving fails:** the action shows the toast "Couldn't save your reading plan. Try again." and the screen stays as it was.
- **Reset ("clear database"):** both tables are emptied.
- **Backup made before this version:** restores with no plans.

## Constraints

- Stack and conventions as in `CLAUDE.md`: shared components, `scripture-*` colors, `@/` imports; new tables go through `src/lib/table-registry.ts`, `migrateSchema()` and `ensureTablesExist()`; all database access through `@/lib/database`.
- No new dependencies. No network use.
- Copy never says "missed", "streak", "failed" or "late". "Behind" appears only in "{k} days behind".
- The plan tables carry no study id and are untouched by the orphaned-study cleanup at startup.
- The panel is available in every mode; mode checks go through `src/lib/appMode.ts`.
- Tests, in the PR that changes the behavior:
  - 4a: the schedule rule (every chapter exactly once, in order, at least one per day, the tie rule, whole Bible in 365 days sums to 1,189 chapters and 31,102 verses, a one-chapter book); `KJV_VERSE_COUNTS` has an entry per chapter for all 66 books; date helpers (due date, behind, shift) including a month boundary and a leap day; store create, complete, unmark, shift and delete with cascade; registry, migration, export, import and snapshot tests updated; a sync-level test for the older-version recovery.
  - 4b: component tests for the form's validation and chips, the list order, the behind line and "Shift my dates", plan detail check and uncheck, delete confirmation, and the newer-version card.
  - 4c: component tests for the strip and each end-of-chapter state, including two plans on one chapter.
  - `just check` passes on each PR.
- Each PR is checked in the iOS Simulator at phone portrait before it is handed over.

## Acceptance criteria

4a

1. `generateSchedule({ kind: 'book', bookId: 'John' }, 21)` returns 21 days of one chapter each, John 1 to John 21.
2. For every selection kind and every allowed number of days tested (1, 2, 7, 30 and the maximum), concatenating the days gives each chapter of the selection exactly once in canonical order, and no day is empty.
3. `generateSchedule({ kind: 'bible' }, 365)` covers 1,189 chapters and 31,102 verses.
4. In a sync-level test, two devices' change journals that each complete a different day of the same plan, applied to each other through `applyRemoteChange`, leave both day rows present on both.
5. A database exported with a plan and two completed days and imported into an empty database shows the same plan and days.
6. After "clear database", both tables are empty.
7. In a sync-engine test: a device that does not know the plan tables syncs past a peer's journal containing a plan and a completed day (its watermark moves beyond them); the same device, now knowing the tables, syncs once and has both rows. With the peer's journal compacted into a snapshot, the result is the same. A sync that fails midway leaves the tables unrecorded and a later sync recovers the rows.
8. `just check` exits 0.

4b

9. With no plans, the panel shows "No reading plans yet." and "New plan".
10. Choosing "One book", "John", typing 30 shows "Choose between 1 and 21 days." and "Start plan" is disabled; typing 21 enables it; pressing it lists "John in 21 days" with "Day 1 of 21" and "John 1".
11. A plan whose stored start date is three days before today (set up as a fixture) with nothing complete shows "3 days behind" and "Shift my dates"; pressing it removes the line and completes nothing.
12. In plan detail, checking "Day 2: John 2" and reopening the panel shows it checked; unchecking removes it.
13. "Delete plan" then "Delete" removes the plan from the list; "Cancel" keeps it.
14. The panel opens from the ⋯ menu in Read, Discover and Study.

4c

15. With "John in 21 days" on day 1 and John 1 open, the top of the text shows "John in 21 days · Day 1 · John 1" and the end of the chapter shows "Mark day 1 complete"; pressing it shows "Day 1 complete." and "Next: John 2".
16. With a plan whose day 1 is John 1–2 and John 1 open, the end of the chapter shows "Continue to John 2", which opens John 2.
17. With Genesis 1 open and only a John plan, no strip and no end action are shown.
18. `rg -i "missed|streak" src/components/ReadingPlans src/lib/readingPlans` prints nothing.
19. `just check` exits 0.

## Decisions

| Decision | Choice | Why | Decided by |
|---|---|---|---|
| Plan kinds in v1 | Generated only | Roadmap decision 6 | user (roadmap) |
| Several plans at once | Allowed | Roadmap decision 6 | user (roadmap) |
| Streaks and reminders | None | Roadmap decision 6 | user (roadmap) |
| Completing a day | Manual | Roadmap decision 6 | user (roadmap) |
| Sync | Plans and completed days sync; reading position does not | Roadmap decision 7 | user (roadmap) |
| One row per completed day with a computed id | Yes | Roadmap, Phase 4 | user (roadmap) |
| Falling behind | "{k} days behind" and "Shift my dates" | Roadmap: forgiving plans | user (roadmap) |
| Selections | Whole Bible, Old Testament, New Testament, one book | Covers "a book in 30 days" and "the Bible in 365" with little extra | agent default |
| Where plans live | A side panel opened from the ⋯ menu, in every mode | Modes are layers; Read has no bottom bar to hold a tab | agent default |
| Plan name | Generated, not editable | One less field; the name says what it is | agent default |
| Start date | Today only | Keeps the form to two questions | agent default |
| Schedule stored or computed | Computed, with a recorded rule version | Small rows; no thousand-row plans to sync | agent default |
| Balancing data | KJV verse counts | Already bundled; small differences between translations do not matter for balance | agent default |
| In-reader placement | A strip inside the scrolling text and actions at the end of the chapter | Keeps the area above the text clear, which Phase 3 worked for | agent default |
| Telemetry | Two events, no details | The owner asked whether people use these features | agent default |
| Deleting a plan | Hard delete; a later change elsewhere can bring it back | Matches how every other row syncs; a soft-delete flag would not prevent it either | agent default |
| Orphaned day rows | Ignored and left in place | Tiny rows; deleting them could race with a plan row still arriving | agent default |
| Two plans on one chapter | Stacked strips and actions | Rare; simplest honest display | agent default |
| Older-version recovery | Generic per-table catch-up, not a full watermark reset | A reset can bring back rows this device deleted | agent default |
| "Read" target | The day's first chapter | No per-chapter progress within a day in this phase | agent default |

## Open questions

1. Should a plan be able to start on a date other than today? (Kevin)
2. Should "Whole Bible" offer an order other than canonical (for example Old and New Testament side by side)? That is a fixed-plan feature and is deferred. (Kevin)
3. Wording: "Shift my dates", "{k} days behind", "Mark day {d} complete". (Kevin)
4. The telemetry worker must be deployed before a build that sends `plan_started` or `plan_day_completed`, or whole batches are rejected. Nothing in the build enforces that order; it is a release step. (Kevin)

## Existing code touched

| File | Change |
|---|---|
| New `src/lib/readingPlans/` (schedule, dates) | New |
| New `src/types/readingPlan.ts`, export in `src/types/index.ts` | New |
| `src/lib/table-registry.ts` | Extended: two tables |
| `src/lib/sqlite-db.ts` | Extended: schema 12, `ensureTablesExist`, export and import |
| `src/lib/database.ts` | Extended: wrappers, export and import, cascade delete |
| `src/lib/backup.ts`, `src/lib/validation.ts` | Extended: the two tables |
| `src/lib/sync-engine.ts` | Extended: one-time catch-up for synced tables this device has not yet caught up on |
| New `src/stores/readingPlanStore.ts`; `src/App.tsx` | New store; load at startup and after sync |
| `src/stores/panelStore.ts` (`PanelType`), `src/components/SplitLayout/PanelContainer.tsx` (titles and rendering), `src/lib/appMode.ts` (all three `PANELS_OFFERED` lists) | Extended: the `'plans'` panel in every mode |
| New `src/components/ReadingPlans/` | New: panel, form, list, detail, reader strip |
| `src/components/BibleReader/NavigationBar.tsx` | Extended: "Reading plans" menu item |
| `src/components/BibleReader/MultiTranslationView.tsx` | Extended: strip and end-of-chapter actions |
| `src/lib/telemetry.ts`, `worker/src/events.ts`, `worker/README.md` | Extended: two events |
