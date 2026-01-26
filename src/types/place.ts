/**
 * Geographic Location Types
 * 
 * Tracks places and geographic locations mentioned in the text (Precept method).
 */

import type { VerseRef } from './bible';

/** A place or geographic location entry */
export interface Place {
  id: string;
  name: string;            // Name of the place (e.g., "Jerusalem", "Mount Sinai", "Babylon")
  verseRef: VerseRef;      // Source verse reference
  notes?: string;          // Optional notes about the place
  presetId?: string;      // Optional link to a MarkingPreset (if place came from a keyword marking)
  annotationId?: string;   // Optional link to an annotation (if place came from a marked instance)
  createdAt: Date;
  updatedAt: Date;
}
