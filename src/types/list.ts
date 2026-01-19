/**
 * Observation List Types
 * 
 * Lists of observations about topics/key words (Precept method).
 */

import type { VerseRef } from './bible';

/** An observation item in a list */
export interface ObservationItem {
  id: string;
  content: string;        // The observation text
  verseRef: VerseRef;      // Source verse reference
  annotationId?: string;   // Optional link to an annotation (if observation came from a marked instance)
  createdAt: Date;
  updatedAt: Date;
}

/** Scope for limiting observations to specific books/chapters */
export interface ObservationScope {
  book?: string;          // Limit to book (e.g., "John")
  chapters?: number[];    // Limit to chapters (e.g., [1, 2, 3])
}

/** Observation list - a collection of observations about a specific key word */
export interface ObservationList {
  id: string;
  title: string;          // "What I learn about God in John 1"
  scope?: ObservationScope; // Optional: limit to book/chapters
  items: ObservationItem[];
  keyWordId: string;      // Required: link to a key word (MarkingPreset) - list is about this keyword
  studyId?: string;       // Optional: link to a study (for organization)
  createdAt: Date;
  updatedAt: Date;
}
