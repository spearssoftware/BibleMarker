/**
 * Active Chapter Store
 *
 * Holds the verse text for the currently displayed primary translation chapter.
 * Written by MultiTranslationView when a chapter loads; read by ChapterAtAGlance
 * for keyword matching — avoiding redundant API calls.
 */

import { create } from 'zustand';
import type { VerseRef } from '@/types';

interface ActiveChapterVerse {
  ref: VerseRef;
  text: string;
}

interface ActiveChapterState {
  translationId: string | null;
  book: string | null;
  chapter: number | null;
  verses: ActiveChapterVerse[];
  setActiveChapterVerses: (
    translationId: string,
    book: string,
    chapter: number,
    verses: ActiveChapterVerse[]
  ) => void;
}

export const useActiveChapterStore = create<ActiveChapterState>((set, get) => ({
  translationId: null,
  book: null,
  chapter: null,
  verses: [],
  setActiveChapterVerses: (translationId, book, chapter, verses) => {
    const current = get();
    // Cheap identity proxy: same location + same verse count is treated as "already published",
    // skipping a no-op set() that would otherwise churn memoized consumers with a new array identity.
    if (
      current.translationId === translationId &&
      current.book === book &&
      current.chapter === chapter &&
      current.verses.length === verses.length
    ) {
      return;
    }
    set({ translationId, book, chapter, verses });
  },
}));
