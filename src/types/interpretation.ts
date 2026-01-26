/**
 * Interpretation Types
 * 
 * Types for interpretation phase tools (Precept Bible Study Method).
 */

import type { VerseRef } from './bible';

/**
 * Interpretation Worksheet Entry
 * 
 * A worksheet entry for recording interpretation insights from a passage.
 * Includes guided questions to help understand the meaning, context, and implications.
 */
export interface InterpretationEntry {
  id: string;
  verseRef: VerseRef;              // Source verse reference (can span multiple verses)
  endVerseRef?: VerseRef;          // Optional end verse for passages spanning multiple verses
  
  // Guided interpretation questions
  meaning?: string;                // What does this passage mean?
  authorIntent?: string;           // What is the author's intent or purpose?
  keyThemes?: string;              // What are the key themes or concepts?
  context?: string;                // What is the historical, cultural, or literary context?
  implications?: string;           // What are the implications or applications?
  crossReferences?: string;       // How does this relate to other passages?
  questions?: string;              // What questions does this passage raise?
  insights?: string;               // Additional insights or observations
  
  // Optional linking
  linkedPresetIds?: string[];      // Link to marked keywords that support this interpretation
  studyId?: string;                // Optional: link to a specific study
  
  createdAt: Date;
  updatedAt: Date;
}
