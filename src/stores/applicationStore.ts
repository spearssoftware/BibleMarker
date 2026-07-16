/**
 * Application State Store
 * 
 * Manages application worksheet entries based on 2 Timothy 3:16-17.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ApplicationEntry } from '@/types';
import type { VerseRef } from '@/types';
import { getAllApplications as dbGetAllApplications, saveApplication as dbSaveApplication, deleteApplication as dbDeleteApplication } from '@/lib/database';
import { validateApplication } from '@/lib/validation';
import { saveValidated, filterByExactVerse, filterByChapter } from './entityStoreHelpers';

interface ApplicationState {
  // Application entries (cached)
  applicationEntries: ApplicationEntry[];
  
  // Actions
  loadApplications: () => Promise<void>;
  createApplication: (entry: Omit<ApplicationEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ApplicationEntry>;
  updateApplication: (entry: ApplicationEntry) => Promise<void>;
  deleteApplication: (entryId: string) => Promise<void>;
  getApplicationsByVerse: (verseRef: VerseRef) => ApplicationEntry[];
  getApplicationsByChapter: (book: string, chapter: number) => ApplicationEntry[];
}

export const useApplicationStore = create<ApplicationState>()(
  persist(
    (set, get) => ({
      applicationEntries: [],
      
      loadApplications: async () => {
        const entries = await dbGetAllApplications();
        set({ applicationEntries: entries });
      },
      
      createApplication: async (entryData) => {
        const newEntry: ApplicationEntry = {
          id: crypto.randomUUID(),
          ...entryData,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const validated = await saveValidated(newEntry, validateApplication, dbSaveApplication, {
          logPrefix: 'createApplication',
          dataLabel: 'application entry',
        });
        set({ applicationEntries: [...get().applicationEntries, validated] });
        return validated;
      },

      updateApplication: async (entry) => {
        const validated = await saveValidated({ ...entry, updatedAt: new Date() }, validateApplication, dbSaveApplication, {
          logPrefix: 'updateApplication',
          dataLabel: 'application entry',
        });
        set({ applicationEntries: get().applicationEntries.map(e => e.id === entry.id ? validated : e) });
      },

      deleteApplication: async (entryId) => {
        await dbDeleteApplication(entryId);

        const { applicationEntries } = get();
        set({
          applicationEntries: applicationEntries.filter(e => e.id !== entryId),
        });
      },

      getApplicationsByVerse: (verseRef) => filterByExactVerse(get().applicationEntries, verseRef),

      getApplicationsByChapter: (book, chapter) => filterByChapter(get().applicationEntries, book, chapter),
    }),
    {
      name: 'application-store',
      // Only persist the entries array, not the functions
      partialize: (_state) => ({}),
    }
  )
);
