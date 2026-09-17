/**
 * Genre Compass — hand-authored genre metadata for every book of the Bible.
 *
 * Pure data, no analysis. Orientation lines describe a book's *form* only —
 * never its meaning — and every question is answer-free: it points the
 * reader at something to find or notice, it never asserts what a passage
 * says. Same register as `connectors.ts`'s article-free em-dash prompts.
 *
 * Two safety requirements drive the wording in this file:
 * — Content-blind: a question must hold up for ANY chapter of its genre,
 *   including the atypical ones a genre label doesn't warn you about
 *   (a genealogy inside a narrative book, a song inside a law book, a
 *   narrative closing chapter inside a law book). Most questions are
 *   hedged ("if any", "if it does") so an atypical chapter just yields a
 *   quiet "no" instead of a false or leading presupposition. A handful of
 *   chapters are famous enough exceptions that they get a dedicated,
 *   better-fitting question instead of a hedge — see
 *   `CHAPTER_QUESTION_OVERRIDES` below.
 * — Neutral: a question or orientation line may describe literary form
 *   (parallelism, refrain, audience, structure) but must never assert a
 *   reading, a contested critical claim, or a specific chapter's content.
 *
 * Borderline genre calls (documented rather than hidden):
 * — Exodus: half the book is wilderness/exodus narrative (1-19, 32-34), half
 *   is covenant law and tabernacle instruction (20-31, 35-40). Classified
 *   `law` because the Sinai material is the book's structural hinge and its
 *   lasting identity ("the law of Moses" begins here). The `law` orientation
 *   is written to be true of this mix (law given inside a journey), not just
 *   the legal chapters.
 * — Numbers: alternates census/legal material with wilderness narrative
 *   (the spies, Korah, Balaam). Classified `narrative` because the through-
 *   line readers actually follow is the journey, not the law lists.
 * — Daniel and Revelation: both `apocalyptic`, whose orientation deliberately
 *   names a *mixed* form ("part story, part vision") rather than picking one,
 *   since both books genuinely are half narrative, half vision.
 */

export type Genre =
  | 'law'
  | 'narrative'
  | 'poetry'
  | 'wisdom'
  | 'prophecy'
  | 'gospel'
  | 'acts'
  | 'epistle'
  | 'apocalyptic';

export const BOOK_GENRE: Record<string, Genre> = {
  // Old Testament
  Gen: 'narrative',
  Exod: 'law', // borderline — see file header
  Lev: 'law',
  Num: 'narrative', // borderline — see file header
  Deut: 'law',
  Josh: 'narrative',
  Judg: 'narrative',
  Ruth: 'narrative',
  '1Sam': 'narrative',
  '2Sam': 'narrative',
  '1Kgs': 'narrative',
  '2Kgs': 'narrative',
  '1Chr': 'narrative',
  '2Chr': 'narrative',
  Ezra: 'narrative',
  Neh: 'narrative',
  Esth: 'narrative',
  Job: 'wisdom',
  Ps: 'poetry',
  Prov: 'wisdom',
  Eccl: 'wisdom',
  Song: 'poetry',
  Isa: 'prophecy',
  Jer: 'prophecy',
  Lam: 'poetry',
  Ezek: 'prophecy',
  Dan: 'apocalyptic',
  Hos: 'prophecy',
  Joel: 'prophecy',
  Amos: 'prophecy',
  Obad: 'prophecy',
  Jonah: 'narrative',
  Mic: 'prophecy',
  Nah: 'prophecy',
  Hab: 'prophecy',
  Zeph: 'prophecy',
  Hag: 'prophecy',
  Zech: 'prophecy',
  Mal: 'prophecy',

  // New Testament
  Matt: 'gospel',
  Mark: 'gospel',
  Luke: 'gospel',
  John: 'gospel',
  Acts: 'acts',
  Rom: 'epistle',
  '1Cor': 'epistle',
  '2Cor': 'epistle',
  Gal: 'epistle',
  Eph: 'epistle',
  Phil: 'epistle',
  Col: 'epistle',
  '1Thess': 'epistle',
  '2Thess': 'epistle',
  '1Tim': 'epistle',
  '2Tim': 'epistle',
  Titus: 'epistle',
  Phlm: 'epistle',
  Heb: 'epistle',
  Jas: 'epistle',
  '1Pet': 'epistle',
  '2Pet': 'epistle',
  '1John': 'epistle',
  '2John': 'epistle',
  '3John': 'epistle',
  Jude: 'epistle',
  Rev: 'apocalyptic',
};

/** Short "book name — label" tag for the Discover panel's genre card title. */
export const GENRE_LABEL: Record<Genre, string> = {
  law: 'a book of law',
  narrative: 'a story',
  poetry: 'a collection of poems',
  wisdom: 'wisdom literature',
  prophecy: 'a prophecy',
  gospel: 'a gospel',
  acts: 'a travel narrative',
  epistle: 'a letter',
  apocalyptic: 'a book of visions',
};

export const GENRE_ORIENTATION: Record<Genre, string> = {
  law: 'Law and story woven together — rules and instructions given inside a larger journey.',
  narrative: 'A story — people, places, and events move toward what happens next.',
  poetry: 'Hebrew poetry — lines paired by parallel or contrasting thought, never by rhyme.',
  wisdom: 'Sayings and long reflection, weighing how life actually plays out.',
  prophecy: 'An oracle — warning and hope addressed to a specific audience, often in poetic lines.',
  gospel: 'An account of Jesus — his words and actions, arranged for a particular audience.',
  acts: 'A travel narrative — the story keeps moving, carried from place to place by different people.',
  epistle: 'A letter, written to answer real problems on the other end.',
  apocalyptic: 'Part story, part vision — symbol and scene mixed together.',
};

export const GENRE_QUESTIONS: Record<Genre, readonly string[]> = {
  law: [
    'What would break if this rule went unheeded — does the chapter say, or leave it unstated?',
    "Legal language usually names who it binds — if this chapter does, who is it?",
    'Some legal material comes with a penalty attached, some with a promise, some with neither — which is this?',
    'Case law often pictures a scenario before it legislates — if this chapter does, what situation is it picturing?',
    "Some rules explain themselves and some don't — where is a reason given, if anywhere?",
  ],
  narrative: [
    "Every story moves — what's different between the first verse and the last?",
    'Track the transitions in this chapter — where does one section end and the next begin, and what marks the change?',
    'If anyone speaks in this chapter, notice who else stays silent — what might that silence be doing?',
    'Time moves unevenly here — find where it slows down to a single moment, if it does.',
    'Follow the names through this chapter — what carries over from one to the next?',
  ],
  poetry: [
    'Hebrew poetry rhymes ideas, not sounds — find two lines that say the same thing differently.',
    'Some lines sharpen by contrast, not restatement — find a line answered by its opposite.',
    'Follow one image through the poem — where does it change or return?',
    'Poems shift address — who is being spoken to at the start, and who by the end?',
    'Trace the swings in tone — where does it turn, and on what word?',
    'Some poems build in a refrain — if this one does, what comes back more than once, and where?',
  ],
  wisdom: [
    'Wisdom sayings trade in comparison — find two things being weighed against each other.',
    'Some lines describe how life usually goes and some argue with that — which is this one doing?',
    'Some wisdom lines are built for memory — what, if anything, makes this line easy to carry?',
    'Long arguments circle back — if this chapter keeps returning to one question, what is it?',
    'Compare this chapter with another wisdom chapter you’ve read — where do they agree, and where might they read differently?',
  ],
  prophecy: [
    'Prophets mix warning and hope — which does this chapter lean toward, if either?',
    'An oracle is addressed to someone specific — who is being spoken to here?',
    'Find the image the prophet reaches for, if there is one — what everyday thing is being used to say something bigger?',
    'Judgment oracles name a charge — what is the audience accused of, if anything, in this chapter?',
    'Prophecy sometimes points to more than one moment — if this chapter does, where does it seem nearest, and where furthest out?',
  ],
  gospel: [
    'A gospel scene centers on Jesus one way or another — is he speaking, acting, or the one people react to?',
    'If this chapter includes a question, notice who asks it and who answers it.',
    "Each gospel writer chooses what to include — pick one detail here and see whether another gospel covers the same event, and if so, what it includes.",
    'Track the reactions around the edges of the scene, if there are any — who is amazed, who is offended, who says nothing?',
    'A gospel writer chooses what to include — what does this chapter spend the most space on?',
  ],
  acts: [
    'Who carries the story forward from here — is it the same person as last chapter, or someone new?',
    'The message keeps moving — where has it just traveled to, and by what route?',
    'Notice who is doing the speaking in this chapter — and who is only listening.',
    'Opposition shows up throughout Acts — where does it come from in this chapter, if anywhere?',
    'Something often changes hands in Acts — attention, authority, or welcome — track what it is here, if anything does.',
  ],
  epistle: [
    "Letters often answer problems — if this chapter is, what's the problem?",
    'Find the connecting word, if there is one, where the letter turns from argument to instruction — or back again.',
    'A letter assumes its reader already knows things — what does this chapter seem to assume you know?',
    "Track the pronouns — where does the writer say 'I', where 'you', where 'we'?",
    'Letters often build a case before they apply it — is this chapter doing one, the other, or neither?',
  ],
  apocalyptic: [
    'If this chapter uses a symbol, what might it be standing in for?',
    'Find where the vision breaks into plain explanation, if it does — what gets explained outright?',
    'Numbers carry weight in this kind of writing — which number shows up, and how often?',
    "If this chapter is a vision, track who's seeing it — what do they react to as it unfolds?",
    'Part of this book reads like a story and part like a vision — which is this chapter doing?',
  ],
};

const GENEALOGY_QUESTION =
  'This chapter is a list, not a scene — what pattern repeats from entry to entry, and where does it break?';

const SONG_QUESTION =
  'The story pauses for a song here — find the line that repeats or circles back within it.';

/** Build a `{ chapter: question }` map for a contiguous, inclusive chapter range. */
function chapterRangeOverrides(start: number, end: number, question: string): Record<number, string> {
  const entries: Record<number, string> = {};
  for (let chapter = start; chapter <= end; chapter++) {
    entries[chapter] = question;
  }
  return entries;
}

/**
 * Per-chapter overrides for chapters whose content is famously not their
 * book's genre — a genealogy inside a narrative or gospel book, a song
 * inside a narrative or law book, a narrative closing chapter inside a law
 * book. Kept modest and obviously-correct rather than exhaustive: most
 * atypical chapters are handled by the hedges in `GENRE_QUESTIONS` instead.
 * Keyed by OSIS book id (from `BOOK_GENRE`), then 1-based chapter number.
 */
export const CHAPTER_QUESTION_OVERRIDES: Record<string /* OSIS book id */, Record<number, string>> = {
  // Genealogies embedded in narrative/gospel books.
  Gen: { 5: GENEALOGY_QUESTION, 10: GENEALOGY_QUESTION, 36: GENEALOGY_QUESTION },
  '1Chr': chapterRangeOverrides(1, 9, GENEALOGY_QUESTION),
  Num: { 1: GENEALOGY_QUESTION, 26: GENEALOGY_QUESTION },
  Ezra: { 2: GENEALOGY_QUESTION },
  Neh: { 7: GENEALOGY_QUESTION },
  Matt: { 1: GENEALOGY_QUESTION },
  Luke: { 3: GENEALOGY_QUESTION },

  // Songs embedded in narrative/law books.
  Exod: { 15: SONG_QUESTION },
  Judg: { 5: SONG_QUESTION },

  // Deuteronomy's closing chapter is Moses's death narrative, not case law.
  Deut: { 34: 'This chapter closes out both a life and a book — what does it hand off, and to whom?' },
};

/**
 * Section vocabulary for cross-references (`CrossRefsCard`) — the first, gentlest rung
 * of the reveal ladder, rendered as "It's in {label}." before the reference
 * itself is shown. Hand-authored and **not derived from `BOOK_GENRE`**: the
 * two maps answer different questions. `BOOK_GENRE` says what a book reads
 * like ("Genesis is narrative"); this map says where a reader would look for
 * it ("Genesis is in the law") — the mental section a reader reaches for when
 * told "it's somewhere earlier in the Bible," which for the Pentateuch is
 * "the Torah/the law," not "the stories." Labels must (a) read naturally
 * completing that sentence, (b) name a *section*, never a single book or a
 * meaning, and (c) stay in plain English for a non-scholar. Psalms gets its
 * own label rather than folding into "the wisdom books" or a "poetry"
 * bucket — it is by far the most common cross-reference target in the
 * cross-reference data, and lumping it in would waste the hint on the one
 * book most worth naming precisely.
 *
 * Judgment calls:
 * — Lamentations: genre-wise it's poetry, not prophecy, but it sits in the
 *   prophets' canonical span and pairs with Jeremiah's ministry, so it's
 *   filed under "the prophets" — nowhere better for a reader to reach for it.
 * — Daniel: `BOOK_GENRE` calls it apocalyptic, but English Bibles shelve it
 *   among the Major Prophets, so it's filed under "the prophets" rather than
 *   carved out to "a book of visions" (reserved for Revelation).
 *
 * The NT entries (Matthew through Revelation) are currently unreachable as
 * a cross-reference *target* — `crossRefs.ts`'s `isOlderTarget` never lets an NT
 * book win the "older" comparison, so `CrossRefsCard` never looks one up here.
 * They're kept anyway so this map stays total over every book, matching
 * `BOOK_GENRE`, rather than silently depending on the older-target rule's
 * current shape.
 */
export const CANON_SECTION_LABEL: Record<string /* OSIS book id */, string> = {
  // The law (Torah/Pentateuch) — see file header re: Genesis vs. BOOK_GENRE.
  Gen: 'the law',
  Exod: 'the law',
  Lev: 'the law',
  Num: 'the law',
  Deut: 'the law',

  // Israel's history — Joshua through Esther.
  Josh: "Israel's history",
  Judg: "Israel's history",
  Ruth: "Israel's history",
  '1Sam': "Israel's history",
  '2Sam': "Israel's history",
  '1Kgs': "Israel's history",
  '2Kgs': "Israel's history",
  '1Chr': "Israel's history",
  '2Chr': "Israel's history",
  Ezra: "Israel's history",
  Neh: "Israel's history",
  Esth: "Israel's history",

  // The Psalms — carved out on its own; see file header.
  Ps: 'the Psalms',

  // The wisdom books.
  Job: 'the wisdom books',
  Prov: 'the wisdom books',
  Eccl: 'the wisdom books',
  Song: 'the wisdom books',

  // The prophets — Isaiah through Malachi, including the Lamentations and
  // Daniel judgment calls documented in the file header.
  Isa: 'the prophets',
  Jer: 'the prophets',
  Lam: 'the prophets', // judgment call — see file header
  Ezek: 'the prophets',
  Dan: 'the prophets', // judgment call — see file header
  Hos: 'the prophets',
  Joel: 'the prophets',
  Amos: 'the prophets',
  Obad: 'the prophets',
  Jonah: 'the prophets',
  Mic: 'the prophets',
  Nah: 'the prophets',
  Hab: 'the prophets',
  Zeph: 'the prophets',
  Hag: 'the prophets',
  Zech: 'the prophets',
  Mal: 'the prophets',

  // The Gospels.
  Matt: 'the Gospels',
  Mark: 'the Gospels',
  Luke: 'the Gospels',
  John: 'the Gospels',

  // Acts stands alone.
  Acts: "the early church's story",

  // The letters — Romans through Jude.
  Rom: 'the letters',
  '1Cor': 'the letters',
  '2Cor': 'the letters',
  Gal: 'the letters',
  Eph: 'the letters',
  Phil: 'the letters',
  Col: 'the letters',
  '1Thess': 'the letters',
  '2Thess': 'the letters',
  '1Tim': 'the letters',
  '2Tim': 'the letters',
  Titus: 'the letters',
  Phlm: 'the letters',
  Heb: 'the letters',
  Jas: 'the letters',
  '1Pet': 'the letters',
  '2Pet': 'the letters',
  '1John': 'the letters',
  '2John': 'the letters',
  '3John': 'the letters',
  Jude: 'the letters',

  // Revelation stands alone.
  Rev: 'a book of visions',
};

export function canonSectionFor(bookId: string): string | undefined {
  return CANON_SECTION_LABEL[bookId];
}

export function genreFor(bookId: string): Genre | undefined {
  return BOOK_GENRE[bookId];
}

export function orientationFor(bookId: string): string | undefined {
  const genre = genreFor(bookId);
  return genre ? GENRE_ORIENTATION[genre] : undefined;
}

export function questionFor(bookId: string, chapter: number): string | undefined {
  const genre = genreFor(bookId);
  if (!genre) return undefined;
  const override = CHAPTER_QUESTION_OVERRIDES[bookId]?.[chapter];
  if (override) return override;
  const questions = GENRE_QUESTIONS[genre];
  return questions[(chapter - 1) % questions.length];
}
