/**
 * Application Types
 * 
 * Types for application phase tools (Precept Bible Study Method).
 * Based on 2 Timothy 3:16-17 - Scripture is profitable for teaching, reproof, correction, and training in righteousness.
 */

import type { VerseRef } from './bible';

/**
 * Application Worksheet Entry
 * 
 * A worksheet entry for recording how Scripture applies to life through:
 * - Teaching: What does this teach me?
 * - Reproof: What does this rebuke/correct in my life?
 * - Correction: How should I change?
 * - Training in Righteousness: How does this train me to be more like Christ?
 */
export interface ApplicationEntry {
  id: string;
  verseRef: VerseRef;        // Source verse reference
  teaching?: string;         // What this teaches me
  reproof?: string;         // What this rebukes/corrects in my life
  correction?: string;      // How I should change
  training?: string;       // How this trains me in righteousness
  notes?: string;          // Additional notes
  linkedPresetIds?: string[]; // Optional: link to marked keywords (MarkingPresets) in this verse
  studyId?: string;        // Optional: link to a specific study
  createdAt: Date;
  updatedAt: Date;
}
