/**
 * Key Word Store
 * 
 * Manages key word definitions and their usage throughout the app.
 */

import { create } from 'zustand';
import type { KeyWordDefinition, KeyWordCategory } from '@/types/keyWord';
import {
  getAllKeyWords,
  saveKeyWord,
  deleteKeyWord,
  searchKeyWords,
  incrementKeyWordUsage,
} from '@/lib/db';

interface KeyWordState {
  // All key words
  keyWords: KeyWordDefinition[];
  
  // Currently selected key word (for editing)
  selectedKeyWord: KeyWordDefinition | null;
  
  // Filter state
  filterCategory: KeyWordCategory | 'all';
  searchQuery: string;
  
  // Loading state
  isLoading: boolean;
  
  // Actions
  loadKeyWords: () => Promise<void>;
  addKeyWord: (keyWord: KeyWordDefinition) => Promise<void>;
  updateKeyWord: (keyWord: KeyWordDefinition) => Promise<void>;
  removeKeyWord: (id: string) => Promise<void>;
  selectKeyWord: (keyWord: KeyWordDefinition | null) => void;
  setFilterCategory: (category: KeyWordCategory | 'all') => void;
  setSearchQuery: (query: string) => void;
  findMatchingKeyWords: (text: string) => Promise<KeyWordDefinition[]>;
  markKeyWordUsed: (id: string) => Promise<void>;
  
  // Computed
  getFilteredKeyWords: () => KeyWordDefinition[];
}

export const useKeyWordStore = create<KeyWordState>((set, get) => ({
  keyWords: [],
  selectedKeyWord: null,
  filterCategory: 'all',
  searchQuery: '',
  isLoading: false,
  
  loadKeyWords: async () => {
    set({ isLoading: true });
    try {
      const keyWords = await getAllKeyWords();
      set({ keyWords, isLoading: false });
    } catch (error) {
      console.error('Failed to load key words:', error);
      set({ isLoading: false });
    }
  },
  
  addKeyWord: async (keyWord) => {
    try {
      await saveKeyWord(keyWord);
      await get().loadKeyWords();
    } catch (error) {
      console.error('Failed to add key word:', error);
      throw error;
    }
  },
  
  updateKeyWord: async (keyWord) => {
    try {
      const updated = {
        ...keyWord,
        updatedAt: new Date(),
      };
      await saveKeyWord(updated);
      await get().loadKeyWords();
      // Update selected if it's the same
      const { selectedKeyWord } = get();
      if (selectedKeyWord?.id === keyWord.id) {
        set({ selectedKeyWord: updated });
      }
    } catch (error) {
      console.error('Failed to update key word:', error);
      throw error;
    }
  },
  
  removeKeyWord: async (id) => {
    try {
      await deleteKeyWord(id);
      await get().loadKeyWords();
      const { selectedKeyWord } = get();
      if (selectedKeyWord?.id === id) {
        set({ selectedKeyWord: null });
      }
    } catch (error) {
      console.error('Failed to remove key word:', error);
      throw error;
    }
  },
  
  selectKeyWord: (keyWord) => {
    set({ selectedKeyWord: keyWord });
  },
  
  setFilterCategory: (category) => {
    set({ filterCategory: category });
  },
  
  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },
  
  findMatchingKeyWords: async (text) => {
    return searchKeyWords(text);
  },
  
  markKeyWordUsed: async (id) => {
    try {
      await incrementKeyWordUsage(id);
      await get().loadKeyWords();
    } catch (error) {
      console.error('Failed to mark key word as used:', error);
    }
  },
  
  getFilteredKeyWords: () => {
    const { keyWords, filterCategory, searchQuery } = get();
    let filtered = [...keyWords];
    
    // Filter by category
    if (filterCategory !== 'all') {
      filtered = filtered.filter(kw => kw.category === filterCategory);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(kw => 
        kw.word.toLowerCase().includes(query) ||
        kw.variants.some(v => v.toLowerCase().includes(query)) ||
        kw.description?.toLowerCase().includes(query)
      );
    }
    
    // Sort by usage count (most used first), then alphabetically
    return filtered.sort((a, b) => {
      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount;
      }
      return a.word.localeCompare(b.word);
    });
  },
}));
