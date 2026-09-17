/**
 * Shared-word detection for the Cross-References card's "read them together"
 * flow: given a source verse and one or more target verses, find the stems
 * they have in common so the reader can be asked to tap them.
 */

import { tokenizeVerse, singularize } from './tokenize';
import { STOPWORDS } from './stopwords';

/**
 * Reduce an already-normalized token to a comparable stem, or `null` when the
 * token itself (or its singularized form) is a stopword — those don't count
 * as a "shared word" even when they literally match ("the" vs "the").
 */
export function wordStem(normalized: string): string | null {
  if (STOPWORDS.has(normalized)) return null;
  const stem = singularize(normalized);
  if (STOPWORDS.has(stem)) return null;
  return stem;
}

/**
 * Stems present in both `sourceText` and the union of `targetTexts`, unique
 * and in order of first appearance in the source. Stopwords never count,
 * even when they're the only literal overlap.
 */
export function findSharedWords(sourceText: string, targetTexts: readonly string[]): string[] {
  const targetStems = new Set<string>();
  for (const text of targetTexts) {
    for (const token of tokenizeVerse(text)) {
      const stem = wordStem(token.normalized);
      if (stem) targetStems.add(stem);
    }
  }

  const shared: string[] = [];
  const seen = new Set<string>();
  for (const token of tokenizeVerse(sourceText)) {
    const stem = wordStem(token.normalized);
    if (!stem || seen.has(stem) || !targetStems.has(stem)) continue;
    seen.add(stem);
    shared.push(stem);
  }
  return shared;
}
