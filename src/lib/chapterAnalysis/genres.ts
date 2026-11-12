/**
 * Genre metadata — hand-authored genre for every book of the Bible.
 *
 * Pure data, no analysis. Labels describe a book's *form* only — never its
 * meaning. `GENRE_LABEL` feeds the Setting card's title ("John — a gospel").
 *
 * Borderline genre calls (documented rather than hidden):
 * — Exodus: half the book is wilderness/exodus narrative (1-19, 32-34), half
 *   is covenant law and tabernacle instruction (20-31, 35-40). Classified
 *   `law` because the Sinai material is the book's structural hinge and its
 *   lasting identity ("the law of Moses" begins here).
 * — Numbers: alternates census/legal material with wilderness narrative
 *   (the spies, Korah, Balaam). Classified `narrative` because the through-
 *   line readers actually follow is the journey, not the law lists.
 * — Daniel and Revelation: both `apocalyptic`; both books genuinely are half
 *   narrative, half vision.
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

export function genreFor(bookId: string): Genre | undefined {
  return BOOK_GENRE[bookId];
}
