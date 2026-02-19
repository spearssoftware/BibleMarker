/**
 * Person Types
 *
 * Tracks people and characters mentioned in the text (Precept method).
 */

import type { VerseRef } from './bible';

/** A person or character entry */
export interface Person {
  id: string;
  name: string;
  verseRef: VerseRef;
  notes?: string;
  presetId?: string;
  annotationId?: string;
  studyId?: string;
  yearStart?: number;
  yearStartEra?: 'BC' | 'AD';
  yearEnd?: number;
  yearEndEra?: 'BC' | 'AD';
  createdAt: Date;
  updatedAt: Date;
}
