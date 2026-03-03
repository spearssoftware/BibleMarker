/**
 * Text Structure Store
 *
 * Manages text structures — user-created clause-indented layouts of Bible passages.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TextStructure, StructureLine } from '@/types';
import {
  getAllTextStructures as dbGetAll,
  saveTextStructure as dbSave,
  deleteTextStructure as dbDelete,
} from '@/lib/database';

interface TextStructureState {
  structures: TextStructure[];
  isStructureMode: boolean;
  activeStructureId: string | null;

  loadStructures: () => Promise<void>;
  getStructuresForChapter: (moduleId: string, book: string, chapter: number) => TextStructure[];
  createStructure: (params: {
    moduleId: string;
    book: string;
    chapter: number;
    startVerse: number;
    endVerse: number;
    lines: StructureLine[];
    studyId?: string;
  }) => Promise<TextStructure>;
  updateStructure: (structure: TextStructure) => Promise<void>;
  deleteStructure: (id: string) => Promise<void>;
  setStructureMode: (active: boolean) => void;
  setActiveStructure: (id: string | null) => void;
}

export const useTextStructureStore = create<TextStructureState>()(
  persist(
    (set, get) => ({
      structures: [],
      isStructureMode: false,
      activeStructureId: null,

      loadStructures: async () => {
        const structures = await dbGetAll();
        set({ structures });
      },

      getStructuresForChapter: (moduleId, book, chapter) => {
        const { structures } = get();
        return structures.filter(
          s => s.moduleId === moduleId && s.book === book && s.chapter === chapter
        );
      },

      createStructure: async ({ moduleId, book, chapter, startVerse, endVerse, lines, studyId }) => {
        const now = new Date();
        const structure: TextStructure = {
          id: crypto.randomUUID(),
          moduleId,
          book,
          chapter,
          startVerse,
          endVerse,
          lines,
          studyId,
          createdAt: now,
          updatedAt: now,
        };
        await dbSave(structure);
        set({ structures: [...get().structures, structure] });
        return structure;
      },

      updateStructure: async (structure) => {
        const updated: TextStructure = { ...structure, updatedAt: new Date() };
        await dbSave(updated);
        set({
          structures: get().structures.map(s => s.id === updated.id ? updated : s),
        });
      },

      deleteStructure: async (id) => {
        await dbDelete(id);
        set({ structures: get().structures.filter(s => s.id !== id) });
      },

      setStructureMode: (active) => set({ isStructureMode: active }),

      setActiveStructure: (id) => set({ activeStructureId: id }),
    }),
    {
      name: 'text-structure-store',
      partialize: (state) => ({ isStructureMode: state.isStructureMode }),
    }
  )
);
