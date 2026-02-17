/**
 * Time Expression Types
 * 
 * Tracks chronological sequences and time references (Precept method).
 */

import type { VerseRef } from './bible';

/** A time expression entry */
export interface TimeExpression {
  id: string;
  expression: string;        // The time expression or phrase (e.g., "in the morning", "three days later")
  verseRef: VerseRef;        // Source verse reference
  notes?: string;            // Optional notes about the time expression
  presetId?: string;         // Optional link to a MarkingPreset (keyword) that was marked with time symbol
  annotationId?: string;     // Optional link to an annotation (if time expression came from a marked instance)
  studyId?: string;          // Optional link to a study (for scoping)
  timeOrder?: number;        // Optional chronological ordering (for sequencing time expressions)
  createdAt: Date;
  updatedAt: Date;
}
