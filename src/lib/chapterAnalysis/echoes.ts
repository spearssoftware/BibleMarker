/**
 * Echo Hints — reference formatting and the "older target" rule.
 *
 * Pure logic for a `ChapterEcho` target, split out from `EchoesCard` (the
 * formatting) and `local-db.ts` (the older-target rule) so both can be
 * unit-tested directly and the card file stays fast-refresh friendly
 * (component-only exports).
 */

import { formatVerseRef, getBookById, parseOsisRef } from '@/types';

/**
 * Format an echo's target as a readable reference. Ranges render as
 * "Psalms 45:6–7" when the range stays within one book+chapter, or
 * "Deuteronomy 28:2–29:1" when it crosses chapters within the same book.
 * A cross-book range (14 rows Bible-wide), a degenerate range where the end
 * ref equals the start ref (present in the corpus — see `CrossRefsTab`'s
 * `formatRef`, which guards the same case), or an unparsable end just
 * renders the start ref — never the echoed verse's text.
 */
export function formatEchoTarget(targetRef: string, targetEndRef: string | null): string {
  const start = parseOsisRef(targetRef);
  if (!start || start.verse === undefined) return targetRef;
  const startLabel = formatVerseRef(start.book, start.chapter, start.verse);
  if (!targetEndRef || targetEndRef === targetRef) return startLabel;

  const end = parseOsisRef(targetEndRef);
  if (!end || end.verse === undefined || end.book !== start.book) {
    return startLabel;
  }
  if (end.chapter === start.chapter) {
    return `${startLabel}–${end.verse}`;
  }
  return `${startLabel}–${end.chapter}:${end.verse}`;
}

/**
 * The strict "older" rule for Echo Hints: a naive `BIBLE_BOOKS.order`
 * comparison mislabels roughly half of all cross-reference rows (same-book
 * "echoes", and NT→NT rows where one epistle merely sorts after another —
 * Psalm numbers and epistle order aren't chronology). A target only counts
 * as older when it's in a **different book** and either the source is NT and
 * the target is OT, or both are OT and the target's canonical order is
 * earlier than the source's.
 *
 * Known false negative: the OT-OT branch compares English-shelf order, not
 * chronology, so a genuine quotation running the other way on the shelf
 * (e.g. Ezra 1:1 quoting the earlier-written Jer 29:10, which sits later on
 * the shelf) is dropped rather than mislabeled. That's deliberate — don't
 * "fix" it by loosening the rule, which reopens the same-book/NT-NT false
 * positives this rule exists to close.
 */
export function isOlderTarget(sourceBookId: string, targetBookId: string): boolean {
  if (sourceBookId === targetBookId) return false;
  const sourceBook = getBookById(sourceBookId);
  const targetBook = getBookById(targetBookId);
  if (!sourceBook || !targetBook) return false;
  if (sourceBook.testament === 'NT' && targetBook.testament === 'OT') return true;
  if (sourceBook.testament === 'OT' && targetBook.testament === 'OT') {
    return targetBook.order < sourceBook.order;
  }
  return false;
}
