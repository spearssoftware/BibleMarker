/**
 * Repetition Radar - find the chapter's most-repeated meaningful word.
 */

import type { ChapterEntities } from '@/types/gnosis';
import { isCommonPronoun } from '@/types';
import { tokenizeVerse, singularize } from './tokenize';
import { STOPWORDS, DEPRIORITIZED } from './stopwords';
import type { AnalysisVerse, RepetitionResult, DiscoveryThresholds, TokenOccurrence } from './types';

interface Tally {
  count: number;
  occurrences: TokenOccurrence[];
}

export function findRepetition(verses: AnalysisVerse[], thresholds: DiscoveryThresholds): RepetitionResult | null {
  const tally = new Map<string, Tally>();

  for (const verse of verses) {
    for (const token of tokenizeVerse(verse.text)) {
      if (STOPWORDS.has(token.normalized) || isCommonPronoun(token.normalized)) continue;
      if (token.normalized.length < thresholds.repetitionMinWordLength) continue;

      const key = singularize(token.normalized);
      let entry = tally.get(key);
      if (!entry) {
        entry = { count: 0, occurrences: [] };
        tally.set(key, entry);
      }
      entry.count += 1;
      entry.occurrences.push({ verse: verse.ref.verse, start: token.startIndex, end: token.endIndex });
    }
  }

  const candidates: Array<{ token: string; count: number; occurrences: TokenOccurrence[] }> = [];
  for (const [token, entry] of tally) {
    if (entry.count < thresholds.repetitionMinCount) continue;
    entry.occurrences.sort((a, b) => a.verse - b.verse || a.start - b.start);
    candidates.push({ token, count: entry.count, occurrences: entry.occurrences });
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
    count: winner.count,
    firstVerse: Math.min(...verseNumbers),
    lastVerse: Math.max(...verseNumbers),
    occurrences: winner.occurrences,
  };
}

export function verseRangeLabel(result: RepetitionResult): string {
  if (result.firstVerse === result.lastVerse) return `in v.${result.firstVerse}`;
  return `between v.${result.firstVerse} and v.${result.lastVerse}`;
}

/**
 * A token matches a Gnosis slug when it equals the slug's first hyphen-delimited
 * segment (e.g. "john" for "john-the-baptist") or the whole slug read as
 * space-separated words (e.g. "sea of galilee" for "sea-of-galilee"). A
 * single-word slug satisfies both forms identically.
 */
function slugMatches(token: string, slug: string): boolean {
  const firstSegment = slug.split('-')[0];
  const spaced = slug.replace(/-/g, ' ');
  return token === firstSegment || token === spaced;
}

export function deriveCategoryHint(result: RepetitionResult, entities: ChapterEntities | null): 'people' | 'places' | undefined {
  if (!entities) return undefined;
  if (entities.people.some(slug => slugMatches(result.token, slug))) return 'people';
  if (entities.places.some(slug => slugMatches(result.token, slug))) return 'places';
  return undefined;
}
