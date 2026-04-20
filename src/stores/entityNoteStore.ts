import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EntityNote, EntityNoteType } from '@/types';
import {
  getAllEntityNotes as dbGetAll,
  saveEntityNote as dbSave,
  deleteEntityNote as dbDelete,
} from '@/lib/database';

interface EntityNoteState {
  notes: EntityNote[];

  loadNotes: () => Promise<void>;
  getNotesForEntity: (entitySlug: string, studyId?: string) => EntityNote[];
  createNote: (params: {
    entityType: EntityNoteType;
    entitySlug: string;
    entityName: string;
    content: string;
    studyId?: string;
  }) => Promise<EntityNote>;
  updateNote: (note: EntityNote) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
}

export const useEntityNoteStore = create<EntityNoteState>()(
  persist(
    (set, get) => ({
      notes: [],

      loadNotes: async () => {
        const notes = await dbGetAll();
        set({ notes });
      },

      getNotesForEntity: (entitySlug, studyId) => {
        return get().notes.filter(
          (n) =>
            n.entitySlug === entitySlug &&
            (!studyId || n.studyId === studyId)
        );
      },

      createNote: async (params) => {
        const note: EntityNote = {
          id: crypto.randomUUID(),
          entityType: params.entityType,
          entitySlug: params.entitySlug,
          entityName: params.entityName,
          content: params.content,
          studyId: params.studyId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await dbSave(note);
        set({ notes: [...get().notes, note] });
        return note;
      },

      updateNote: async (note) => {
        const updated = { ...note, updatedAt: new Date() };
        await dbSave(updated);
        set({
          notes: get().notes.map((n) => (n.id === note.id ? updated : n)),
        });
      },

      deleteNote: async (id) => {
        await dbDelete(id);
        set({ notes: get().notes.filter((n) => n.id !== id) });
      },
    }),
    {
      name: 'entity-note-store',
      partialize: (_state) => ({}),
    }
  )
);
