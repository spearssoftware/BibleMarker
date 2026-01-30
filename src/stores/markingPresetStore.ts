/**
 * Marking Preset Store
 *
 * Manages marking presets (unified key words + symbol/color presets).
 * Replaces keyWordStore; Key Words = presets with `word` set.
 */

import { create } from 'zustand';
import type { MarkingPreset, KeyWordCategory } from '@/types/keyWord';
import { normalizeVariants } from '@/types/keyWord';
import {
  getAllMarkingPresets,
  saveMarkingPreset,
  deleteMarkingPreset,
  searchMarkingPresets,
  incrementMarkingPresetUsage,
} from '@/lib/db';

interface MarkingPresetState {
  presets: MarkingPreset[];
  selectedPreset: MarkingPreset | null;
  filterCategory: KeyWordCategory | 'all';
  searchQuery: string;
  isLoading: boolean;

  loadPresets: () => Promise<void>;
  addPreset: (preset: MarkingPreset) => Promise<void>;
  updatePreset: (preset: MarkingPreset) => Promise<void>;
  removePreset: (id: string) => Promise<void>;
  selectPreset: (preset: MarkingPreset | null) => void;
  setFilterCategory: (category: KeyWordCategory | 'all') => void;
  setSearchQuery: (query: string) => void;
  findMatchingPresets: (text: string) => Promise<MarkingPreset[]>;
  markPresetUsed: (id: string) => Promise<void>;
  getFilteredPresets: () => MarkingPreset[];
}

export const useMarkingPresetStore = create<MarkingPresetState>((set, get) => ({
  presets: [],
  selectedPreset: null,
  filterCategory: 'all',
  searchQuery: '',
  isLoading: false,

  loadPresets: async () => {
    set({ isLoading: true });
    try {
      const presets = await getAllMarkingPresets();
      // Normalize variants for backwards compatibility (convert string[] to Variant[])
      const normalizedPresets = presets.map(p => ({
        ...p,
        variants: normalizeVariants(p.variants || [])
      }));
      set({ presets: normalizedPresets, isLoading: false });
    } catch (error) {
      console.error('Failed to load marking presets:', error);
      set({ isLoading: false });
    }
  },

  addPreset: async (preset) => {
    try {
      await saveMarkingPreset(preset);
      await get().loadPresets();
    } catch (error) {
      console.error('Failed to add preset:', error);
      throw error;
    }
  },

  updatePreset: async (preset) => {
    try {
      const updated = { ...preset, updatedAt: new Date() };
      await saveMarkingPreset(updated);
      await get().loadPresets();
      const { selectedPreset } = get();
      if (selectedPreset?.id === preset.id) set({ selectedPreset: updated });
    } catch (error) {
      console.error('Failed to update preset:', error);
      throw error;
    }
  },

  removePreset: async (id) => {
    try {
      await deleteMarkingPreset(id);
      await get().loadPresets();
      const { selectedPreset } = get();
      if (selectedPreset?.id === id) set({ selectedPreset: null });
    } catch (error) {
      console.error('Failed to remove preset:', error);
      throw error;
    }
  },

  selectPreset: (preset) => set({ selectedPreset: preset }),

  setFilterCategory: (category) => set({ filterCategory: category }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  findMatchingPresets: async (text) => searchMarkingPresets(text),

  markPresetUsed: async (id) => {
    try {
      await incrementMarkingPresetUsage(id);
      await get().loadPresets();
    } catch (error) {
      console.error('Failed to mark preset as used:', error);
    }
  },

  getFilteredPresets: () => {
    const { presets, filterCategory, searchQuery } = get();
    let filtered = [...presets];

    // Filter by active study (if any)
    // Show: global keywords (no studyId) + keywords matching active study
    // When no study is active, show all keywords
    const activeStudyId = (window as Window & { __studyStore?: { getState?: () => { activeStudyId?: string } } }).__studyStore?.getState?.()?.activeStudyId;
    if (activeStudyId !== undefined) {
      // We need to access studyStore, but to avoid circular dependency, we'll filter in KeyWordManager
      // For now, keep all presets - filtering will happen in KeyWordManager component
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter((p) => p.category === filterCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.word?.toLowerCase().includes(q) ||
          (p.variants || []).some((v) => {
            const variantText = typeof v === 'string' ? v : v.text;
            return variantText.toLowerCase().includes(q);
          }) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    return filtered.sort((a, b) => {
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      return (a.word || '').localeCompare(b.word || '');
    });
  },
}));
