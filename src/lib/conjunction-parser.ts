/**
 * Conjunction Parser
 *
 * Detects biblical conjunctions and generates an initial structured
 * layout from verse text by splitting at clause boundaries.
 */

import type { ConjunctionCategory, DetectedConjunction, StructureLine } from '@/types';

interface ConjunctionEntry {
  word: string;
  category: ConjunctionCategory;
}

// Ordered from longest to shortest so multi-word phrases match first
const CONJUNCTIONS: ConjunctionEntry[] = [
  // Time
  { word: 'after this', category: 'time' },
  { word: 'after that', category: 'time' },
  { word: 'at that time', category: 'time' },
  { word: 'in that day', category: 'time' },
  { word: 'when', category: 'time' },
  { word: 'while', category: 'time' },
  { word: 'until', category: 'time' },
  { word: 'before', category: 'time' },
  { word: 'after', category: 'time' },
  { word: 'then', category: 'time' },
  { word: 'now', category: 'time' },

  // Place
  { word: 'where', category: 'place' },
  { word: 'wherever', category: 'place' },

  // Reason/Cause
  { word: 'because of', category: 'reason' },
  { word: 'inasmuch as', category: 'reason' },
  { word: 'forasmuch as', category: 'reason' },
  { word: 'insomuch that', category: 'reason' },
  { word: 'because', category: 'reason' },
  { word: 'since', category: 'reason' },
  { word: 'for', category: 'reason' },

  // Result/Consequence
  { word: 'so that', category: 'result' },
  { word: 'in order that', category: 'result' },
  { word: 'such that', category: 'result' },
  { word: 'therefore', category: 'result' },
  { word: 'wherefore', category: 'result' },
  { word: 'thus', category: 'result' },
  { word: 'so', category: 'result' },

  // Explanation
  { word: 'that is', category: 'explanation' },
  { word: 'namely', category: 'explanation' },
  { word: 'that', category: 'explanation' },

  // Purpose
  { word: 'in order to', category: 'purpose' },
  { word: 'so as to', category: 'purpose' },
  { word: 'lest', category: 'purpose' },

  // Contrast
  { word: 'on the other hand', category: 'contrast' },
  { word: 'on the contrary', category: 'contrast' },
  { word: 'but rather', category: 'contrast' },
  { word: 'nevertheless', category: 'contrast' },
  { word: 'nonetheless', category: 'contrast' },
  { word: 'notwithstanding', category: 'contrast' },
  { word: 'yet', category: 'contrast' },
  { word: 'however', category: 'contrast' },
  { word: 'but', category: 'contrast' },

  // Comparison
  { word: 'just as', category: 'comparison' },
  { word: 'even as', category: 'comparison' },
  { word: 'as if', category: 'comparison' },
  { word: 'like', category: 'comparison' },
  { word: 'as', category: 'comparison' },

  // Continuation/Addition
  { word: 'furthermore', category: 'continuation' },
  { word: 'moreover', category: 'continuation' },
  { word: 'in addition', category: 'continuation' },
  { word: 'besides', category: 'continuation' },
  { word: 'likewise', category: 'continuation' },
  { word: 'also', category: 'continuation' },
  { word: 'and', category: 'continuation' },

  // Concession
  { word: 'even though', category: 'concession' },
  { word: 'although', category: 'concession' },
  { word: 'though', category: 'concession' },
  { word: 'even if', category: 'concession' },

  // Condition
  { word: 'provided that', category: 'condition' },
  { word: 'as long as', category: 'condition' },
  { word: 'unless', category: 'condition' },
  { word: 'if', category: 'condition' },

  // Emphatic
  { word: 'indeed', category: 'emphatic' },
  { word: 'truly', category: 'emphatic' },
  { word: 'verily', category: 'emphatic' },
  { word: 'behold', category: 'emphatic' },
];

/**
 * Detect a conjunction at the start of a trimmed text string.
 * Returns the match if found, undefined otherwise.
 */
export function detectConjunction(text: string): DetectedConjunction | undefined {
  const trimmed = text.trimStart();
  const lowerTrimmed = trimmed.toLowerCase();

  for (const entry of CONJUNCTIONS) {
    const { word } = entry;
    if (!lowerTrimmed.startsWith(word)) continue;

    // Ensure word boundary after the conjunction
    const charAfter = lowerTrimmed[word.length];
    if (charAfter !== undefined && /\w/.test(charAfter)) continue;

    const offset = text.length - trimmed.length;
    return { word: text.slice(offset, offset + word.length), category: entry.category, offset };
  }

  return undefined;
}

/**
 * Strip HTML tags from text, returning plain text.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Split verse text at clause boundaries (conjunctions preceded by punctuation or verse start).
 * Returns an array of { text, offset } where offset is the character position in the original text.
 */
function splitAtBoundaries(text: string): { text: string; offset: number }[] {
  const clauses: { text: string; offset: number }[] = [];

  // Manual split: look for [,;.] + whitespace + conjunction word boundary
  let remaining = text;
  let globalOffset = 0;

  while (remaining.length > 0) {
    let splitIndex = -1;

    // Find the earliest punctuation+whitespace+conjunction boundary
    const lowerRemaining = remaining.toLowerCase();

    for (const entry of CONJUNCTIONS) {
      const word = entry.word;
      // Look for [,;.] + one or more spaces + word at word boundary
      const searchPattern = new RegExp(`[,;.]\\s+(${escapeRegex(word)})(?=\\s|$|[,;.])`, 'i');
      const match = searchPattern.exec(lowerRemaining);
      if (match && match.index !== -1) {
        // The split point is after the punctuation, before the conjunction
        const conjStart = match.index + match[0].indexOf(match[1]);
        if (splitIndex === -1 || conjStart < splitIndex) {
          splitIndex = conjStart;
        }
      }
    }

    if (splitIndex > 0) {
      clauses.push({ text: remaining.slice(0, splitIndex).trimEnd(), offset: globalOffset });
      const consumed = splitIndex;
      globalOffset += consumed;
      remaining = remaining.slice(consumed);
    } else {
      // No more boundaries — rest is last clause
      clauses.push({ text: remaining.trimEnd(), offset: globalOffset });
      break;
    }
  }

  return clauses.filter(c => c.text.trim().length > 0);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate an initial structured layout from verse texts.
 * Returns an array of StructureLines suitable for the editor.
 */
export function generateStructure(
  verses: { verse: number; text: string }[]
): StructureLine[] {
  const lines: StructureLine[] = [];
  let order = 0;

  for (const { verse, text } of verses) {
    const plain = stripHtml(text).replace(/\s+/g, ' ').trim();
    if (!plain) continue;

    const clauses = splitAtBoundaries(plain);
    const isFirstVerse = verse === verses[0]?.verse;

    clauses.forEach((clause, clauseIndex) => {
      const clauseText = clause.text.trim();
      if (!clauseText) return;

      const conjunction = detectConjunction(clauseText);
      let indent: number;

      if (clauseIndex === 0) {
        // First clause of a verse: main clause (indent 0) unless it starts with a conjunction
        indent = conjunction ? 1 : 0;
        // Non-first verses' first clause: if it has a conjunction, indent 1; else 0
        if (!isFirstVerse && clauseIndex === 0) {
          indent = conjunction ? 1 : 0;
        }
      } else {
        // Subsequent clauses default to indent 1
        indent = 1;
      }

      lines.push({
        id: crypto.randomUUID(),
        text: clauseText,
        indent,
        verseNumber: verse,
        sourceOffset: clause.offset,
        conjunction,
        order,
      });
      order++;
    });
  }

  return lines;
}

