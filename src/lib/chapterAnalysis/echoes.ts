/**
 * Echo Hints — reference formatting.
 *
 * Pure formatting for a `ChapterEcho` target, split out from `EchoesCard` so
 * it can be unit-tested directly and so the card file stays fast-refresh
 * friendly (component-only exports).
 */

import { formatVerseRef, parseOsisRef } from '@/types';

/**
 * Format an echo's target as a readable reference. Ranges render as
 * "Psalms 45:6–7" when the range stays within one book+chapter, or
 * "Deuteronomy 28:2–29:1" when it crosses chapters within the same book.
 * A cross-book range (14 rows Bible-wide) or an unparsable end just renders
 * the start ref — never the echoed verse's text.
 */
export function formatEchoTarget(targetRef: string, targetEndRef: string | null): string {
  const start = parseOsisRef(targetRef);
  if (!start || start.verse === undefined) return targetRef;
  const startLabel = formatVerseRef(start.book, start.chapter, start.verse);
  if (!targetEndRef) return startLabel;

  const end = parseOsisRef(targetEndRef);
  if (!end || end.verse === undefined || end.book !== start.book) {
    return startLabel;
  }
  if (end.chapter === start.chapter) {
    return `${startLabel}–${end.verse}`;
  }
  return `${startLabel}–${end.chapter}:${end.verse}`;
}
