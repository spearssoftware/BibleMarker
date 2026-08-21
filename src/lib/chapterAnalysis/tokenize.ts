/**
 * Tokenization for chapter analysis.
 *
 * Built on top of `splitIntoWords`/`normalizeForMatching` from `keywordMatching.ts`
 * so word boundaries and offsets stay consistent with the rest of the app's
 * matching engine. No stemming beyond a light singularizer - just enough to
 * keep "word"/"words" and "light"/"lights" together without merging unrelated
 * words.
 */

import { splitIntoWords, normalizeForMatching } from '@/lib/keywordMatching';

export interface WordToken {
  normalized: string;
  startIndex: number;
  endIndex: number;
}

/** Split verse text into normalized word tokens, dropping anything without a letter. */
export function tokenizeVerse(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  for (const word of splitIntoWords(text)) {
    const normalized = normalizeForMatching(word.word);
    if (!/[a-z]/.test(normalized)) continue;
    tokens.push({ normalized, startIndex: word.startIndex, endIndex: word.endIndex });
  }
  return tokens;
}

/**
 * Light singularizer for an already-normalized token - strips a trailing
 * possessive, then ies -> y, sses/xes/zes/ches/shes -> strip "es", a bare
 * ses -> strip just the final "s" (houses -> house, not "hous"), and
 * otherwise a bare trailing s (guarded against ss/us/is so
 * "class"/"jesus"/"basis"/"this"/"thus" stay put). Words ending in "ves"
 * (wives, knives, lives) are left alone entirely - the -f/-fe singular
 * isn't derivable from the plural without a dictionary.
 */
export function singularize(normalized: string): string {
  if (normalized.endsWith("'s") || normalized.endsWith('’s')) {
    return normalized.slice(0, -2);
  }
  if (normalized.endsWith('ies') && normalized.length > 4) {
    return `${normalized.slice(0, -3)}y`;
  }
  if (/(?:sses|xes|zes|ches|shes)$/.test(normalized)) {
    return normalized.slice(0, -2);
  }
  if (normalized.endsWith('ses')) {
    return normalized.slice(0, -1);
  }
  if (normalized.endsWith('ves')) {
    return normalized;
  }
  if (
    normalized.endsWith('s') &&
    normalized.length > 3 &&
    !normalized.endsWith('ss') &&
    !normalized.endsWith('us') &&
    !normalized.endsWith('is')
  ) {
    return normalized.slice(0, -1);
  }
  return normalized;
}
