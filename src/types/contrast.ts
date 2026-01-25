/**
 * Contrast and Comparison Types
 * 
 * Tracks contrasts and comparisons between ideas, people, or concepts (Precept method).
 */

import type { VerseRef } from './bible';

/** A contrast or comparison entry */
export interface Contrast {
  id: string;
  itemA: string;           // First item being compared/contrasted
  itemB: string;           // Second item being compared/contrasted
  verseRef: VerseRef;      // Source verse reference
  notes?: string;          // Optional notes about the contrast
  annotationId?: string;  // Optional link to an annotation (if contrast came from a marked instance)
  createdAt: Date;
  updatedAt: Date;
}
