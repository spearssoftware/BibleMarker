/**
 * Genre Compass — hand-authored genre metadata for every book of the Bible.
 *
 * Pure data, no analysis. Orientation lines describe a book's *form* only —
 * never its meaning — and every question is answer-free: it points the
 * reader at something to find or notice, it never asserts what a passage
 * says. Same register as `connectors.ts`'s article-free em-dash prompts.
 *
 * Borderline genre calls (documented rather than hidden):
 * — Exodus: half the book is wilderness/exodus narrative (1-19, 32-34), half
 *   is covenant law and tabernacle instruction (20-31, 35-40). Classified
 *   `law` because the Sinai material is the book's structural hinge and its
 *   lasting identity ("the law of Moses" begins here).
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

export const GENRE_ORIENTATION: Record<Genre, string> = {
  law: 'Rule after rule, not a story — case law and instruction, given in order.',
  narrative: 'A story — someone wants something, and the chapter moves toward what happens.',
  poetry: 'Hebrew poetry — lines paired by parallel or contrasting thought, never by rhyme.',
  wisdom: 'Sayings and long reflection, weighing how life actually plays out.',
  prophecy: 'An oracle — warning and hope addressed to a specific audience, in verse.',
  gospel: 'An account of Jesus — his words and actions, arranged for a particular audience.',
  acts: 'A travel narrative — the story keeps moving, carried from place to place by different people.',
  epistle: 'A letter, written to answer real problems on the other end.',
  apocalyptic: 'Part story, part vision — symbol and scene mixed together.',
};

export const GENRE_QUESTIONS: Record<Genre, readonly string[]> = {
  law: [
    'This rule protects something — what does it guard against?',
    'Every rule has a reach — who exactly is bound by this one?',
    'Not all of these carry the same weight — which rule here comes with a penalty attached, and which with a promise?',
    'Case law imagines a scenario before it legislates — what situation is this rule picturing?',
    "Some rules explain themselves and some don't — where is a reason given, if anywhere?",
  ],
  narrative: [
    'Someone wants something in this chapter — who, and what stands in their way?',
    'Track where this scene happens — does the place change, and what happens when it does?',
    'Notice who speaks and who stays silent — what does the silence do?',
    'Time moves unevenly here — find where it slows down to a single moment.',
    'A list of names is still telling a story — what carries over from one name to the next?',
  ],
  poetry: [
    'Hebrew poetry rhymes ideas, not sounds — find two lines that say the same thing differently.',
    'Some lines sharpen by contrast, not restatement — find a line answered by its opposite.',
    'Follow one image through the poem — where does it change or return?',
    'Poems shift address — who is being spoken to at the start, and who by the end?',
    'Trace the swings in tone — where does it turn, and on what word?',
    'A refrain repeats on purpose — what comes back more than once, and where?',
  ],
  wisdom: [
    'Wisdom sayings trade in comparison — find two things being weighed against each other.',
    'Some lines describe how life usually goes and some argue with that — which is this one doing?',
    'A proverb is built for memory — what makes this line easy to carry?',
    'Long arguments circle back — what question does this chapter keep returning to?',
    'Wisdom literature argues with itself across chapters — where might another chapter push back on this one?',
  ],
  prophecy: [
    'Prophets mix warning and hope — which is this chapter doing?',
    'An oracle is addressed to someone specific — who is being spoken to here?',
    'Find the image the prophet reaches for — what everyday thing is being used to say something bigger?',
    'Judgment oracles name a charge — what is the audience accused of, if anything, in this chapter?',
    'Prophecy often looks two directions — where does this chapter point to the near future, and where further out?',
  ],
  gospel: [
    'Watch who Jesus is talking to — does the audience change what he says?',
    'Notice who asks the questions in this chapter, and who answers them.',
    'The same event reads differently across the four gospels — what detail would you look for in another account?',
    'Track the reactions around the edges of the scene — who is amazed, who is offended, who says nothing?',
    'A gospel writer chooses what to include — what does this chapter spend the most space on?',
  ],
  acts: [
    'Who carries the story forward from here — is it the same person as last chapter, or someone new?',
    'The message keeps moving — where has it just traveled to, and by what route?',
    'Notice who is doing the speaking in this chapter — and who is only listening.',
    'Opposition shows up throughout Acts — where does it come from in this chapter, if anywhere?',
    'Something changes hands in this chapter — attention, authority, or welcome — track what it is.',
  ],
  epistle: [
    'Letters answer problems — what problem is being answered here?',
    'Find the hinge word where the letter turns from argument to instruction, or back again.',
    'A letter assumes its reader already knows things — what does this chapter seem to assume you know?',
    "Track the pronouns — where does the writer say 'I', where 'you', where 'we'?",
    'Letters build a case before they apply it — is this chapter building the case, or applying it?',
  ],
  apocalyptic: [
    'Symbols stand for something else on purpose — what image here is doing double duty?',
    'Find where the vision breaks into plain explanation — what gets explained outright?',
    'Numbers carry weight in this kind of writing — which number shows up, and how often?',
    'Track who is seeing the vision — what do they react to as it unfolds?',
    'Part of this book reads like a story and part like a vision — which is this chapter doing?',
  ],
};

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
  const questions = GENRE_QUESTIONS[genre];
  return questions[(chapter - 1) % questions.length];
}
