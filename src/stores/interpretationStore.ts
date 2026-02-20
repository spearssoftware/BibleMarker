/**
 * Interpretation State Store
 * 
 * Manages interpretation worksheet entries.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InterpretationEntry } from '@/types';
import type { VerseRef } from '@/types';
import { getAllInterpretations as dbGetAllInterpretations, saveInterpretation as dbSaveInterpretation, deleteInterpretation as dbDeleteInterpretation } from '@/lib/database';
import { validateInterpretation, sanitizeData, ValidationError } from '@/lib/validation';

interface InterpretationState {
  // Interpretation entries (cached)
  interpretationEntries: InterpretationEntry[];
  
  // Actions
  loadInterpretations: () => Promise<void>;
  createInterpretation: (entry: Omit<InterpretationEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<InterpretationEntry>;
  updateInterpretation: (entry: InterpretationEntry) => Promise<void>;
  deleteInterpretation: (entryId: string) => Promise<void>;
  getInterpretationByVerse: (verseRef: VerseRef) => InterpretationEntry[];
  getInterpretationByChapter: (book: string, chapter: number) => InterpretationEntry[];
  getInterpretationByStudy: (studyId: string) => InterpretationEntry[];
}

export const useInterpretationStore = create<InterpretationState>()(
  persist(
    (set, get) => ({
      interpretationEntries: [],
      
      loadInterpretations: async () => {
        const entries = await dbGetAllInterpretations();
        set({ interpretationEntries: entries });
      },
      
      createInterpretation: async (entryData) => {
        const newEntry: InterpretationEntry = {
          id: crypto.randomUUID(),
          ...entryData,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        try {
          const validated = sanitizeData(newEntry, validateInterpretation);
          await dbSaveInterpretation(validated);
          
          const { interpretationEntries } = get();
          set({ 
            interpretationEntries: [...interpretationEntries, validated],
          });
          
          return validated;
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[createInterpretation] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid interpretation entry data: ${error.message}`);
          }
          throw error;
        }
      },
      
      updateInterpretation: async (entry) => {
        try {
          const updated = {
            ...entry,
            updatedAt: new Date(),
          };
          
          const validated = sanitizeData(updated, validateInterpretation);
          await dbSaveInterpretation(validated);
          
          const { interpretationEntries } = get();
          set({ 
            interpretationEntries: interpretationEntries.map(e => e.id === entry.id ? validated : e),
          });
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[updateInterpretation] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid interpretation entry data: ${error.message}`);
          }
          throw error;
        }
      },
      
      deleteInterpretation: async (entryId) => {
        await dbDeleteInterpretation(entryId);
        
        const { interpretationEntries } = get();
        set({ 
          interpretationEntries: interpretationEntries.filter(e => e.id !== entryId),
        });
      },
      
      getInterpretationByVerse: (verseRef) => {
        const { interpretationEntries } = get();
        return interpretationEntries.filter(e => {
          // Check if verse is within the range
          if (e.verseRef.book !== verseRef.book || e.verseRef.chapter !== verseRef.chapter) {
            return false;
          }
          
          const startVerse = e.verseRef.verse;
          const endVerse = e.endVerseRef?.verse || e.verseRef.verse;
          const targetVerse = verseRef.verse;
          
          return targetVerse >= startVerse && targetVerse <= endVerse;
        });
      },
      
      getInterpretationByChapter: (book, chapter) => {
        const { interpretationEntries } = get();
        return interpretationEntries.filter(e => 
          e.verseRef.book === book &&
          e.verseRef.chapter === chapter
        );
      },
      
      getInterpretationByStudy: (studyId) => {
        const { interpretationEntries } = get();
        return interpretationEntries.filter(e => e.studyId === studyId);
      },
    }),
    {
      name: 'interpretation-store',
      // Only persist the entries array, not the functions
      partialize: (_state) => ({}),
    }
  )
);
