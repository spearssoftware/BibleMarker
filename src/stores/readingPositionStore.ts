/**
 * Reading Position Store
 *
 * The verse currently centered in the reader's scroll container. Written by
 * useCurrentVerseTracker; read by NavigationBar (and, later, follow-along
 * commentary). Kept out of bibleStore so frequent updates only re-render
 * subscribers of this slice.
 */

import { create } from 'zustand';

interface ReadingPositionState {
  currentVerse: number | null;
  /** True while a picker is open, so the text doesn't shift the displayed verse. */
  verseTrackingPaused: boolean;
  setCurrentVerse: (verse: number | null) => void;
  setVerseTrackingPaused: (paused: boolean) => void;
}

export const useReadingPositionStore = create<ReadingPositionState>((set, get) => ({
  currentVerse: null,
  verseTrackingPaused: false,
  setCurrentVerse: (verse) => {
    if (get().currentVerse === verse) return;
    set({ currentVerse: verse });
  },
  setVerseTrackingPaused: (paused) => {
    if (get().verseTrackingPaused === paused) return;
    set({ verseTrackingPaused: paused });
  },
}));
