import { BIBLE_BOOKS, KJV_VERSE_COUNTS, getBookById, getNTBooks, getOTBooks } from '@/types/bible';
import type { BookInfo } from '@/types/bible';
import type { ReadingPlanScope } from '@/types/readingPlan';

export interface ChapterRef {
  bookId: string;
  chapter: number;
}

export function isValidScope(value: unknown): value is ReadingPlanScope {
  if (typeof value !== 'object' || value === null) return false;
  const { kind, bookId } = value as { kind?: unknown; bookId?: unknown };
  if (kind === 'bible' || kind === 'ot' || kind === 'nt') return true;
  return kind === 'book' && typeof bookId === 'string' && getBookById(bookId) !== undefined;
}

function booksFor(scope: ReadingPlanScope): BookInfo[] {
  switch (scope.kind) {
    case 'bible':
      return BIBLE_BOOKS;
    case 'ot':
      return getOTBooks();
    case 'nt':
      return getNTBooks();
    case 'book':
      return BIBLE_BOOKS.filter((b) => b.id === scope.bookId);
  }
}

/** Every chapter of the selection in canonical order. */
export function selectionChapters(scope: ReadingPlanScope): ChapterRef[] {
  return booksFor(scope).flatMap((book) =>
    Array.from({ length: KJV_VERSE_COUNTS[book.id].length }, (_, i) => ({
      bookId: book.id,
      chapter: i + 1,
    }))
  );
}

/** Number of chapters in the selection, without building the list. */
export function chapterCount(scope: ReadingPlanScope): number {
  return booksFor(scope).reduce((sum, book) => sum + KJV_VERSE_COUNTS[book.id].length, 0);
}

export function bookName(bookId: string): string {
  return getBookById(bookId)?.name ?? bookId;
}

export function selectionName(scope: ReadingPlanScope): string {
  switch (scope.kind) {
    case 'bible':
      return 'Whole Bible';
    case 'ot':
      return 'Old Testament';
    case 'nt':
      return 'New Testament';
    case 'book':
      return bookName(scope.bookId);
  }
}
