/**
 * Bible Reading State Store
 * 
 * Manages current reading location and loaded chapter data.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Chapter } from '@/types/bible';
import { BIBLE_BOOKS, getBookById } from '@/types/bible';

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
  
  // Actions
  setCurrentModule: (moduleId: string) => void;
  setLocation: (book: string, chapter: number) => void;
  setChapter: (chapter: Chapter) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setNavSelectedVerse: (verse: number | null) => void;
  
  // Navigation
  nextChapter: () => void;
  previousChapter: () => void;
  canGoNext: () => boolean;
  canGoPrevious: () => boolean;
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
      
      setCurrentModule: (moduleId) => {
        // Validate moduleId - must be a non-empty string and not contain "undefined" or "observation-lists"
        if (!moduleId || typeof moduleId !== 'string' || moduleId.trim() === '' || 
            moduleId.includes('undefined') || moduleId === 'observation-lists') {
          console.error('Invalid moduleId provided to setCurrentModule:', moduleId);
          return; // Don't update if invalid
        }
        set({ 
          currentModuleId: moduleId.trim(),
          chapter: null, // Clear chapter to force reload with new translation
        });
      },
      
      setLocation: (book, chapter) => set({ 
        currentBook: book, 
        currentChapter: chapter,
        chapter: null, // Clear until loaded
        navSelectedVerse: null, // Clear nav selection when changing location
      }),
      
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
      
      canGoNext: () => {
        const { currentBook, currentChapter } = get();
        const bookInfo = getBookById(currentBook);
        if (!bookInfo) return false;
        
        // Can go next if not at last verse of Revelation
        if (currentBook === 'Rev' && currentChapter === 22) return false;
        return true;
      },
      
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
        if (state && state.currentModuleId === 'observation-lists') {
          console.log('[bibleStore] Cleaning up invalid moduleId: observation-lists');
          state.currentModuleId = null;
        }
      },
    }
  )
);
