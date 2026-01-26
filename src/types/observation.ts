/**
 * Observation Types
 * 
 * Types for observation phase tools (Precept Bible Study Method).
 */

import type { VerseRef } from './bible';

/**
 * 5 W's and H Worksheet Entry
 * 
 * A worksheet entry for recording Who, What, When, Where, Why, and How
 * observations from a passage.
 */
export interface FiveWAndHEntry {
  id: string;
  verseRef: VerseRef;        // Source verse reference
  who?: string;              // Who - people/characters involved
  what?: string;             // What - events/actions that occurred
  when?: string;             // When - time expressions
  where?: string;            // Where - places/locations
  why?: string;              // Why - reasons/motivations
  how?: string;              // How - methods/means
  notes?: string;            // Additional notes
  linkedPresetIds?: string[]; // Optional: link to marked keywords (MarkingPresets) in this verse
  createdAt: Date;
  updatedAt: Date;
}
