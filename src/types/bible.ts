/**
 * Bible Structure Types
 * Book names, chapter counts, versification systems
 */

/** Bible book info */
export interface BookInfo {
  id: string;           // OSIS ID (e.g., 'Gen', 'Matt')
  name: string;         // Full name (e.g., 'Genesis', 'Matthew')
  shortName: string;    // Abbreviated (e.g., 'Gen', 'Matt')
  chapters: number;     // Number of chapters
  testament: 'OT' | 'NT';
  order: number;        // Canonical order (1-66)
}

/** Standard Protestant canon - 66 books */
export const BIBLE_BOOKS: BookInfo[] = [
  // Old Testament
  { id: 'Gen', name: 'Genesis', shortName: 'Gen', chapters: 50, testament: 'OT', order: 1 },
  { id: 'Exod', name: 'Exodus', shortName: 'Exod', chapters: 40, testament: 'OT', order: 2 },
  { id: 'Lev', name: 'Leviticus', shortName: 'Lev', chapters: 27, testament: 'OT', order: 3 },
  { id: 'Num', name: 'Numbers', shortName: 'Num', chapters: 36, testament: 'OT', order: 4 },
  { id: 'Deut', name: 'Deuteronomy', shortName: 'Deut', chapters: 34, testament: 'OT', order: 5 },
  { id: 'Josh', name: 'Joshua', shortName: 'Josh', chapters: 24, testament: 'OT', order: 6 },
  { id: 'Judg', name: 'Judges', shortName: 'Judg', chapters: 21, testament: 'OT', order: 7 },
  { id: 'Ruth', name: 'Ruth', shortName: 'Ruth', chapters: 4, testament: 'OT', order: 8 },
  { id: '1Sam', name: '1 Samuel', shortName: '1 Sam', chapters: 31, testament: 'OT', order: 9 },
  { id: '2Sam', name: '2 Samuel', shortName: '2 Sam', chapters: 24, testament: 'OT', order: 10 },
  { id: '1Kgs', name: '1 Kings', shortName: '1 Kgs', chapters: 22, testament: 'OT', order: 11 },
  { id: '2Kgs', name: '2 Kings', shortName: '2 Kgs', chapters: 25, testament: 'OT', order: 12 },
  { id: '1Chr', name: '1 Chronicles', shortName: '1 Chr', chapters: 29, testament: 'OT', order: 13 },
  { id: '2Chr', name: '2 Chronicles', shortName: '2 Chr', chapters: 36, testament: 'OT', order: 14 },
  { id: 'Ezra', name: 'Ezra', shortName: 'Ezra', chapters: 10, testament: 'OT', order: 15 },
  { id: 'Neh', name: 'Nehemiah', shortName: 'Neh', chapters: 13, testament: 'OT', order: 16 },
  { id: 'Esth', name: 'Esther', shortName: 'Esth', chapters: 10, testament: 'OT', order: 17 },
  { id: 'Job', name: 'Job', shortName: 'Job', chapters: 42, testament: 'OT', order: 18 },
  { id: 'Ps', name: 'Psalms', shortName: 'Ps', chapters: 150, testament: 'OT', order: 19 },
  { id: 'Prov', name: 'Proverbs', shortName: 'Prov', chapters: 31, testament: 'OT', order: 20 },
  { id: 'Eccl', name: 'Ecclesiastes', shortName: 'Eccl', chapters: 12, testament: 'OT', order: 21 },
  { id: 'Song', name: 'Song of Solomon', shortName: 'Song', chapters: 8, testament: 'OT', order: 22 },
  { id: 'Isa', name: 'Isaiah', shortName: 'Isa', chapters: 66, testament: 'OT', order: 23 },
  { id: 'Jer', name: 'Jeremiah', shortName: 'Jer', chapters: 52, testament: 'OT', order: 24 },
  { id: 'Lam', name: 'Lamentations', shortName: 'Lam', chapters: 5, testament: 'OT', order: 25 },
  { id: 'Ezek', name: 'Ezekiel', shortName: 'Ezek', chapters: 48, testament: 'OT', order: 26 },
  { id: 'Dan', name: 'Daniel', shortName: 'Dan', chapters: 12, testament: 'OT', order: 27 },
  { id: 'Hos', name: 'Hosea', shortName: 'Hos', chapters: 14, testament: 'OT', order: 28 },
  { id: 'Joel', name: 'Joel', shortName: 'Joel', chapters: 3, testament: 'OT', order: 29 },
  { id: 'Amos', name: 'Amos', shortName: 'Amos', chapters: 9, testament: 'OT', order: 30 },
  { id: 'Obad', name: 'Obadiah', shortName: 'Obad', chapters: 1, testament: 'OT', order: 31 },
  { id: 'Jonah', name: 'Jonah', shortName: 'Jonah', chapters: 4, testament: 'OT', order: 32 },
  { id: 'Mic', name: 'Micah', shortName: 'Mic', chapters: 7, testament: 'OT', order: 33 },
  { id: 'Nah', name: 'Nahum', shortName: 'Nah', chapters: 3, testament: 'OT', order: 34 },
  { id: 'Hab', name: 'Habakkuk', shortName: 'Hab', chapters: 3, testament: 'OT', order: 35 },
  { id: 'Zeph', name: 'Zephaniah', shortName: 'Zeph', chapters: 3, testament: 'OT', order: 36 },
  { id: 'Hag', name: 'Haggai', shortName: 'Hag', chapters: 2, testament: 'OT', order: 37 },
  { id: 'Zech', name: 'Zechariah', shortName: 'Zech', chapters: 14, testament: 'OT', order: 38 },
  { id: 'Mal', name: 'Malachi', shortName: 'Mal', chapters: 4, testament: 'OT', order: 39 },
  
  // New Testament
  { id: 'Matt', name: 'Matthew', shortName: 'Matt', chapters: 28, testament: 'NT', order: 40 },
  { id: 'Mark', name: 'Mark', shortName: 'Mark', chapters: 16, testament: 'NT', order: 41 },
  { id: 'Luke', name: 'Luke', shortName: 'Luke', chapters: 24, testament: 'NT', order: 42 },
  { id: 'John', name: 'John', shortName: 'John', chapters: 21, testament: 'NT', order: 43 },
  { id: 'Acts', name: 'Acts', shortName: 'Acts', chapters: 28, testament: 'NT', order: 44 },
  { id: 'Rom', name: 'Romans', shortName: 'Rom', chapters: 16, testament: 'NT', order: 45 },
  { id: '1Cor', name: '1 Corinthians', shortName: '1 Cor', chapters: 16, testament: 'NT', order: 46 },
  { id: '2Cor', name: '2 Corinthians', shortName: '2 Cor', chapters: 13, testament: 'NT', order: 47 },
  { id: 'Gal', name: 'Galatians', shortName: 'Gal', chapters: 6, testament: 'NT', order: 48 },
  { id: 'Eph', name: 'Ephesians', shortName: 'Eph', chapters: 6, testament: 'NT', order: 49 },
  { id: 'Phil', name: 'Philippians', shortName: 'Phil', chapters: 4, testament: 'NT', order: 50 },
  { id: 'Col', name: 'Colossians', shortName: 'Col', chapters: 4, testament: 'NT', order: 51 },
  { id: '1Thess', name: '1 Thessalonians', shortName: '1 Thess', chapters: 5, testament: 'NT', order: 52 },
  { id: '2Thess', name: '2 Thessalonians', shortName: '2 Thess', chapters: 3, testament: 'NT', order: 53 },
  { id: '1Tim', name: '1 Timothy', shortName: '1 Tim', chapters: 6, testament: 'NT', order: 54 },
  { id: '2Tim', name: '2 Timothy', shortName: '2 Tim', chapters: 4, testament: 'NT', order: 55 },
  { id: 'Titus', name: 'Titus', shortName: 'Titus', chapters: 3, testament: 'NT', order: 56 },
  { id: 'Phlm', name: 'Philemon', shortName: 'Phlm', chapters: 1, testament: 'NT', order: 57 },
  { id: 'Heb', name: 'Hebrews', shortName: 'Heb', chapters: 13, testament: 'NT', order: 58 },
  { id: 'Jas', name: 'James', shortName: 'Jas', chapters: 5, testament: 'NT', order: 59 },
  { id: '1Pet', name: '1 Peter', shortName: '1 Pet', chapters: 5, testament: 'NT', order: 60 },
  { id: '2Pet', name: '2 Peter', shortName: '2 Pet', chapters: 3, testament: 'NT', order: 61 },
  { id: '1John', name: '1 John', shortName: '1 John', chapters: 5, testament: 'NT', order: 62 },
  { id: '2John', name: '2 John', shortName: '2 John', chapters: 1, testament: 'NT', order: 63 },
  { id: '3John', name: '3 John', shortName: '3 John', chapters: 1, testament: 'NT', order: 64 },
  { id: 'Jude', name: 'Jude', shortName: 'Jude', chapters: 1, testament: 'NT', order: 65 },
  { id: 'Rev', name: 'Revelation', shortName: 'Rev', chapters: 22, testament: 'NT', order: 66 },
];

/** Get book by OSIS ID */
export function getBookById(id: string): BookInfo | undefined {
  return BIBLE_BOOKS.find(b => b.id === id);
}

/** Get book by name (case-insensitive, partial match) */
export function getBookByName(name: string): BookInfo | undefined {
  const lower = name.toLowerCase();
  return BIBLE_BOOKS.find(b => 
    b.name.toLowerCase() === lower ||
    b.shortName.toLowerCase() === lower ||
    b.id.toLowerCase() === lower
  );
}

/** Get all Old Testament books */
export function getOTBooks(): BookInfo[] {
  return BIBLE_BOOKS.filter(b => b.testament === 'OT');
}

/** Get all New Testament books */
export function getNTBooks(): BookInfo[] {
  return BIBLE_BOOKS.filter(b => b.testament === 'NT');
}

/** Format a verse reference for display */
export function formatVerseRef(book: string, chapter: number, verse?: number): string {
  const bookInfo = getBookById(book) || getBookByName(book);
  const bookName = bookInfo?.name || book;
  
  if (verse !== undefined) {
    return `${bookName} ${chapter}:${verse}`;
  }
  return `${bookName} ${chapter}`;
}
