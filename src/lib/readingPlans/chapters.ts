import { BIBLE_BOOKS, KJV_VERSE_COUNTS, getBookById } from '@/types/bible';
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
      return BIBLE_BOOKS.filter((b) => b.testament === 'OT');
    case 'nt':
      return BIBLE_BOOKS.filter((b) => b.testament === 'NT');
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

export function selectionName(scope: ReadingPlanScope): string {
  switch (scope.kind) {
    case 'bible':
      return 'Whole Bible';
    case 'ot':
      return 'Old Testament';
    case 'nt':
      return 'New Testament';
    case 'book':
      return getBookById(scope.bookId)?.name ?? scope.bookId;
  }
}
