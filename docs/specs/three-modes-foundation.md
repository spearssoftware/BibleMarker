# Three modes, Phase 2: mode foundation

Status: Reviewed
Date: 2026-11-12
Summary: Replace the "Inductive study tools" toggle with three modes (Read, Discover, Study) chosen from a switch in the top bar, make the app's chrome follow the mode, and give marks made outside a study a home of their own.

## Problem and goals

The app has one boolean, `inductiveToolsEnabled`, and a Discover panel added to a study-tool shell. Nothing tells a reader which parts belong together, and study controls show in every view. The owner wants three modes:

- **Read**: the text, marking, notes. Reading plans arrive in a later phase.
- **Discover**: Read plus the Discover panel and its helpers.
- **Study**: everything, the full inductive toolset.

Goals for this phase:

- One per-device mode value drives every place the UI branches today, including the places that currently ignore the toggle.
- A mode switch is visible in the top bar in every mode.
- The bottom tool bar appears only in Study. Settings moves to the ⋯ menu.
- Discover mode opens the Discover panel by default on wide screens.
- Marking (highlight, underline, text color, "every one in this chapter") works the same in all three modes. The app is called BibleMarker.
- A mark made in any mode is never lost by changing mode. A real study still starts as a clean slate.
- New users choose a mode on the Welcome screen. Existing users land in the mode that matches what they had.
- One opt-in telemetry event records which mode is chosen.

Roadmap: `~/.claude/plans/scalable-gliding-milner.md` (this is its Phase 2). This spec is written against branch `feat/discovery-integration`, which combines `discovery`, `main`, PR #480, the marking sheet and Phase 4b.

## Non-goals

Deferred to Phase 3 (Read mode):
- Hiding the top bar while reading.
- An "Aa" typography panel, and options to hide verse numbers.
- Saving the reading position to the verse, and "continue reading".
- Defaulting phones to one translation in Read.

Deferred to later phases:
- Reading plans (Phase 4).
- Per-chapter "what's happening here" context and other Discover content (Phase 5).
- New icons, typography and store screenshots (Phase 6). This phase keeps today's visual style.
- A draggable sheet for the phone Discover panel (Phase 6). This phase reuses the existing stacked split.

Out of scope for good:
- Syncing the mode between devices.
- A mode picker in Settings. The top-bar switch is the only control.
- Removing the orphaned components listed in the UI audit.

## Users and flows

Every user, on desktop, iPad and phone. "Wide" below means the existing horizontal layout condition in `src/hooks/useLayoutOrientation.ts` (`(min-width: 768px) and (orientation: landscape)`); "narrow" means everything else, including phones and portrait iPads.

### The mode switch

- Lives in `NavigationBar`, visible in every mode.
- Wide: a three-segment control labelled "Read", "Discover", "Study", with radio-group semantics (`role="radiogroup"`, each segment `role="radio"` with `aria-checked`).
- Narrow: one button showing the current mode's label. Tapping it opens a menu of the three modes, each with its label and one-liner.
- Desktop shortcuts: ⌘1, ⌘2, ⌘3 (Ctrl on Windows and Linux) select Read, Discover, Study.
- Switching mode closes any open panel the new mode does not offer, and clears any active Discover lens.
- Switching to Discover on a wide screen opens the Discover panel unless the user closed it earlier in Discover mode on this device.

One-liners, used in the narrow menu and on the Welcome screen:

| Mode | One-liner |
|---|---|
| Read | "Just the text. Highlight and mark as you go." |
| Discover | "See the setting, people, places and commentary beside the text." |
| Study | "The full inductive toolset: key words, observation lists, chapter titles and analysis." |

### What each mode shows

| Surface | Read | Discover | Study |
|---|---|---|---|
| Top bar: search, back, translation, location, mode switch, ⋯ | yes | yes | yes |
| ⋯ menu: "Sync", "Export page", "Settings" | yes | yes | yes |
| Bottom tool bar (`Toolbar`) | none | wide: none. Narrow: one button, "Discover" | "Discover", "Key Words", "Observe", "Analyze", "Study Tools" |
| Chapter arrows, swipe, arrow and J/K keys | yes | yes | yes |
| Marking sheet on text selection | simple sheet | simple sheet | advanced sheet, as today |
| Tap a marked word | simple mark editor | simple mark editor | that key word's Observe list, as today |
| Tap a verse number | "Add Note" | "Add Note", "Cross-References", "Hebrew/Greek" | today's items, unchanged ("Add Section Heading" still only when the verse has none) |
| "Add chapter title" button | hidden | hidden | shown |
| Existing chapter titles and section headings | shown, not editable | shown, not editable | shown, editable |
| Existing notes | shown, editable | shown, editable | shown, editable |
| Marks, including symbols | shown | shown | shown |
| Discover panel | not available | default panel | from the tool bar |
| Discover lenses and `useDiscoveryHost` background work | off | on | on |
| Study Tools panel | not available | "Chapter" and "Search" tabs; opened from links in Discover and from the verse menu; the "Hebrew/Greek" and "Cross-References" verse-menu items open their own tab for that visit, as the existing deep-link behavior does | all tabs, from the tool bar |
| Key Words panel | simple editor only, opened from the marking sheet's "Edit" or by tapping a mark | same as Read | full manager |
| Observe, Analyze panels | not available | not available | from the tool bar |
| Number keys 1–4 | no effect | no effect | open Key Words, Observe, Analyze, Study Tools |
| Settings › Studies tab | hidden | hidden | shown |
| Settings › Appearance rows for symbols and multi-word marking | hidden | hidden | shown |

"Simple sheet" and "simple mark editor" are the tools-off marking sheet and `SimpleKeyWordEditor` from the marking-sheet work: style (Highlight, Underline, Text color), color, "just here" or "every one in this chapter", and Edit and Remove for an existing chapter mark.

### Discover panel behavior

- Wide, Discover mode: the panel is open by default. If the user closes it, it stays closed on this device until they reopen it or tap a Discover link. There is a way to reopen it without leaving the mode: selecting the already-selected "Discover" segment toggles the panel.
- Narrow, Discover mode: the panel is closed by default. The single "Discover" button at the bottom toggles it, using the existing stacked split.
- In Discover mode, opening any other panel (Study Tools, Settings, the simple mark editor) replaces the Discover panel. Closing that panel returns to the Discover panel if it was open before, otherwise to no panel. Only closing the Discover panel itself counts as "closed by the user".
- A Study Tools tab revealed by a verse-menu link stays visible until the Study Tools panel closes, as `extraVisibleTabs` in `ReferenceToolsPanel.tsx` behaves today.
- Study mode: unchanged. No panel is open at launch; "Discover" is a tool-bar tab, hidden when the `discovery-enabled` flag is off, as today.
- Discover cards in Discover mode: `RepetitionCard` keeps its existing tools-off label "Highlight it in this chapter"; `ConnectorsCard`'s "Add to Flow" stays Study only.

### First launch

1. The Welcome screen replaces its current feature list with the heading "How do you want to start?", three choices (label and one-liner each), and the line "You can switch any time from the top bar."
2. The existing "Get Started" and "Take Tour" buttons stay and are disabled until a mode is chosen. Clicking the backdrop no longer dismisses the screen. Choosing a mode and pressing either button sets the mode on this device and continues to the translation library, as today. "Take Tour" runs the tour in step 3; "Get Started" skips it.
3. The tour then runs for the chosen mode:
   - Read: three steps: `navigation`, `reading`, and a new `marking` step titled "Mark as you read" with the body "Select a word or phrase to highlight, underline or color it. Choose "every one in this chapter" to mark each place it appears."
   - Discover: the Read steps, then the existing `discovery` step retitled "Discover" with the body "Open Discover to see where and when this chapter happens, who is in it, and what others have written about it."
   - Study: the Read steps, then today's `toolbar`, `keywords`, `observe`, `analyze`, `reference`, `search`, `settings`, `studies` steps.
   - Every tour ends with a step titled "Switch modes" with the body "Read, Discover and Study are one tap apart in the top bar."
4. "Restart onboarding" in Settings › Help reruns the tour for the current mode and does not show the mode choice again.

### Updating from an earlier version

On the first launch of this version on a device that has already seen the Welcome screen:

`inductiveToolsEnabled` never shipped on `main`; it exists only in builds from `discovery`. The four upgrade cases, plus the fresh install, are the five inputs the unit test covers:

| `inductiveToolsEnabled` | Database has a marking preset, annotation or note | Mode |
|---|---|---|
| `true` | either | Study |
| `false` | either | Discover |
| absent | yes | Study |
| absent | no | Discover |
| (Welcome screen not yet seen) | n/a | Welcome screen asks |

- A one-time, dismissible banner replaces `ToolkitRestoredBanner`: "BibleMarker now has three modes. You're in Study. Switch any time from the top bar." The mode named is the effective mode: "Discover" for users who land there, or "Read" if the `discovery-enabled` flag is off at that moment.
- The banner's dismissal is stored in the same per-device store as the mode.
- The "Inductive study tools" row in Settings › Bible is removed.

### Marks and studies

Today every mark is tied to whichever study is active when it is made, and Read and Discover have no study controls. The rule from now on:

- There is a built-in study named "My Bible". It is always first in Settings › Studies, is selected by default, and offers only "select": no rename, delete, export or PDF controls. The existing "Clear Active Study" button is removed; selecting "My Bible" replaces it.
- Read and Discover always work in "My Bible", whatever study is selected in Study mode.
- Study mode works in the study selected in Settings › Studies. That selection is remembered per device, as `study-state` is today, and is not changed by visiting Read or Discover.
- Everything created while "My Bible" is in effect belongs to "My Bible": highlights, chapter marks, key words, and in Study mode also chapter titles, section headings, lists, people, places and time expressions.
- "My Bible" content shows in Read, in Discover, and in Study while "My Bible" is selected. It is hidden while another study is selected. A real study is a clean slate.
- Content created inside a real study shows only in Study mode with that study selected. This includes chapter titles and section headings: a title written inside "Romans" does not show in Read.
- Key words and marks that exist before this update and belong to no study keep today's behavior exactly: key words show in every study, plain highlights show only when no real study is selected. Chapter titles and section headings with no study keep showing everywhere.
- In the full Key Words manager (Study only) a key word has a checkbox "Use in all studies". On means it belongs to no study and shows in every study, like the pre-update key words. Off, while "My Bible" is selected, means it belongs to "My Bible". Marks created in Read or Discover always start with it off.
- Notes have no study today and keep showing in every mode and every study.
- A chapter mark made in Read appears in the full Key Words manager in Study (with "My Bible" selected), where its scope can be widened and a symbol and category added.

## Data and interfaces

### Mode (new, per device)

- `appMode: 'read' | 'discover' | 'study'`, held in a new device-local persisted Zustand store, in the same way as `panel-state` and `discovery-prefs`. It is not stored in the synced `preferences` row.
- Until the stored mode has loaded, the UI renders as Read (the least chrome), as the existing `isHydrated` guard does for the toggle.
- Effective mode: when the remote `discovery-enabled` flag is off (`useDiscoveryEnabled()` is false), a stored `'discover'` behaves as Read and the switch offers "Read" and "Study" only. The stored value is kept, so Discover returns when the flag does.
- Selectors replace every read of `inductiveToolsEnabled`, hydrated or raw: one for "is Study", one for "Discover available" (mode is Discover or Study, and the flag is on).
- `inductiveToolsEnabled` is read once per device to seed the mode and is never written again. `maybeEnableInductiveTools` in `src/lib/toolkitMigration.ts` is replaced by the upgrade rule above.

### Panel memory (extends `discoveryPrefsStore`)

- A per-device flag for "Discover panel closed by the user in Discover mode". No other panel state becomes persistent.

### Marks and studies

- "My Bible" is a reserved, fixed study id (a constant, the same on every device), written to the existing `studyId` / `study_id` fields. No column is added and no existing row is rewritten, so there is no data migration and nothing that could run differently on two devices.
- `studyId` now has three meanings: absent = all studies (every pre-update row, and key words with "Use in all studies" on); the reserved id = "My Bible"; any other id = that study.
- One selector, the effective study, replaces every direct read of `studyStore.activeStudyId`: in Read and Discover it is always "My Bible"; in Study it is the selected study, with "no study selected" treated as "My Bible". Every reader and writer of the active study uses it. Known consumers on this branch: `Toolbar.tsx` (`applyPresetToSelection`, `markWordInChapter`, person and place creation, `filterPresetsByStudy` call), `useAnnotations.ts`, `discoveryActions.ts`, `RepetitionCard.tsx`, `VerseText.tsx`, `MultiTranslationView.tsx`, `discoveryStore.ts`, `ExportPopover.tsx`, `EntityNotes.tsx`, `KeyWordManager.tsx`, and the heading and title queries in `sqlite-db.ts` (`study_id IS NULL OR = ?`).
- Visibility under the effective study E:
  - Presets (`filterPresetsByStudy`): shown when `studyId` is absent or equals E. This is today's rule once E is never null.
  - Annotations (`filterAnnotationsByStudy`): an annotation with a preset follows its preset's study, as today. A preset-less annotation with a `studyId` shows when it equals E. A preset-less annotation with no `studyId` (pre-update) shows only when E is "My Bible", which is today's "no study selected" rule.
  - Chapter titles and section headings: shown when `study_id` is null or equals E, as the existing queries do.
- "Export page" in Read and Discover exports "My Bible" content.

### Telemetry

- The wire format carries an event name and one `feature` string, nothing else (`src/lib/telemetry.ts`, `worker/src/events.ts`). So: new event `mode_chosen` with `feature` one of `mode_read`, `mode_discover`, `mode_study`. No source is recorded.
- Sent once per mode change, including the Welcome choice and the upgrade seed. Follows the existing opt-in setting.
- The worker rejects a whole batch that contains an unknown event name. The worker change that accepts `mode_chosen` is deployed before any app build that sends it.

### Keyboard

- ⌘/Ctrl+1, 2, 3 select the mode. Plain 1–4 open the four Study tools in Study mode and do nothing otherwise. Neither fires while focus is in a text field.

## Edge cases and failure modes

- **Mode store fails to load or holds an unknown value**: treat as no stored mode and run the seeding rule (Welcome choice, or the upgrade rule).
- **Existing user with no data** lands in Discover and sees the Discover banner. If they later sign in and sync down marks, the mode does not change by itself.
- **Second device, same account**: it is a fresh install, so the Welcome screen asks. Its mode is independent.
- **An older app version on another device** does not know the reserved "My Bible" id and treats it as an unknown study, so "My Bible" marks made on the new version are hidden there (not deleted) until that device updates. Accepted.
- **Mode store lost after seeding**: the banner can show once more and `mode_chosen` can be sent once more. Accepted.
- **Switching out of Study while a chapter-title or section-heading editor is open**: the editor saves what was typed, as it does whenever it loses focus, and closes. An empty editor just closes. There is no "discard" prompt, because nothing is discarded. A note editor is available in every mode and stays open.
- **Switching out of Study while typing in an Observe-panel form** (observation, time expression): the Observe panel closes and the unsaved text is lost, the same as closing that panel today. Known limitation.
- **Search** is not filtered by study or mode. A result can open a passage whose marks belong to a study that is not in effect; the passage opens and those marks stay hidden.
- **Backup and restore** do not carry the mode. After a restore the device keeps the mode it had.
- **Multi-translation**: the mode applies to every column alike.
- **Switching mode with a text selection active**: the marking sheet closes and the selection clears.
- **Kill switch turns off while the user is in Discover**: the panel closes, the switch shows two options, and the reader stays where it is.
- **Narrow screen rotated to wide in Discover mode**: the panel follows the wide rule (open unless closed by the user).
- **A study is selected in Study mode, then the user switches to Read**: marks from that study are hidden, "My Bible" marks show. Switching back to Study restores the study's view.
- **Deleting a real study** behaves as today. "My Bible" offers no delete or rename control.
- **Telemetry off**: no `mode_chosen` event is sent or queued.
- **Reduced motion**: the switch and panel changes do not animate when `prefers-reduced-motion: reduce` is set.

## Constraints

- Stack and conventions per `CLAUDE.md`: Zustand store named `useXxxStore`, shared components (`Button`, `SegmentedControl`), `scripture-*` colors only, no new npm dependencies.
- No database schema change and no `SCHEMA_VERSION` bump. `marking_presets` has fixed columns, so nothing new is stored on a preset; "My Bible" uses the existing `study_id` columns.
- Delivered as four PRs into `discovery`, in this order. `discovery` is not released between them, but each PR leaves the app usable and the onboarding tour working:
  - 2a: mode store, selectors, upgrade rule and banner, every existing gate moved to the mode, the switch, shortcuts, `mode_chosen` (worker first), the bottom bar per mode, "Settings" in ⋯, removal of the "Inductive study tools" row. Tour steps whose targets move (`settings`, `discovery`) are retargeted here.
  - 2b: Discover default panel and narrow "Discover" button, panel return rule, verse menu, marked-word tap, read-only titles and headings, Study-only Settings rows and tab.
  - 2c: Welcome screen and per-mode tours.
  - 2d: "My Bible", the effective study, and "Use in all studies". Until 2d lands, Read and Discover marks attach to the selected study as they do today; criteria 14–16 apply from 2d.
- Tests required:
  - Unit: the selectors (including the kill switch), the upgrade rule (the five rows of the table above), the effective study per mode, `filterPresetsByStudy` and `filterAnnotationsByStudy` for all three `studyId` meanings.
  - Component: `NavigationBar` switch (wide and narrow), `Toolbar` per mode, `VerseNumberMenu` per mode, `WelcomeScreen`, `OnboardingTour` per mode. Existing tests that mock `{ inductiveToolsEnabled }` are moved to the mode.
  - `just check` passes on every PR.
- Manual passes before each PR is called done: iOS Simulator phone portrait, iPad landscape, desktop dev build (`pnpm run tauri:dev`).

## Acceptance criteria

1. Given a fresh install, when the app opens, then the Welcome screen shows "How do you want to start?" with "Read", "Discover" and "Study" and their one-liners; choosing one sets that mode; the tour that follows has the steps listed for that mode.
2. Given a database from version 3.2.x with at least one annotation, when this version first launches, then the mode is Study and the banner reads "BibleMarker now has three modes. You're in Study. Switch any time from the top bar." Given the same with no presets, annotations or notes, then the mode is Discover and the banner says "Discover". Dismissing the banner and relaunching does not show it again.
3. In every mode the top bar shows the switch: three segments at wide widths, one labelled button with a three-item menu at narrow widths. On desktop ⌘1, ⌘2, ⌘3 select Read, Discover, Study.
4. In Read: no bottom bar; no "Add chapter title" button; tapping a verse number shows only "Add Note" and "Cancel"; selecting text shows the simple marking sheet; `useDiscoveryHost` runs no analysis and loads no cross-references (asserted in its unit test).
5. In Discover at a wide width the Discover panel is open at launch; closing it and relaunching keeps it closed; selecting "Discover" on the switch again reopens it. At a narrow width the panel is closed at launch and a single "Discover" button at the bottom toggles it. Tapping a verse number shows "Add Note", "Cross-References", "Hebrew/Greek" and "Cancel". Closing Study Tools, Settings or the mark editor shows the Discover panel when it was open before, or when the layout is wide and the user has not closed it; otherwise no panel is shown.
6. In Study the bottom bar shows "Discover", "Key Words", "Observe", "Analyze", "Study Tools"; keys 1–4 open the last four; the verse menu shows the same items as before this change, including "Add Section Heading" on a verse with no heading.
7. Given "My Bible" is selected, a word marked "every one in this chapter" in Read is marked in Discover and Study, and appears in the full Key Words manager in Study where its scope can be widened and a symbol added.
8. A chapter title and a section heading written in Study with "My Bible" selected are visible in Read and Discover and cannot be edited there. A title written with "Romans" selected is not shown in Read.
9. After choosing Study and relaunching, the mode is Study. With two devices on one account, set one to Study and the other to Read, then run "Sync" on both: each device still shows its own mode.
10. With the `discovery-enabled` flag off, the switch offers "Read" and "Study" only and a stored Discover mode renders as Read. With the flag back on, Discover returns.
11. With telemetry on, each mode change sends one `mode_chosen` event whose `feature` is `mode_read`, `mode_discover` or `mode_study`; with telemetry off, none is sent (unit test on `track`). The worker test suite accepts a batch containing `mode_chosen`.
12. "Settings" is in the ⋯ menu in every mode and opens the Settings panel. Settings › Bible has no "Inductive study tools" row.
13. `rg -l "inductiveToolsEnabled" src -g '!*.test.*' -g '!**/__tests__/**'` lists only `src/types/preferences.ts`, `src/stores/preferencesStore.ts` and the module that seeds the mode.
14. Given a real study "Romans" is selected in Study mode and the user switches to Read, highlights a verse and marks a word "every one in this chapter", and switches back to Study, then both marks are hidden while "Romans" is selected and visible when "My Bible" is selected.
15. Given a key word with no study that existed before the update, then it still marks text while "Romans" is selected, and its "Use in all studies" checkbox is on. Turning the checkbox off while "My Bible" is selected hides it in "Romans".
16. "My Bible" is first in Settings › Studies, is selected on a fresh install, and has no rename, delete, export or PDF control. There is no "Clear Active Study" button.
17. `just check` exits 0.

## Decisions

| Decision | Choice | Why | Decided by |
|---|---|---|---|
| Mode model | Layers: Read ⊂ Discover ⊂ Study | One switch, no setup | User (approved roadmap) |
| Switch placement | Top bar; bottom tool bar only in Study | Read and Discover are not tool modes | User (approved roadmap) |
| Mode storage | Per device, not synced | The synced preferences row is rewritten whole and would revert the mode | Agent default (reviewer finding), accepted in roadmap |
| Upgrade landing | Marks or notes → Study, otherwise Discover | Nobody loses tools they were using | User |
| Upgrade banner wording | As quoted | | User |
| Read before Phase 3 | Ships as today's reader minus tool chrome | Testable early | User |
| Hebrew/Greek from the verse menu | Discover and Study | | User |
| Marking in Read | Full simple marking sheet, including word matching | "The app is BibleMarker" | User |
| Titles and headings below Study | Shown, read-only | Your work is not hidden | User |
| Phone Discover | Existing stacked split, one "Discover" button | Sheet waits for the visual pass | User |
| Shortcuts | ⌘1/2/3 for modes; 1–4 for Study tools | | User |
| Mode labels and one-liners | As quoted | "Roll with this for now" | User |
| Tour for Read | A quick one | | User |
| Telemetry | `mode_chosen`, opt-in | "Do people actually use this stuff" | User |
| Marks made in Read and Discover | Go to a default study; real studies stay a clean slate | | User |
| Default study name | "My Bible" | Needs a name in the Studies list | Agent default |
| Default study implementation | A reserved study id in the existing `studyId` fields | No schema change, no migration, same on every device | Agent default (reviewer finding) |
| Existing no-study key words and marks | Behave exactly as today; "Use in all studies" is the same state, made visible | Existing users lose nothing inside their studies | Agent default |
| Titles and headings written inside a real study | Stay in that study; not shown in Read | Consistent with the clean slate | User |
| Notes | Show in every mode and study | They have no study today | Agent default |
| `mode_chosen` payload | Mode encoded in `feature`; no source | Wire format has one string | Agent default (reviewer finding) |
| Welcome screen flow | Mode required; "Get Started" and "Take Tour" kept; no backdrop dismiss | A mode must be chosen | Agent default |
| "My Bible" row in Studies | Select only | Export of everything is out of scope | Agent default |
| Welcome heading and helper line, tour step copy | As quoted | Needed verbatim | Agent default |
| Reopening a closed Discover panel on wide screens | Select the "Discover" segment again | No bottom bar to hold a button | Agent default |
| Kill switch off | Discover behaves as Read; switch shows two options | | Agent default |
| Mode switch closes unavailable panels | Yes | | Agent default |
| No mode picker in Settings | Switch is the only control | One place to look | Agent default |
| Settings rows for symbols, and the Studies tab | Study only | They configure Study-only features | Agent default |

## Open questions

1. Is "My Bible" the right name for the default study? (Kevin)
2. Is "Use in all studies" wanted as a visible checkbox? Without it, new key words can no longer be made to span studies. (Kevin)
3. Welcome and tour wording marked "Agent default" above needs Kevin's read. (Kevin)

## Existing code touched

| File or module | Change |
|---|---|
| New store under `src/stores/` for the mode | New |
| `src/stores/preferencesStore.ts`, `src/types/preferences.ts` | Extended: selectors move to the mode; the boolean becomes seed-only |
| `src/lib/toolkitMigration.ts` | Replaced by the upgrade rule |
| `src/components/shared/ToolkitRestoredBanner.tsx` | Replaced by the modes banner |
| `src/App.tsx` | Extended: seeding, banner, shortcut wiring |
| `src/components/BibleReader/NavigationBar.tsx` | Extended: switch, "Settings" in ⋯ |
| `src/components/MarkingToolbar/Toolbar.tsx`, `SelectionMenu.tsx` | Extended: per-mode bar and sheet |
| `src/components/BibleReader/MultiTranslationView.tsx`, `VerseNumberMenu.tsx`, `src/lib/keywordTap.ts` | Extended: per-mode gates, read-only titles and headings |
| `src/hooks/useDiscoveryHost.ts`, `useChapterAnalysis.ts`, `useLookCloserState.ts` | Extended: off in Read |
| `src/components/SplitLayout/PanelContainer.tsx`, `src/stores/panelStore.ts`, `src/stores/discoveryPrefsStore.ts` | Extended: Discover default panel, return-to-Discover, closed flag |
| `src/components/Reference/ReferenceToolsPanel.tsx` | Extended: tabs by mode |
| `src/components/Discovery/RepetitionCard.tsx`, `ConnectorsCard.tsx` | Extended: read the mode instead of the raw flag |
| `src/components/Settings/BibleSection.tsx`, `AppearanceSection.tsx`, `SettingsPanel.tsx`, `StudiesSection.tsx` | Extended: row removed, Study-only rows and tab, "My Bible" |
| `src/components/Onboarding/WelcomeScreen.tsx`, `OnboardingTour.tsx` | Replaced content: mode choice, per-mode tours |
| `src/hooks/useKeyboardShortcuts.ts` | Extended |
| `src/lib/telemetry.ts`, `worker/src/events.ts` | Extended: `mode_chosen` |
| `src/lib/studyFilter.ts`, `src/stores/studyStore.ts`, `src/components/KeyWords/KeyWordManager.tsx` | Extended: "My Bible", effective study, "Use in all studies" |
| `src/hooks/useAnnotations.ts`, `src/lib/discoveryActions.ts`, `src/components/BibleReader/VerseText.tsx`, `ExportPopover.tsx`, `src/stores/discoveryStore.ts`, `src/components/Reference/EntityNotes.tsx` | Extended: read the effective study instead of `activeStudyId` |
| `src/lib/sqlite-db.ts` | Left alone: no schema change; heading and title queries are called with the effective study |
| `docs/specs/discovery-phase-3-setting-and-connections.md` | Left alone; its "discovery-mode / inductive-mode" wording is superseded by this spec |
