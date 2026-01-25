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
  annotationId?: string;     // Optional link to an annotation (if time expression came from a marked instance)
  createdAt: Date;
  updatedAt: Date;
}
