/**
 * Multi-Translation View Types
 * 
 * Support for displaying multiple Bible translations side-by-side.
 */

export interface MultiTranslationView {
  id: string;                    // 'active' for singleton
  translationIds: string[];       // Up to 3 translation IDs (e.g., ['ESV', 'NASB', 'KJV'])
  syncScrolling: boolean;         // Enable/disable synchronized scrolling
}
