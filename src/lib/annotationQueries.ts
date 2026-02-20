/**
 * Annotation Query Helpers
 * 
 * Utility functions for querying annotations by symbol, presetId, and other criteria.
 * Used by observation trackers to auto-import existing keyword annotations.
 */

import { sqlSelect, getChapterAnnotations, getMarkingPreset } from './database';
import type { Annotation, SymbolAnnotation } from '@/types';
import type { SymbolKey } from '@/types';
import type { VerseRef } from '@/types';

/**
 * Query annotations by symbol type
 * Returns all symbol annotations with the specified symbol
 */
export async function getAnnotationsBySymbol(symbol: SymbolKey): Promise<SymbolAnnotation[]> {
  const rows = await sqlSelect<{ data: string }>(`SELECT data FROM annotations`);
  const allAnnotations = rows.map(row => JSON.parse(row.data) as Annotation);
  return allAnnotations.filter((ann): ann is SymbolAnnotation => 
    ann.type === 'symbol' && ann.symbol === symbol
  );
}

/**
 * Query annotations by symbol and presetId
 * Returns symbol annotations that match both the symbol and have the specified presetId
 */
export async function getAnnotationsBySymbolAndPreset(
  symbol: SymbolKey,
  presetId: string
): Promise<SymbolAnnotation[]> {
  const rows = await sqlSelect<{ data: string }>(`SELECT data FROM annotations`);
  const allAnnotations = rows.map(row => JSON.parse(row.data) as Annotation);
  return allAnnotations.filter((ann): ann is SymbolAnnotation => 
    ann.type === 'symbol' && 
    ann.symbol === symbol && 
    ann.presetId === presetId
  );
}

/**
 * Query annotations by multiple symbols (for trackers that support multiple symbols)
 * Returns all symbol annotations that match any of the provided symbols
 */
export async function getAnnotationsBySymbols(symbols: SymbolKey[]): Promise<SymbolAnnotation[]> {
  const rows = await sqlSelect<{ data: string }>(`SELECT data FROM annotations`);
  const allAnnotations = rows.map(row => JSON.parse(row.data) as Annotation);
  const symbolSet = new Set(symbols);
  return allAnnotations.filter((ann): ann is SymbolAnnotation => 
    ann.type === 'symbol' && symbolSet.has(ann.symbol)
  );
}

/**
 * Query annotations by multiple symbols and presetId
 * Returns symbol annotations that match any of the symbols and have the specified presetId
 */
export async function getAnnotationsBySymbolsAndPreset(
  symbols: SymbolKey[],
  presetId: string
): Promise<SymbolAnnotation[]> {
  const rows = await sqlSelect<{ data: string }>(`SELECT data FROM annotations`);
  const allAnnotations = rows.map(row => JSON.parse(row.data) as Annotation);
  const symbolSet = new Set(symbols);
  return allAnnotations.filter((ann): ann is SymbolAnnotation => 
    ann.type === 'symbol' && 
    symbolSet.has(ann.symbol) && 
    ann.presetId === presetId
  );
}

/**
 * Query annotations by multiple symbols (without presetId requirement)
 * Useful for auto-importing all place/time/contrast annotations regardless of keyword
 */
export async function getAnnotationsBySymbolsWithPreset(symbols: SymbolKey[]): Promise<SymbolAnnotation[]> {
  const rows = await sqlSelect<{ data: string }>(`SELECT data FROM annotations`);
  const allAnnotations = rows.map(row => JSON.parse(row.data) as Annotation);
  const symbolSet = new Set(symbols);
  return allAnnotations.filter((ann): ann is SymbolAnnotation => 
    ann.type === 'symbol' && 
    symbolSet.has(ann.symbol) &&
    ann.presetId !== undefined
  );
}

/**
 * Get the selected text from an annotation
 * Returns selectedText if available, otherwise empty string
 */
export function getAnnotationText(annotation: Annotation): string {
  return annotation.selectedText || '';
}

/**
 * Get verse reference from an annotation
 */
export function getAnnotationVerseRef(annotation: Annotation): VerseRef {
  if (annotation.type === 'symbol') {
    return annotation.ref;
  }
  // For text annotations (highlight, textColor, underline), use startRef
  return annotation.startRef;
}

/**
 * Analyze keyword frequency by chapter for theme suggestions
 * Returns an array of keywords sorted by frequency in the specified chapter
 */
export async function analyzeKeywordFrequencyByChapter(
  moduleId: string,
  book: string,
  chapter: number
): Promise<Array<{ presetId: string; word: string; count: number }>> {
  // Get all annotations for this chapter
  const annotations = await getChapterAnnotations(moduleId, book, chapter);
  
  // Count keyword occurrences
  const keywordMap = new Map<string, { presetId: string; count: number }>();
  
  for (const ann of annotations) {
    if (ann.presetId) {
      const existing = keywordMap.get(ann.presetId);
      if (existing) {
        existing.count++;
      } else {
        keywordMap.set(ann.presetId, { presetId: ann.presetId, count: 1 });
      }
    }
  }
  
  // Fetch preset details and convert to array
  const keywordArray: Array<{ presetId: string; word: string; count: number }> = [];
  
  for (const [presetId, data] of keywordMap.entries()) {
    const preset = await getMarkingPreset(presetId);
    if (preset && preset.word) {
      keywordArray.push({
        presetId,
        word: preset.word,
        count: data.count,
      });
    }
  }
  
  // Sort by count descending
  return keywordArray.sort((a, b) => b.count - a.count);
}
