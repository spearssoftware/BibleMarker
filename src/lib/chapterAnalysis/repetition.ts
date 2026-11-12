/**
 * Repetition - find the chapter's most-repeated meaningful word.
 */

import { isCommonPronoun } from '@/types';
import { splitPunctuation } from '@/lib/textUtils';
import { tokenizeVerse, singularize } from './tokenize';
import { STOPWORDS, DEPRIORITIZED } from './stopwords';
import type { AnalysisVerse, RepetitionResult, DiscoveryThresholds, TokenOccurrence } from './types';

interface Tally {
  count: number;
  occurrences: TokenOccurrence[];
  forms: string[];
  formsSeen: Set<string>;
  /** Surface text of the first occurrence, casing intact. */
  firstSurface: string;
  /** Surface text of the first occurrence whose normalized form is the token itself (not a plural or possessive). */
  baseSurface: string | null;
}

export function findRepetition(verses: AnalysisVerse[], thresholds: DiscoveryThresholds): RepetitionResult | null {
  const tally = new Map<string, Tally>();

  for (const verse of verses) {
    for (const token of tokenizeVerse(verse.text)) {
      if (STOPWORDS.has(token.normalized) || isCommonPronoun(token.normalized)) continue;
      if (token.normalized.length < thresholds.repetitionMinWordLength) continue;

      const key = singularize(token.normalized);
      const surface = splitPunctuation(verse.text.slice(token.startIndex, token.endIndex)).word;
      let entry = tally.get(key);
      if (!entry) {
        entry = { count: 0, occurrences: [], forms: [], formsSeen: new Set(), firstSurface: surface, baseSurface: null };
        tally.set(key, entry);
      }
      if (entry.baseSurface === null && token.normalized === key) entry.baseSurface = surface;
      entry.count += 1;
      entry.occurrences.push({ verse: verse.ref.verse, start: token.startIndex, end: token.endIndex });
      if (!entry.formsSeen.has(token.normalized)) {
        entry.formsSeen.add(token.normalized);
        entry.forms.push(token.normalized);
      }
    }
  }

  const candidates: Array<Omit<RepetitionResult, 'firstVerse' | 'lastVerse'>> = [];
  for (const [token, entry] of tally) {
    if (entry.count < thresholds.repetitionMinCount) continue;
    entry.occurrences.sort((a, b) => a.verse - b.verse || a.start - b.start);
    candidates.push({
      token,
      display: entry.baseSurface ?? entry.firstSurface,
      count: entry.count,
      occurrences: entry.occurrences,
      forms: entry.forms,
    });
  }

  if (candidates.length === 0) return null;

  const preferred = candidates.filter(c => !DEPRIORITIZED.has(c.token));
  const pool = preferred.length > 0 ? preferred : candidates;

  pool.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const aFirst = a.occurrences[0];
    const bFirst = b.occurrences[0];
    if (aFirst.verse !== bFirst.verse) return aFirst.verse - bFirst.verse;
    if (aFirst.start !== bFirst.start) return aFirst.start - bFirst.start;
    return a.token.localeCompare(b.token);
  });

  const winner = pool[0];
  const verseNumbers = winner.occurrences.map(o => o.verse);

  return {
    token: winner.token,
    display: winner.display,
    count: winner.count,
    firstVerse: Math.min(...verseNumbers),
    lastVerse: Math.max(...verseNumbers),
    occurrences: winner.occurrences,
    forms: winner.forms,
  };
}
