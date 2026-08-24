/**
 * Connector Lens - hand-authored logical-connector vocabulary and matching.
 *
 * Data-only vocabulary so thresholds/wording can be tuned without touching
 * `findConnectors`. Matching runs longest-phrase-first via `findPhraseMatches`
 * so multi-word phrases (e.g. "so that") claim their range before a shorter
 * overlapping single word (e.g. "so") gets a chance at it.
 */

import { findPhraseMatches } from '@/lib/keywordMatching';
import type { AnalysisVerse, ConnectorCategory, ConnectorHit } from './types';

export interface ConnectorDef {
  phrase: string;
  category: ConnectorCategory;
  prompt: string;
}

const CONTRAST_PROMPT = "'{phrase}' — what is being set against what?";
const CONCLUSION_PROMPT = "'{phrase}' — what is it there for?";
const CONDITION_PROMPT = "'{phrase}' — what hangs on it?";
const PURPOSE_PROMPT = "'{phrase}' — toward what end?";
const CAUSE_PROMPT = "'{phrase}' — what reason is being given?";

export const CONNECTORS: readonly ConnectorDef[] = [
  // contrast
  { phrase: 'on the contrary', category: 'contrast', prompt: CONTRAST_PROMPT },
  { phrase: 'even so', category: 'contrast', prompt: CONTRAST_PROMPT },
  { phrase: 'nevertheless', category: 'contrast', prompt: CONTRAST_PROMPT },
  { phrase: 'although', category: 'contrast', prompt: CONTRAST_PROMPT },
  { phrase: 'whereas', category: 'contrast', prompt: CONTRAST_PROMPT },
  { phrase: 'however', category: 'contrast', prompt: CONTRAST_PROMPT },
  { phrase: 'instead', category: 'contrast', prompt: CONTRAST_PROMPT },
  { phrase: 'though', category: 'contrast', prompt: CONTRAST_PROMPT },
  { phrase: 'rather', category: 'contrast', prompt: CONTRAST_PROMPT },
  { phrase: 'but', category: 'contrast', prompt: CONTRAST_PROMPT },
  { phrase: 'yet', category: 'contrast', prompt: CONTRAST_PROMPT },

  // conclusion
  { phrase: 'for this reason', category: 'conclusion', prompt: CONCLUSION_PROMPT },
  { phrase: 'because of this', category: 'conclusion', prompt: CONCLUSION_PROMPT },
  { phrase: 'as a result', category: 'conclusion', prompt: CONCLUSION_PROMPT },
  { phrase: 'so then', category: 'conclusion', prompt: CONCLUSION_PROMPT },
  { phrase: 'consequently', category: 'conclusion', prompt: CONCLUSION_PROMPT },
  { phrase: 'accordingly', category: 'conclusion', prompt: CONCLUSION_PROMPT },
  { phrase: 'wherefore', category: 'conclusion', prompt: CONCLUSION_PROMPT },
  { phrase: 'therefore', category: 'conclusion', prompt: CONCLUSION_PROMPT },
  { phrase: 'thus', category: 'conclusion', prompt: CONCLUSION_PROMPT },

  // condition ("then" is only kept when an "if" precedes it - see the post-filter in findConnectors)
  { phrase: 'whosoever', category: 'condition', prompt: CONDITION_PROMPT },
  { phrase: 'whoever', category: 'condition', prompt: CONDITION_PROMPT },
  { phrase: 'unless', category: 'condition', prompt: CONDITION_PROMPT },
  { phrase: 'if', category: 'condition', prompt: CONDITION_PROMPT },
  { phrase: 'then', category: 'condition', prompt: CONDITION_PROMPT },

  // purpose
  { phrase: 'to the end that', category: 'purpose', prompt: PURPOSE_PROMPT },
  { phrase: 'in order that', category: 'purpose', prompt: PURPOSE_PROMPT },
  { phrase: 'that you may', category: 'purpose', prompt: PURPOSE_PROMPT },
  { phrase: 'that ye may', category: 'purpose', prompt: PURPOSE_PROMPT },
  { phrase: 'in order to', category: 'purpose', prompt: PURPOSE_PROMPT },
  { phrase: 'so that', category: 'purpose', prompt: PURPOSE_PROMPT },
  { phrase: 'lest', category: 'purpose', prompt: PURPOSE_PROMPT },

  // cause (bare "for"/"so"/"since" were dropped entirely - even clause-start-only,
  // they're too ambiguous in narrative prose to be worth the false positives)
  { phrase: 'for the sake of', category: 'cause', prompt: CAUSE_PROMPT },
  { phrase: 'inasmuch as', category: 'cause', prompt: CAUSE_PROMPT },
  { phrase: 'on account of', category: 'cause', prompt: CAUSE_PROMPT },
  { phrase: 'because', category: 'cause', prompt: CAUSE_PROMPT },
];

const SORTED_CONNECTORS: readonly ConnectorDef[] = [...CONNECTORS].sort((a, b) => {
  const aWords = a.phrase.split(' ').length;
  const bWords = b.phrase.split(' ').length;
  if (bWords !== aWords) return bWords - aWords;
  return b.phrase.length - a.phrase.length;
});

export function findConnectors(verses: AnalysisVerse[]): ConnectorHit[] {
  const hits: ConnectorHit[] = [];

  for (const verse of verses) {
    const claimedRanges: Array<[number, number]> = [];

    for (const def of SORTED_CONNECTORS) {
      for (const match of findPhraseMatches(verse.text, def.phrase)) {
        const overlaps = claimedRanges.some(([start, end]) => match.startIndex < end && match.endIndex > start);
        if (overlaps) continue;

        claimedRanges.push([match.startIndex, match.endIndex]);
        hits.push({
          phrase: match.matchedText,
          category: def.category,
          verse: verse.ref.verse,
          start: match.startIndex,
          end: match.endIndex,
        });
      }
    }
  }

  // Post-filter: a bare "then" only counts as a condition hinge when an "if"
  // hit precedes it in the same verse.
  const filtered = hits.filter(hit => {
    if (hit.category !== 'condition' || hit.phrase.toLowerCase() !== 'then') return true;
    return hits.some(
      other =>
        other !== hit &&
        other.verse === hit.verse &&
        other.category === 'condition' &&
        other.phrase.toLowerCase() === 'if' &&
        other.start < hit.start
    );
  });

  filtered.sort((a, b) => a.verse - b.verse || a.start - b.start);
  return filtered;
}

export function groupConnectorsByVerse(hits: ConnectorHit[]): Map<number, ConnectorHit[]> {
  const grouped = new Map<number, ConnectorHit[]>();
  for (const hit of hits) {
    const forVerse = grouped.get(hit.verse);
    if (forVerse) {
      forVerse.push(hit);
    } else {
      grouped.set(hit.verse, [hit]);
    }
  }
  return grouped;
}

const CATEGORY_PROMPTS: Record<ConnectorCategory, string> = {
  contrast: CONTRAST_PROMPT,
  conclusion: CONCLUSION_PROMPT,
  condition: CONDITION_PROMPT,
  purpose: PURPOSE_PROMPT,
  cause: CAUSE_PROMPT,
};

export function promptFor(hit: ConnectorHit): string {
  return CATEGORY_PROMPTS[hit.category].replace('{phrase}', hit.phrase);
}
