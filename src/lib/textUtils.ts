/**
 * Text Utility Functions
 * 
 * Helper functions for cleaning and processing text.
 */

import { SYMBOLS } from '@/types/annotation';

/**
 * Remove symbol characters from text
 * Symbols are rendered inline in verse text, so they can appear in selected text
 */
export function stripSymbols(text: string): string {
  if (!text) return text;
  
  // Get all symbol characters
  const symbolChars = Object.values(SYMBOLS);
  
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
