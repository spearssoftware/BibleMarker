/**
 * Conclusion Terms Types
 * 
 * Tracks logical flow of conclusions and therefore statements (Precept method).
 */

import type { VerseRef } from './bible';

/** A conclusion or therefore statement entry */
export interface Conclusion {
  id: string;
  term: string;              // The conclusion term or phrase (e.g., "therefore", "so", "thus", "consequently")
  verseRef: VerseRef;        // Source verse reference
  notes?: string;            // Optional notes about the conclusion
  presetId?: string;         // Optional link to a MarkingPreset (keyword) that was marked with conclusion symbol
  annotationId?: string;     // Optional link to an annotation (if conclusion came from a marked instance)
  flowOrder?: number;        // Optional logical flow ordering (for sequencing conclusions)
  createdAt: Date;
  updatedAt: Date;
}
