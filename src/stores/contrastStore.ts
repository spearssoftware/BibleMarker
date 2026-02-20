/**
 * Contrast and Comparison State Store
 * 
 * Manages contrasts and comparisons - creating/editing contrasts, etc.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Contrast } from '@/types';
import { getAllContrasts as dbGetAllContrasts, saveContrast as dbSaveContrast, deleteContrast as dbDeleteContrast } from '@/lib/database';
import type { VerseRef } from '@/types';

interface ContrastState {
  // Contrasts (cached)
  contrasts: Contrast[];
  
  // Actions
  loadContrasts: () => Promise<void>;
  createContrast: (itemA: string, itemB: string, verseRef: VerseRef, notes?: string, presetId?: string, annotationId?: string) => Promise<Contrast>;
  updateContrast: (contrast: Contrast) => Promise<void>;
  deleteContrast: (contrastId: string) => Promise<void>;
  getContrast: (contrastId: string) => Contrast | null;
  getContrastsByVerse: (verseRef: VerseRef) => Contrast[];
  getContrastsByBook: (book: string) => Contrast[];
}

export const useContrastStore = create<ContrastState>()(
  persist(
    (set, get) => ({
      contrasts: [],
      
      loadContrasts: async () => {
        const allContrasts = await dbGetAllContrasts();
        set({ contrasts: allContrasts });
      },
      
      createContrast: async (itemA, itemB, verseRef, notes, presetId, annotationId) => {
        const newContrast: Contrast = {
          id: crypto.randomUUID(),
          itemA: itemA.trim(),
          itemB: itemB.trim(),
          verseRef,
          notes: notes?.trim() || undefined,
          presetId,
          annotationId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        await dbSaveContrast(newContrast);
        
        const { contrasts } = get();
        set({ 
          contrasts: [...contrasts, newContrast],
        });
        
        return newContrast;
      },
      
      updateContrast: async (contrast) => {
        const updated = {
          ...contrast,
          itemA: contrast.itemA.trim(),
          itemB: contrast.itemB.trim(),
          notes: contrast.notes?.trim() || undefined,
          updatedAt: new Date(),
        };
        
        await dbSaveContrast(updated);
        
        const { contrasts } = get();
        set({ 
          contrasts: contrasts.map(c => c.id === contrast.id ? updated : c),
        });
      },
      
      deleteContrast: async (contrastId) => {
        await dbDeleteContrast(contrastId);
        
        const { contrasts } = get();
        set({ 
          contrasts: contrasts.filter(c => c.id !== contrastId),
        });
      },
      
      getContrast: (contrastId) => {
        const { contrasts } = get();
        return contrasts.find(c => c.id === contrastId) || null;
      },
      
      getContrastsByVerse: (verseRef) => {
        const { contrasts } = get();
        return contrasts.filter(c => 
          c.verseRef.book === verseRef.book &&
          c.verseRef.chapter === verseRef.chapter &&
          c.verseRef.verse === verseRef.verse
        );
      },
      
      getContrastsByBook: (book) => {
        const { contrasts } = get();
        return contrasts.filter(c => c.verseRef.book === book);
      },
    }),
    {
      name: 'contrast-store',
      partialize: (_state) => ({}),
    }
  )
);
