/**
 * Bible Reading State Store
 * 
 * Manages current reading location and loaded chapter data.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Chapter } from '@/types';
import { BIBLE_BOOKS, getBookById } from '@/types';

interface BibleState {
  // Current location
  currentModuleId: string | null;
  currentBook: string;
  currentChapter: number;
  
  // Loaded data
  chapter: Chapter | null;
  isLoading: boolean;
  error: string | null;
  
  // Navigation selection
  navSelectedVerse: number | null;

  // Location history (for back navigation after cross-ref jumps)
  locationHistory: { book: string; chapter: number }[];

  // Actions
  setCurrentModule: (moduleId: string) => void;
  setLocation: (book: string, chapter: number) => void;
  setChapter: (chapter: Chapter | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setNavSelectedVerse: (verse: number | null) => void;
  
  // Navigation
  nextChapter: () => void;
  previousChapter: () => void;
  goBack: () => void;
  canGoNext: () => boolean;
  canGoPrevious: () => boolean;
  canGoBack: () => boolean;
}

export const useBibleStore = create<BibleState>()(
  persist(
    (set, get) => ({
      currentModuleId: null,
      currentBook: 'John',
      currentChapter: 1,
      chapter: null,
      isLoading: false,
      error: null,
      navSelectedVerse: null,
      locationHistory: [],

      setCurrentModule: (moduleId) => {
        // Validate moduleId - must be a non-empty string and not contain "undefined"
        if (!moduleId || typeof moduleId !== 'string' || moduleId.trim() === '' || 
            moduleId.includes('undefined')) {
          console.error('Invalid moduleId provided to setCurrentModule:', moduleId);
          return; // Don't update if invalid
        }
        set({ 
          currentModuleId: moduleId.trim(),
          chapter: null, // Clear chapter to force reload with new translation
        });
      },
      
      setLocation: (book, chapter) => {
        const { currentBook, currentChapter, locationHistory } = get();
        // Only push to history if actually changing location
        if (book !== currentBook || chapter !== currentChapter) {
          const newHistory = [...locationHistory, { book: currentBook, chapter: currentChapter }].slice(-20);
          set({
            currentBook: book,
            currentChapter: chapter,
            chapter: null,
            navSelectedVerse: null,
            locationHistory: newHistory,
          });
        }
      },
      
      setChapter: (chapter) => set({ chapter, isLoading: false }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error, isLoading: false }),
      
      setNavSelectedVerse: (verse) => set({ navSelectedVerse: verse }),
      
      nextChapter: () => {
        const { currentBook, currentChapter } = get();
        const bookInfo = getBookById(currentBook);
        if (!bookInfo) return;
        
        if (currentChapter < bookInfo.chapters) {
          // Next chapter in same book
          set({ currentChapter: currentChapter + 1, chapter: null });
        } else {
          // Move to next book
          const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === currentBook);
          if (currentIndex < BIBLE_BOOKS.length - 1) {
            const nextBook = BIBLE_BOOKS[currentIndex + 1];
            set({ 
              currentBook: nextBook.id, 
              currentChapter: 1,
              chapter: null,
            });
          }
        }
      },
      
      previousChapter: () => {
        const { currentBook, currentChapter } = get();
        
        if (currentChapter > 1) {
          // Previous chapter in same book
          set({ currentChapter: currentChapter - 1, chapter: null });
        } else {
          // Move to previous book
          const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === currentBook);
          if (currentIndex > 0) {
            const prevBook = BIBLE_BOOKS[currentIndex - 1];
            set({ 
              currentBook: prevBook.id, 
              currentChapter: prevBook.chapters,
              chapter: null,
            });
          }
        }
      },
      
      goBack: () => {
        const { locationHistory } = get();
        if (locationHistory.length === 0) return;
        const prev = locationHistory[locationHistory.length - 1];
        set({
          currentBook: prev.book,
          currentChapter: prev.chapter,
          chapter: null,
          navSelectedVerse: null,
          locationHistory: locationHistory.slice(0, -1),
        });
      },

      canGoNext: () => {
        const { currentBook, currentChapter } = get();
        const bookInfo = getBookById(currentBook);
        if (!bookInfo) return false;
        
        // Can go next if not at last verse of Revelation
        if (currentBook === 'Rev' && currentChapter === 22) return false;
        return true;
      },
      
      canGoBack: () => get().locationHistory.length > 0,

      canGoPrevious: () => {
        const { currentBook, currentChapter } = get();
        // Can go previous if not at Genesis 1
        if (currentBook === 'Gen' && currentChapter === 1) return false;
        return true;
      },
    }),
    {
      name: 'bible-reading-state',
      partialize: (state) => ({
        currentModuleId: state.currentModuleId,
        currentBook: state.currentBook,
        currentChapter: state.currentChapter,
      }),
      onRehydrateStorage: () => (state) => {
        // Clean up invalid module IDs when rehydrating from storage
        if (state && state.currentModuleId && state.currentModuleId.includes('undefined')) {
          state.currentModuleId = null;
        }
      },
    }
  )
);
