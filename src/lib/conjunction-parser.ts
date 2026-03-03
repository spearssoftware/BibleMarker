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
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Split verse text at every comma or semicolon boundary.
 * Returns an array of { text, offset } where offset is the character position in the original text.
 */
function splitAtBoundaries(text: string): { text: string; offset: number }[] {
  const clauses: { text: string; offset: number }[] = [];
  const regex = /[,;]\s*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const clauseText = text.slice(lastIndex, match.index).trim();
    if (clauseText) clauses.push({ text: clauseText, offset: lastIndex });
    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining) clauses.push({ text: remaining, offset: lastIndex });

  return clauses;
}

type ClauseType = 'main' | 'conjunction' | 'relative' | 'prepositional' | 'continuation';

// Relative pronouns that introduce subordinate relative clauses
const RELATIVE_PRONOUNS = new Set(['who', 'which', 'whose', 'whom']);

// Prepositions that typically begin adverbial/adjectival phrases
const PREPOSITIONS = new Set([
  'into', 'in', 'on', 'at', 'by', 'of', 'through', 'with', 'from', 'to', 'unto',
  'above', 'below', 'under', 'over', 'against', 'among', 'between', 'within',
  'without', 'upon', 'beside', 'beyond', 'toward', 'towards', 'around', 'near',
  'during', 'behind', 'beneath', 'across', 'along', 'throughout', 'out',
]);

function classifyClause(text: string): ClauseType {
  const lower = text.trim().toLowerCase();
  const firstWord = lower.split(/\s+/)[0].replace(/[,;.!?'"]+$/, '');

  if (RELATIVE_PRONOUNS.has(firstWord)) return 'relative';
  if (detectConjunction(text)) return 'conjunction';
  if (PREPOSITIONS.has(firstWord)) return 'prepositional';
  return 'continuation';
}

/**
 * Assign an indent level based on clause type and context.
 *
 * Strategy:
 * - main/first clause → 0
 * - conjunction clause → 1 (logically subordinate to the main thought)
 * - relative clause (who/which) → prevIndent + 1 (modifies the preceding noun)
 * - prepositional phrase → 1, or stays at prevIndent when following a relative clause
 * - continuation (appositive, bare noun phrase) → prevIndent if > 0, else 1
 */
function indentForClause(
  type: ClauseType,
  isFirst: boolean,
  prevType: ClauseType | null,
  prevIndent: number
): number {
  if (isFirst) return 0;

  switch (type) {
    case 'main':
      return 0;
    case 'conjunction':
      return 1;
    case 'relative':
      return prevIndent + 1;
    case 'prepositional':
      // Keep at prevIndent when following a relative clause (parallel modifier);
      // otherwise default to indent 1
      return prevType === 'relative' ? prevIndent : 1;
    case 'continuation':
      return prevIndent > 0 ? prevIndent : 1;
  }
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
  let prevType: ClauseType | null = null;
  let prevIndent = 0;
  let isFirstClause = true;

  for (const { verse, text } of verses) {
    const plain = stripHtml(text).replace(/\s+/g, ' ').trim();
    if (!plain) continue;

    const clauses = splitAtBoundaries(plain);

    for (const clause of clauses) {
      const clauseText = clause.text.trim();
      if (!clauseText) continue;

      const conjunction = detectConjunction(clauseText);
      const type = isFirstClause ? 'main' : classifyClause(clauseText);
      const indent = indentForClause(type, isFirstClause, prevType, prevIndent);

      lines.push({
        id: crypto.randomUUID(),
        text: clauseText,
        indent,
        verseNumber: verse,
        sourceOffset: clause.offset,
        conjunction,
        order,
      });

      prevType = type;
      prevIndent = indent;
      isFirstClause = false;
      order++;
    }
  }

  return lines;
}
