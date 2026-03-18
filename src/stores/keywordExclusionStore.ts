/**
 * Keyword Exclusion Store
 *
 * Manages exclusion records that suppress specific auto-matched keywords in verses.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KeywordExclusion } from '@/types';
import {
  getAllKeywordExclusions,
  saveKeywordExclusion,
  deleteKeywordExclusion,
  deleteKeywordExclusionsByPreset,
} from '@/lib/database';

interface KeywordExclusionState {
  exclusions: KeywordExclusion[];
  loadExclusions: () => Promise<void>;
  addExclusion: (presetId: string, book: string, chapter: number, verse: number, matchedText: string, studyId?: string) => Promise<KeywordExclusion>;
  removeExclusion: (id: string) => Promise<void>;
  removeByPreset: (presetId: string) => Promise<void>;
}

export const useKeywordExclusionStore = create<KeywordExclusionState>()(
  persist(
    (set, get) => ({
      exclusions: [],

      loadExclusions: async () => {
        const all = await getAllKeywordExclusions();
        set({ exclusions: all });
      },

      addExclusion: async (presetId, book, chapter, verse, matchedText, studyId) => {
        // Check for existing exclusion with same key
        const { exclusions } = get();
        const normalizedText = matchedText.toLowerCase();
        const existing = exclusions.find(e =>
          e.presetId === presetId &&
          e.book === book &&
          e.chapter === chapter &&
          e.verse === verse &&
          e.matchedText === normalizedText
        );
        if (existing) return existing;

        const entry: KeywordExclusion = {
          id: crypto.randomUUID(),
          presetId,
          book,
          chapter,
          verse,
          matchedText: normalizedText,
          studyId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await saveKeywordExclusion(entry);
        set({ exclusions: [...get().exclusions, entry] });
        return entry;
      },

      removeExclusion: async (id) => {
        await deleteKeywordExclusion(id);
        set({ exclusions: get().exclusions.filter(e => e.id !== id) });
      },

      removeByPreset: async (presetId) => {
        await deleteKeywordExclusionsByPreset(presetId);
        set({ exclusions: get().exclusions.filter(e => e.presetId !== presetId) });
      },
    }),
    { name: 'keyword-exclusion-store', partialize: (_state) => ({}) }
  )
);
