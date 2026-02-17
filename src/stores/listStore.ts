/**
 * Observation List State Store
 * 
 * Manages observation lists - creating/editing lists, adding items, etc.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ObservationList, ObservationItem } from '@/types/list';
import { getAllObservationLists as dbGetAllLists, saveObservationList as dbSaveList, deleteObservationList as dbDeleteList, getMarkingPreset } from '@/lib/database';
import type { VerseRef } from '@/types/bible';
import { getBookById } from '@/types/bible';
import { findKeywordMatches } from '@/lib/keywordMatching';
import { validateObservationList, sanitizeData, ValidationError } from '@/lib/validation';

interface ListState {
  // Lists (cached)
  lists: ObservationList[];
  lastUsedListId: string | null; // Track most recently used list
  
  // Actions
  loadLists: () => Promise<void>;
  createList: (title: string, keyWordId: string, scope?: { book?: string; chapters?: number[] }, studyId?: string) => Promise<ObservationList>;
  updateList: (list: ObservationList) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  addItemToList: (listId: string, item: Omit<ObservationItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateItem: (listId: string, itemId: string, updates: Partial<ObservationItem>) => Promise<void>;
  deleteItem: (listId: string, itemId: string) => Promise<void>;
  getList: (listId: string) => ObservationList | null;
  getListsByKeyword: (keyWordId: string) => ObservationList[];
  getListsByStudy: (studyId: string) => ObservationList[];
  getOrCreateListForKeyword: (keyWordId: string, studyId?: string, book?: string) => Promise<ObservationList>;
  autoPopulateFromKeyword: (listId: string, keyWordId: string) => Promise<number>;
  getMostRecentlyUsedList: () => ObservationList | null;
}

// Dedup in-flight getOrCreateListForKeyword calls to prevent race conditions
// (e.g. React StrictMode double-firing effects)
const _pendingGetOrCreate = new Map<string, Promise<ObservationList>>();

export const useListStore = create<ListState>()(
  persist(
    (set, get) => ({
      lists: [],
      lastUsedListId: null,
      
      loadLists: async () => {
        const allLists = await dbGetAllLists();
        // Filter out any lists without keyWordId (shouldn't happen, but safety check)
        const validLists = allLists.filter(list => list.keyWordId);
        set({ lists: validLists });
        
        // Clean up invalid lists from database (optional - only if you want to remove them)
        if (allLists.length !== validLists.length) {
          const invalidIds = allLists
            .filter(list => !list.keyWordId)
            .map(list => list.id);
          if (invalidIds.length > 0) {
            await Promise.all(invalidIds.map(id => dbDeleteList(id)));
          }
        }
      },
      
      createList: async (title, keyWordId, scope, studyId) => {
        // Ensure fresh data from DB before dedup check
        await get().loadLists();
        const { lists: existingLists } = get();
        const duplicate = existingLists.find(l =>
          l.keyWordId === keyWordId &&
          l.studyId === studyId
        );
        if (duplicate) return duplicate;

        const newList: ObservationList = {
          id: crypto.randomUUID(),
          title,
          scope,
          items: [],
          keyWordId, // Required: list is about this keyword
          studyId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        try {
          const validated = sanitizeData(newList, validateObservationList);
          await dbSaveList(validated);
        
        const { lists } = get();
        // Set new list as most recently used
        set({ 
          lists: [...lists, validated],
          lastUsedListId: validated.id,
        });
        
        return validated;
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[createList] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid observation list data: ${error.message}`);
          }
          throw error;
        }
      },
      
      updateList: async (list) => {
        try {
          const updated = {
            ...list,
            updatedAt: new Date(),
          };
          
          const validated = sanitizeData(updated, validateObservationList);
          await dbSaveList(validated);
        
        const { lists } = get();
        set({ 
          lists: lists.map(l => l.id === list.id ? validated : l),
        });
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[updateList] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid observation list data: ${error.message}`);
          }
          throw error;
        }
      },
      
      deleteList: async (listId) => {
        await dbDeleteList(listId);
        
        const { lists, lastUsedListId } = get();
        set({ 
          lists: lists.filter(l => l.id !== listId),
          // Clear lastUsedListId if the deleted list was the most recently used
          lastUsedListId: lastUsedListId === listId ? null : lastUsedListId,
        });
      },
      
      addItemToList: async (listId, itemData) => {
        const { lists } = get();
        const list = lists.find(l => l.id === listId);
        if (!list) return;
        
        const newItem: ObservationItem = {
          id: crypto.randomUUID(),
          ...itemData,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        const updatedList: ObservationList = {
          ...list,
          items: [...list.items, newItem],
          updatedAt: new Date(),
        };
        
        await dbSaveList(updatedList);
        // Track this as the most recently used list
        set({ 
          lists: lists.map(l => l.id === listId ? updatedList : l),
          lastUsedListId: listId,
        });
      },
      
      updateItem: async (listId, itemId, updates) => {
        const { lists } = get();
        const list = lists.find(l => l.id === listId);
        if (!list) return;
        
        const updatedList: ObservationList = {
          ...list,
          items: list.items.map(item => 
            item.id === itemId 
              ? { ...item, ...updates, updatedAt: new Date() }
              : item
          ),
          updatedAt: new Date(),
        };
        
        try {
          const validated = sanitizeData(updatedList, validateObservationList);
          await dbSaveList(validated);
          set({ lists: lists.map(l => l.id === listId ? validated : l) });
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[updateItem] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid observation list data: ${error.message}`);
          }
          throw error;
        }
      },
      
      deleteItem: async (listId, itemId) => {
        const { lists } = get();
        const list = lists.find(l => l.id === listId);
        if (!list) return;
        
        const updatedList: ObservationList = {
          ...list,
          items: list.items.filter(item => item.id !== itemId),
          updatedAt: new Date(),
        };
        
        try {
          const validated = sanitizeData(updatedList, validateObservationList);
          await dbSaveList(validated);
          set({ lists: lists.map(l => l.id === listId ? validated : l) });
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[deleteItem] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid observation list data: ${error.message}`);
          }
          throw error;
        }
      },
      
      getList: (listId) => {
        const { lists } = get();
        return lists.find(l => l.id === listId) || null;
      },
      
      getListsByKeyword: (keyWordId) => {
        const { lists } = get();
        return lists.filter(l => l.keyWordId === keyWordId);
      },
      
      getListsByStudy: (studyId) => {
        const { lists } = get();
        return lists.filter(l => l.studyId === studyId);
      },
      
      getMostRecentlyUsedList: () => {
        const { lists, lastUsedListId } = get();
        if (!lastUsedListId) return null;
        const list = lists.find(l => l.id === lastUsedListId);
        return list || null;
      },
      
      getOrCreateListForKeyword: (keyWordId, studyId?, book?) => {
        const cacheKey = `${keyWordId}:${studyId ?? ''}`;
        const pending = _pendingGetOrCreate.get(cacheKey);
        if (pending) return pending;

        const promise = (async () => {
          try {
            await get().loadLists();
            const { lists, createList } = get();
            const existing = lists.find(l =>
              l.keyWordId === keyWordId &&
              l.studyId === studyId
            );
            if (existing) return existing;

            const preset = await getMarkingPreset(keyWordId);
            const keywordName = preset?.word || 'Unknown';
            const bookInfo = book ? getBookById(book) : null;
            const title = bookInfo
              ? `Observations about '${keywordName}' in ${bookInfo.name}`
              : `Observations about '${keywordName}'`;
            const scope = book ? { book } : undefined;
            return createList(title, keyWordId, scope, studyId);
          } finally {
            _pendingGetOrCreate.delete(cacheKey);
          }
        })();

        _pendingGetOrCreate.set(cacheKey, promise);
        return promise;
      },

      autoPopulateFromKeyword: async (listId, keyWordId) => {
        const { lists } = get();
        const list = lists.find(l => l.id === listId);
        if (!list) return 0;

        // Get the marking preset to find the word and variants
        const preset = await getMarkingPreset(keyWordId);
        if (!preset || !preset.word) {
          console.warn('Preset not found or has no word:', keyWordId);
          return 0;
        }

        // Get all cached chapters to search through
        // We'll search all modules, but could filter by currentModuleId if needed
        const { getAllCachedChapters } = await import('@/lib/database');
        const allChapters = await getAllCachedChapters();

        // Track verses where keyword appears
        const verseMap = new Map<string, { verseRef: VerseRef; text: string; hasMatch: boolean }>();

        // Search through all cached chapters
        for (const chapterCache of allChapters) {
          // Respect list scope if set
          if (list.scope?.book && chapterCache.book !== list.scope.book) {
            continue;
          }
          if (list.scope?.chapters && list.scope.chapters.length > 0) {
            if (!list.scope.chapters.includes(chapterCache.chapter)) {
              continue;
            }
          }

          // Search through verses in this chapter
          for (const [verseNum, verseText] of Object.entries(chapterCache.verses)) {
            const text = verseText as string;
            const verseNumInt = parseInt(verseNum, 10);
            if (isNaN(verseNumInt) || verseNumInt <= 0) continue;

            const verseRef: VerseRef = {
              book: chapterCache.book,
              chapter: chapterCache.chapter,
              verse: verseNumInt,
            };
            const verseKey = `${verseRef.book}:${verseRef.chapter}:${verseRef.verse}`;

            // Skip if already found
            if (verseMap.has(verseKey)) continue;

            // Use the keyword matching utility to find matches (handles multi-word phrases, variants, etc.)
            const matches = findKeywordMatches(text, verseRef, [preset], chapterCache.moduleId);
            
            // If keyword found in this verse, add it
            if (matches.length > 0) {
              verseMap.set(verseKey, { verseRef, text, hasMatch: true });
            }
          }
        }

        // Create observation items for each verse where keyword appears
        const newItems: ObservationItem[] = Array.from(verseMap.values()).map(({ verseRef, text }) => {
          // Extract a snippet of text around the keyword for context
          const lowerText = text.toLowerCase();
          const lowerWord = (preset.word || '').toLowerCase();
          let snippet = text;

          // Try to find the keyword in the text and get context
          const wordIndex = lowerText.indexOf(lowerWord);
          if (wordIndex !== -1) {
            const start = Math.max(0, wordIndex - 30);
            const end = Math.min(text.length, wordIndex + lowerWord.length + 30);
            snippet = text.substring(start, end);
            if (start > 0) snippet = '...' + snippet;
            if (end < text.length) snippet = snippet + '...';
          }

          return {
            id: crypto.randomUUID(),
            content: snippet.trim() || 'Keyword appears in this verse',
            verseRef,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });

        // Filter out verses that already exist in the list
        const existingVerseKeys = new Set(
          list.items.map(item => `${item.verseRef.book}:${item.verseRef.chapter}:${item.verseRef.verse}`)
        );
        const uniqueItems = newItems.filter(item => {
          const verseKey = `${item.verseRef.book}:${item.verseRef.chapter}:${item.verseRef.verse}`;
          return !existingVerseKeys.has(verseKey);
        });

        if (uniqueItems.length === 0) return 0;

        // Add new items to the list
        const updatedList: ObservationList = {
          ...list,
          items: [...list.items, ...uniqueItems],
          updatedAt: new Date(),
        };

        await dbSaveList(updatedList);
        // Track this as the most recently used list
        set({ 
          lists: lists.map(l => l.id === listId ? updatedList : l),
          lastUsedListId: listId,
        });

        return uniqueItems.length;
      },

    }),
    {
      name: 'list-store',
      partialize: (state) => ({ 
        lists: state.lists,
        lastUsedListId: state.lastUsedListId,
      }),
    }
  )
);
