/**
 * Cross-translation alignment helpers.
 *
 * Given a word marked in one translation, locate the equivalent word
 * in another translation's verse using (1) Strong's-number matching
 * when both source and target carry Strong's tags, otherwise (2) a
 * case-insensitive word-boundary text search as a fallback.
 */

import type { Verse } from '@/types';

export type AlignmentMethod = 'strongs' | 'text' | 'none';

export interface AlignmentMatch {
  found: boolean;
  method: AlignmentMethod;
  startOffset?: number;
  endOffset?: number;
  matchedText?: string;
  startWordIndex?: number;
  endWordIndex?: number;
}

export interface FindAlignedMatchParams {
  targetVerse: Verse;
  sourceSelectedText: string;
  sourceStrongsNumbers?: string[];
}

const MISS: AlignmentMatch = { found: false, method: 'none' };

/**
 * Escape a string for safe use inside a RegExp.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Walk target verse text, locating the character position of each
 * successive `word.word` entry. Returns char-offset positions parallel
 * to the `verse.words` array. Entries that can't be located return -1.
 */
function computeWordOffsets(verseText: string, words: Array<{ word: string }>): number[] {
  const offsets = new Array<number>(words.length).fill(-1);
  let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const surface = words[i].word;
    if (!surface) continue;
    const pos = verseText.indexOf(surface, cursor);
    if (pos === -1) continue;
    offsets[i] = pos;
    cursor = pos + surface.length;
  }
  return offsets;
}

/**
 * Try to match by intersecting Strong's numbers. Returns the first
 * target token whose Strong's array shares any number with the source.
 */
function findByStrongs(
  targetVerse: Verse,
  sourceStrongsNumbers: string[],
): AlignmentMatch {
  if (!targetVerse.words || targetVerse.words.length === 0) return MISS;
  const sourceSet = new Set(sourceStrongsNumbers);
  const offsets = computeWordOffsets(targetVerse.text, targetVerse.words);

  for (let i = 0; i < targetVerse.words.length; i++) {
    const token = targetVerse.words[i];
    if (!token.strongs?.some((s) => sourceSet.has(s))) continue;
    const start = offsets[i];
    if (start < 0) continue;
    const end = start + token.word.length;
    return {
      found: true,
      method: 'strongs',
      startOffset: start,
      endOffset: end,
      matchedText: token.word,
      startWordIndex: i,
      endWordIndex: i,
    };
  }
  return MISS;
}

/**
 * Fallback: case-insensitive word-boundary text search for the source's
 * surface form in the target verse. First match wins.
 *
 * Uses \b boundaries so marking "me" won't match "some", and falls back
 * to a raw indexOf only when word-boundary matching can't apply (e.g.
 * selection starts/ends inside a contraction).
 */
function findByText(targetVerse: Verse, sourceSelectedText: string): AlignmentMatch {
  const needle = sourceSelectedText.trim();
  if (!needle) return MISS;
  const hay = targetVerse.text;
  if (!hay) return MISS;

  const lowerNeedle = needle.toLowerCase();
  const lowerHay = hay.toLowerCase();

  const wordBoundary = new RegExp(`\\b${escapeRegex(lowerNeedle)}\\b`);
  const match = wordBoundary.exec(lowerHay);
  if (match) {
    const start = match.index;
    const end = start + lowerNeedle.length;
    return {
      found: true,
      method: 'text',
      startOffset: start,
      endOffset: end,
      matchedText: hay.substring(start, end),
    };
  }

  // Only fall back to a raw substring search when the needle contains a
  // character that breaks \b — e.g. selections that begin or end on an
  // apostrophe. Keep the strict word-boundary path as the primary to
  // avoid matching "me" inside "some".
  if (/^\w/.test(lowerNeedle) && /\w$/.test(lowerNeedle)) {
    return MISS;
  }
  const idx = lowerHay.indexOf(lowerNeedle);
  if (idx === -1) return MISS;
  return {
    found: true,
    method: 'text',
    startOffset: idx,
    endOffset: idx + lowerNeedle.length,
    matchedText: hay.substring(idx, idx + lowerNeedle.length),
  };
}

/**
 * Given a word marked in one translation, find the equivalent word in
 * the target translation's verse. Prefers Strong's number matching when
 * both sides carry Strong's tags; otherwise falls back to a case-
 * insensitive word-boundary text search.
 */
export function findAlignedMatch(params: FindAlignedMatchParams): AlignmentMatch {
  const { targetVerse, sourceSelectedText, sourceStrongsNumbers } = params;
  if (!targetVerse?.text) return MISS;

  if (sourceStrongsNumbers && sourceStrongsNumbers.length > 0) {
    const strongs = findByStrongs(targetVerse, sourceStrongsNumbers);
    if (strongs.found) return strongs;
  }

  return findByText(targetVerse, sourceSelectedText);
}
