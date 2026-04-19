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
 * Try to match by intersecting Strong's numbers. Returns the target
 * token whose Strong's array shares any number with the source AND
 * whose surface form most closely resembles the source selection.
 *
 * Some modules tag compound constructions (e.g. a verb inflected with a
 * possessive pronoun) with multiple Strong's numbers, so a selection on
 * the possessive "My" (G3450) can also intersect a verb token. Prefer
 * the token whose surface form actually matches the selection — exact
 * case-insensitive equality first, then substring overlap, then the
 * first Strong's hit by position as a last resort.
 */
function findByStrongs(
  targetVerse: Verse,
  sourceStrongsNumbers: string[],
  sourceSelectedText: string,
): AlignmentMatch {
  if (!targetVerse.words || targetVerse.words.length === 0) return MISS;
  const sourceSet = new Set(sourceStrongsNumbers);
  const offsets = computeWordOffsets(targetVerse.text, targetVerse.words);
  const sourceLower = sourceSelectedText.trim().toLowerCase();

  // Collect every token whose Strong's intersects the source, scored by
  // how well its surface form matches the source selection text.
  //   3 = case-insensitive exact match
  //   2 = target word contains the source (e.g. "my's" for "my")
  //   1 = source contains the target word (e.g. "my" for "m")
  //   0 = no surface overlap — only Strong's
  let best: { index: number; score: number; offset: number } | null = null;

  const sourceHasWhitespace = /\s/.test(sourceSelectedText);

  for (let i = 0; i < targetVerse.words.length; i++) {
    const token = targetVerse.words[i];
    if (!token.strongs?.some((s) => sourceSet.has(s))) continue;
    const start = offsets[i];
    if (start < 0) continue;

    // Some SWORD modules tokenize multi-word phrases as a single <w> element
    // with one Strong's number (e.g. "in Me that does not bear" → G5342). When
    // the source is a single word, refuse to accept a compound target — the
    // mark would overlay the entire phrase instead of the intended word.
    // Fall back to text search, which respects word boundaries.
    if (!sourceHasWhitespace && /\s/.test(token.word)) continue;

    const targetLower = token.word.toLowerCase();
    let score = 0;
    if (targetLower === sourceLower) score = 3;
    else if (sourceLower && targetLower.includes(sourceLower)) score = 2;
    else if (sourceLower && sourceLower.includes(targetLower)) score = 1;

    // Prefer higher scores. On a tie, prefer the earlier occurrence.
    if (!best || score > best.score) {
      best = { index: i, score, offset: start };
    }
  }

  // Reject Strong's-only matches with zero surface-form overlap — some modules
  // tag adjacent words (e.g. a preposition) with the same lemma numbers as the
  // pronoun, which would otherwise drop the mark on the wrong word. If no token
  // has any textual similarity to the source selection, fall back to text search.
  if (!best || best.score === 0) return MISS;
  const token = targetVerse.words[best.index];
  return {
    found: true,
    method: 'strongs',
    startOffset: best.offset,
    endOffset: best.offset + token.word.length,
    matchedText: token.word,
    startWordIndex: best.index,
    endWordIndex: best.index,
  };
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
    const strongs = findByStrongs(targetVerse, sourceStrongsNumbers, sourceSelectedText);
    if (strongs.found) return strongs;
  }

  return findByText(targetVerse, sourceSelectedText);
}
