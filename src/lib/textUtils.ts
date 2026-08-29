/**
 * Text Utility Functions
 * 
 * Helper functions for cleaning and processing text.
 */

import { SYMBOLS } from '@/types';

/**
 * Remove symbol characters from text
 * Symbols are rendered inline in verse text, so they can appear in selected text
 */
export function stripSymbols(text: string): string {
  if (!text) return text;
  
  // Exclude single ASCII characters (letters, digits, punctuation) that appear in normal text
  const symbolChars = Object.values(SYMBOLS).filter(s => s.length > 1 || s.charCodeAt(0) > 127);

  // Remove all symbol characters from the text
  // Use split/join for reliable Unicode handling
  let cleaned = text;
  for (const symbol of symbolChars) {
    // Split by symbol and rejoin to remove all occurrences
    cleaned = cleaned.split(symbol).join('');
  }
  
  // Clean up extra whitespace that might be left behind
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/** Format a count with its singular/plural noun, e.g. `pluralize(1, 'person', 'people')` -> "1 person". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Pick the singular/plural verb form for a count, e.g. `agree(1, 'is', 'are')` -> "is". */
export function agree(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
