/**
 * Annotation Query Helpers
 * 
 * Utility functions for querying annotations by symbol, presetId, and other criteria.
 * Used by observation trackers to auto-import existing keyword annotations.
 */

import { db } from './db';
import type { Annotation, SymbolAnnotation } from '@/types/annotation';
import type { SymbolKey } from '@/types/annotation';
import type { VerseRef } from '@/types/bible';

/**
 * Query annotations by symbol type
 * Returns all symbol annotations with the specified symbol
 */
export async function getAnnotationsBySymbol(symbol: SymbolKey): Promise<SymbolAnnotation[]> {
  const allAnnotations = await db.annotations.toArray();
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
  const allAnnotations = await db.annotations.toArray();
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
  const allAnnotations = await db.annotations.toArray();
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
  const allAnnotations = await db.annotations.toArray();
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
  const allAnnotations = await db.annotations.toArray();
  const symbolSet = new Set(symbols);
  return allAnnotations.filter((ann): ann is SymbolAnnotation => 
    ann.type === 'symbol' && 
    symbolSet.has(ann.symbol) &&
    ann.presetId !== undefined
  );
}

/**
 * Get the selected text from an annotation
 * For symbol annotations, returns selectedText if available, otherwise empty string
 */
export function getAnnotationText(annotation: SymbolAnnotation): string {
  return annotation.selectedText || '';
}

/**
 * Get verse reference from an annotation
 */
export function getAnnotationVerseRef(annotation: SymbolAnnotation): VerseRef {
  return annotation.ref;
}
