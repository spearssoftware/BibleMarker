# Discovery depth

Status: Blocked (not built; needs an owner decision)
Date: 2026-11-13
Summary: Phase 5 was meant to make the Discover panel say what a chapter is about and who is in it. The version that needs no new content was specified, reviewed against the bundled data, and found not good enough to build. This file records why and what the options are.

## What was proposed

The roadmap's answer to "does Discover bring context to what the user is reading?" was a written "what's happening here" record for every chapter. That needs new content for 1,189 chapters, which the cost constraint rules out for now. So a no-new-content version was drafted, using only what is already bundled:

- **5a. Chapter outline.** An "In this chapter" block in the Setting card listing Matthew Henry's Concise Commentary section titles for the chapter, each with its verses, tappable, with the current section marked.
- **5b. Who they are.** Under each person in "Who's here", the first sentence of that person's bundled dictionary text (`person.name_meaning` in `src-tauri/resources/gnosis-lite.db`, which holds Easton's Bible Dictionary entries).

A clean-context review checked both against the code and the data. Neither holds up.

## Why 5b cannot ship as specified

The dictionary text is attached to people by name, and for well-known people it is often the wrong article:

| Person (as tagged in the chapter) | Text attached to them |
|---|---|
| Lot, Abraham's nephew (Genesis 12) | The article on the casting lot: "a small stone used in casting lots" |
| Jesus (John 1, Romans 8, Philippians 2) | The article on the title "Christ": "Anointed, the Greek translation of…" |
| Joseph son of Jacob (Genesis) | "The foster-father of our Lord" |
| Moses | Opens with a name gloss; the next sentence is about Jacob going down to Egypt |

Even where the article is the right one, a clean first sentence is hard to extract:

- Name meanings are usually a lead-in before a comma, not a separate sentence ("Father of a multitude, son of Terah…"), so a "skip the gloss sentence" rule never fires.
- 1,810 of the 1,816 entries embed scripture references as markdown links; removing them leaves empty parentheses unless those are cleaned too.
- Splitting on a full stop breaks on abbreviations ("Gen.", "Heb.", "i.e.", "Sheshonk I.").
- Some entries are only a reference and are empty once cleaned.

Sample coverage, excluding God and the Holy Spirit: John 1 has an entry for 11 of 11 people; Genesis 12 for 4 of 4, two of them wrong; Romans 8 for 1 of 1, wrong; Philippians 2 for 2 of 3.

Showing a wrong sentence about who Jesus or Lot is would be worse than showing nothing.

## Why 5a is not worth building as specified

- **It does not fix the motivating case.** The spec opened with Psalm 23's near-empty Setting card. Section titles exist only where the commentary's outline lines up with its sections; Psalm 119 is all untitled sections and Psalm 118 is a single entry, so Psalm 23 very likely gets no outline.
- **It repeats what is already on screen.** The follow-along commentary card directly below already shows the current section's title and verse range.
- **The titles read roughly** as a first view of a chapter ("The baptism of John of Christ John's testimony").
- **Coverage cannot be measured in the test suite.** The tests have a 41-chapter fixture; reading the bundled module in tests would be new infrastructure.

## Options for the owner

1. **Generate the content.** A short written summary per chapter and a checked one-line identity for the most-named people. This is what the roadmap originally described. It has a one-time content cost and needs review of the output.
2. **Fix the data, then build 5b.** Correct the person-to-article links in the reference database (a data task in the Gnosis source, not in this app), add a small extraction step that produces clean one-line identities at build time, and ship only reviewed lines.
3. **Build a reduced 5a.** Show the outline only for chapters with complete titled sections and accept that psalms and many letters get nothing.
4. **Leave Discover as it is** for this release.

Recommendation: option 4 for this release, and option 1 or 2 when the cost constraint allows. Options 2 and 3 are the only ones with no content cost, and 3 does little for the chapters that prompted the question.

## Smaller findings worth keeping

- The Setting card has no empty state: for a chapter with no people, places, events or timeline year it shows a title and a collapsed "About {Book}" row only.
- The bundled reference database also holds Nave's and Torrey's topic indexes linked to verses, unused in the app. Topics for a chapter are a possible no-content addition, not assessed for quality here.
- `chapter_timeline` has 1,062 rows; Psalm 23 has none.
