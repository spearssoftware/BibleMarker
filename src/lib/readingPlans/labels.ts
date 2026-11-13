import { getBookById } from '@/types/bible';
import type { ReadingPlan } from '@/types/readingPlan';
import { isValidScope, selectionName } from './chapters';
import type { ScheduleDay } from './schedule';

function bookName(bookId: string): string {
  return getBookById(bookId)?.name ?? bookId;
}

/** "John 5", "John 5–6" or "Genesis 50 – Exodus 2". */
export function readingLabel({ chapters }: ScheduleDay): string {
  const first = chapters[0];
  const last = chapters[chapters.length - 1];
  if (first.bookId !== last.bookId) {
    return `${bookName(first.bookId)} ${first.chapter} – ${bookName(last.bookId)} ${last.chapter}`;
  }
  const name = bookName(first.bookId);
  return first.chapter === last.chapter
    ? `${name} ${first.chapter}`
    : `${name} ${first.chapter}–${last.chapter}`;
}

export function planName(plan: Pick<ReadingPlan, 'scope' | 'days'>): string {
  const selection = isValidScope(plan.scope) ? selectionName(plan.scope) : 'Reading plan';
  return `${selection} in ${plan.days} ${plan.days === 1 ? 'day' : 'days'}`;
}
