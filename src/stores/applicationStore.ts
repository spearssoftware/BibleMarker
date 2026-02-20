/**
 * Application State Store
 * 
 * Manages application worksheet entries based on 2 Timothy 3:16-17.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ApplicationEntry } from '@/types/application';
import type { VerseRef } from '@/types/bible';
import { getAllApplications as dbGetAllApplications, saveApplication as dbSaveApplication, deleteApplication as dbDeleteApplication } from '@/lib/database';
import { validateApplication, sanitizeData, ValidationError } from '@/lib/validation';

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
        
        try {
          const validated = sanitizeData(newEntry, validateApplication);
          await dbSaveApplication(validated);
          
          const { applicationEntries } = get();
          set({ 
            applicationEntries: [...applicationEntries, validated],
          });
          
          return validated;
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[createApplication] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid application entry data: ${error.message}`);
          }
          throw error;
        }
      },
      
      updateApplication: async (entry) => {
        try {
          const updated = {
            ...entry,
            updatedAt: new Date(),
          };
          
          const validated = sanitizeData(updated, validateApplication);
          await dbSaveApplication(validated);
          
          const { applicationEntries } = get();
          set({ 
            applicationEntries: applicationEntries.map(e => e.id === entry.id ? validated : e),
          });
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[updateApplication] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid application entry data: ${error.message}`);
          }
          throw error;
        }
      },
      
      deleteApplication: async (entryId) => {
        await dbDeleteApplication(entryId);
        
        const { applicationEntries } = get();
        set({ 
          applicationEntries: applicationEntries.filter(e => e.id !== entryId),
        });
      },
      
      getApplicationsByVerse: (verseRef) => {
        const { applicationEntries } = get();
        return applicationEntries.filter(e => 
          e.verseRef.book === verseRef.book &&
          e.verseRef.chapter === verseRef.chapter &&
          e.verseRef.verse === verseRef.verse
        );
      },
      
      getApplicationsByChapter: (book, chapter) => {
        const { applicationEntries } = get();
        return applicationEntries.filter(e => 
          e.verseRef.book === book &&
          e.verseRef.chapter === chapter
        );
      },
    }),
    {
      name: 'application-store',
      // Only persist the entries array, not the functions
      partialize: (_state) => ({}),
    }
  )
);
