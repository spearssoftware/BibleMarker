/**
 * Shared pure helpers for the observation Tracker components (People, Place,
 * Time, Conclusion). Each tracker previously inlined byte-identical copies of
 * these grouping/sorting/highlight functions; they are pure and render-neutral,
 * so centralizing them removes the copy-paste without changing behavior.
 *
 * The keyword-grouping helpers take small callbacks because each tracker keys
 * its "manual" (non-keyword) bucket differently (per-name, a single bucket, or
 * per book+chapter).
 */

import type { VerseRef } from '@/types';
import { getBookById } from '@/types';

interface HasVerseRef {
  verseRef: VerseRef;
}

export interface KeywordGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Stable string key for a verse reference (`book:chapter:verse`). */
export const getVerseKey = (ref: VerseRef): string => `${ref.book}:${ref.chapter}:${ref.verse}`;

/** Wrap each occurrence of `words` in `text` with a highlight <mark>. */
export function highlightWords(text: string, words: string[]): React.ReactNode {
  const filtered = words.filter(w => w.trim());
  if (!filtered.length || !text) return text;
  const escaped = filtered.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  escaped.sort((a, b) => b.length - a.length);
  const pattern = new RegExp(escaped.join('|'), 'gi');
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const idx = match.index!;
    if (idx > lastIndex) result.push(text.slice(lastIndex, idx));
    result.push(
      <mark key={idx} className="bg-scripture-accent/25 text-scripture-text rounded-sm px-0.5 not-italic font-medium">{match[0]}</mark>
    );
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) result.push(text.slice(lastIndex));
  return result.length > 0 ? <>{result}</> : text;
}

/** Group items by their verse reference. */
export function groupByVerse<T extends HasVerseRef>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  items.forEach(item => {
    const key = getVerseKey(item.verseRef);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  });
  return map;
}

/** Sort verse-keyed groups into canonical book/chapter/verse order. */
export function sortVerseGroups<T>(groups: Map<string, T[]>): Array<[string, T[]]> {
  return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
    const [bookA, chapterA, verseA] = keyA.split(':');
    const [bookB, chapterB, verseB] = keyB.split(':');
    const bookInfoA = getBookById(bookA);
    const bookInfoB = getBookById(bookB);
    if (bookInfoA && bookInfoB && bookInfoA.order !== bookInfoB.order) return bookInfoA.order - bookInfoB.order;
    if (!bookInfoA && !bookInfoB) return 0;
    if (!bookInfoA) return 1;
    if (!bookInfoB) return -1;
    const chapterANum = parseInt(chapterA, 10);
    const chapterBNum = parseInt(chapterB, 10);
    if (chapterANum !== chapterBNum) return chapterANum - chapterBNum;
    return parseInt(verseA, 10) - parseInt(verseB, 10);
  });
}

/**
 * Group items by keyword. `keyOf` returns the group key (typically the preset
 * id, or a tracker-specific "manual" key); `labelOf` derives the display label
 * for a group.
 */
export function groupByKeyword<T>(
  items: T[],
  keyOf: (item: T) => string,
  labelOf: (key: string, items: T[]) => string
): Array<KeywordGroup<T>> {
  const byKey = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item);
  }
  return Array.from(byKey.entries()).map(([key, keywordItems]) => ({
    key,
    label: labelOf(key, keywordItems),
    items: keywordItems,
  }));
}

/**
 * Sort keyword groups: manual groups (per `isManual`) last, then by label, then
 * by each group's earliest verse in canonical order.
 */
export function sortKeywordGroups<T extends HasVerseRef>(
  groups: Array<KeywordGroup<T>>,
  isManual: (key: string) => boolean
): Array<KeywordGroup<T>> {
  const minVerse = (items: T[]) => {
    if (items.length === 0) return '';
    const keys = items.map(i => getVerseKey(i.verseRef));
    keys.sort((ka, kb) => {
      const [bookA, chA, vA] = ka.split(':');
      const [bookB, chB, vB] = kb.split(':');
      const ordA = getBookById(bookA)?.order ?? 999;
      const ordB = getBookById(bookB)?.order ?? 999;
      if (ordA !== ordB) return ordA - ordB;
      if (parseInt(chA, 10) !== parseInt(chB, 10)) return parseInt(chA, 10) - parseInt(chB, 10);
      return parseInt(vA, 10) - parseInt(vB, 10);
    });
    return keys[0];
  };
  return [...groups].sort((a, b) => {
    if (isManual(a.key) && !isManual(b.key)) return 1;
    if (isManual(b.key) && !isManual(a.key)) return -1;
    const nameCmp = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return minVerse(a.items).localeCompare(minVerse(b.items));
  });
}
