/**
 * Store Reset Utilities
 * 
 * Helper functions to reset Zustand stores after database operations.
 * This prevents crashes from stale data in memory after clearing the database.
 */

import { useAnnotationStore } from '@/stores/annotationStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useListStore } from '@/stores/listStore';
import { useStudyStore } from '@/stores/studyStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { DEFAULT_MARKING_PREFERENCES } from '@/types/annotation';

/**
 * Reset all stores to their initial state after clearing the database
 * This prevents crashes from components trying to access stale data in memory.
 * 
 * Note: We clear the annotation store synchronously (most critical), and let
 * the page reload handle resetting the other stores since they'll reload from
 * the now-empty database.
 */
export function resetAllStores(): void {
  try {
    // Reset annotation store (most critical - has data arrays that components render)
    const annotationStore = useAnnotationStore.getState();
    annotationStore.setAnnotations([]);
    annotationStore.setSectionHeadings([]);
    annotationStore.setChapterTitle(null);
    annotationStore.setNotes([]);
    annotationStore.setSelection(null);
    annotationStore.setPreferences(DEFAULT_MARKING_PREFERENCES);
    
    // For other stores, we rely on the page reload to reset them.
    // The stores will reload from the (now empty) database after reload.
    // This is safer than trying to mutate Zustand store internals.
  } catch (error) {
    console.error('Error resetting stores:', error);
    // Don't throw - page reload will fix everything anyway
  }
}
