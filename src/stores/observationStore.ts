/**
 * Observation State Store
 * 
 * Manages 5W+H worksheet entries and other observation tools.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FiveWAndHEntry } from '@/types/observation';
import type { VerseRef } from '@/types/bible';
import { getAllFiveWAndH as dbGetAllFiveWAndH, saveFiveWAndH as dbSaveFiveWAndH, deleteFiveWAndH as dbDeleteFiveWAndH } from '@/lib/db';
import { validateFiveWAndH, sanitizeData, ValidationError } from '@/lib/validation';

interface ObservationState {
  // 5W+H entries (cached)
  fiveWAndHEntries: FiveWAndHEntry[];
  
  // Actions
  loadFiveWAndH: () => Promise<void>;
  createFiveWAndH: (entry: Omit<FiveWAndHEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<FiveWAndHEntry>;
  updateFiveWAndH: (entry: FiveWAndHEntry) => Promise<void>;
  deleteFiveWAndH: (entryId: string) => Promise<void>;
  getFiveWAndHByVerse: (verseRef: VerseRef) => FiveWAndHEntry[];
  getFiveWAndHByChapter: (book: string, chapter: number) => FiveWAndHEntry[];
}

export const useObservationStore = create<ObservationState>()(
  persist(
    (set, get) => ({
      fiveWAndHEntries: [],
      
      loadFiveWAndH: async () => {
        const entries = await dbGetAllFiveWAndH();
        set({ fiveWAndHEntries: entries });
      },
      
      createFiveWAndH: async (entryData) => {
        const newEntry: FiveWAndHEntry = {
          id: crypto.randomUUID(),
          ...entryData,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        try {
          const validated = sanitizeData(newEntry, validateFiveWAndH);
          await dbSaveFiveWAndH(validated);
          
          const { fiveWAndHEntries } = get();
          set({ 
            fiveWAndHEntries: [...fiveWAndHEntries, validated],
          });
          
          return validated;
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[createFiveWAndH] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid 5W+H entry data: ${error.message}`);
          }
          throw error;
        }
      },
      
      updateFiveWAndH: async (entry) => {
        try {
          const updated = {
            ...entry,
            updatedAt: new Date(),
          };
          
          const validated = sanitizeData(updated, validateFiveWAndH);
          await dbSaveFiveWAndH(validated);
          
          const { fiveWAndHEntries } = get();
          set({ 
            fiveWAndHEntries: fiveWAndHEntries.map(e => e.id === entry.id ? validated : e),
          });
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[updateFiveWAndH] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid 5W+H entry data: ${error.message}`);
          }
          throw error;
        }
      },
      
      deleteFiveWAndH: async (entryId) => {
        await dbDeleteFiveWAndH(entryId);
        
        const { fiveWAndHEntries } = get();
        set({ 
          fiveWAndHEntries: fiveWAndHEntries.filter(e => e.id !== entryId),
        });
      },
      
      getFiveWAndHByVerse: (verseRef) => {
        const { fiveWAndHEntries } = get();
        return fiveWAndHEntries.filter(e => 
          e.verseRef.book === verseRef.book &&
          e.verseRef.chapter === verseRef.chapter &&
          e.verseRef.verse === verseRef.verse
        );
      },
      
      getFiveWAndHByChapter: (book, chapter) => {
        const { fiveWAndHEntries } = get();
        return fiveWAndHEntries.filter(e => 
          e.verseRef.book === book &&
          e.verseRef.chapter === chapter
        );
      },
    }),
    {
      name: 'observation-store',
      // Only persist the entries array, not the functions
      partialize: (state) => ({ fiveWAndHEntries: state.fiveWAndHEntries }),
    }
  )
);
