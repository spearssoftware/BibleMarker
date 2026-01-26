/**
 * Conclusion Terms State Store
 * 
 * Manages conclusion terms - creating/editing conclusions, etc.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Conclusion } from '@/types/conclusion';
import { db } from '@/lib/db';
import type { VerseRef } from '@/types/bible';
import { getBookById } from '@/types/bible';
import { getAnnotationsBySymbolsWithPreset, getAnnotationText, getAnnotationVerseRef } from '@/lib/annotationQueries';
import { getSymbolsForTracker } from '@/lib/observationSymbols';

interface ConclusionState {
  // Conclusions (cached)
  conclusions: Conclusion[];
  
  // Actions
  loadConclusions: () => Promise<void>;
  createConclusion: (term: string, verseRef: VerseRef, notes?: string, presetId?: string, annotationId?: string, flowOrder?: number) => Promise<Conclusion>;
  updateConclusion: (conclusion: Conclusion) => Promise<void>;
  deleteConclusion: (conclusionId: string) => Promise<void>;
  getConclusion: (conclusionId: string) => Conclusion | null;
  getConclusionsByVerse: (verseRef: VerseRef) => Conclusion[];
  getConclusionsByBook: (book: string) => Conclusion[];
  autoImportFromAnnotations: () => Promise<number>; // Returns count of imported entries
}

export const useConclusionStore = create<ConclusionState>()(
  persist(
    (set, get) => ({
      conclusions: [],
      
      loadConclusions: async () => {
        const allConclusions = await db.conclusions.toArray();
        set({ conclusions: allConclusions });
      },
      
      createConclusion: async (term, verseRef, notes, presetId, annotationId, flowOrder) => {
        const newConclusion: Conclusion = {
          id: crypto.randomUUID(),
          term: term.trim(),
          verseRef,
          notes: notes?.trim() || undefined,
          presetId,
          annotationId,
          flowOrder,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        await db.conclusions.put(newConclusion);
        
        const { conclusions } = get();
        set({ 
          conclusions: [...conclusions, newConclusion],
        });
        
        return newConclusion;
      },
      
      updateConclusion: async (conclusion) => {
        const updated = {
          ...conclusion,
          term: conclusion.term.trim(),
          notes: conclusion.notes?.trim() || undefined,
          updatedAt: new Date(),
        };
        
        await db.conclusions.put(updated);
        
        const { conclusions } = get();
        set({ 
          conclusions: conclusions.map(c => c.id === conclusion.id ? updated : c),
        });
      },
      
      deleteConclusion: async (conclusionId) => {
        await db.conclusions.delete(conclusionId);
        
        const { conclusions } = get();
        set({ 
          conclusions: conclusions.filter(c => c.id !== conclusionId),
        });
      },
      
      getConclusion: (conclusionId) => {
        const { conclusions } = get();
        return conclusions.find(c => c.id === conclusionId) || null;
      },
      
      getConclusionsByVerse: (verseRef) => {
        const { conclusions } = get();
        return conclusions.filter(c => 
          c.verseRef.book === verseRef.book &&
          c.verseRef.chapter === verseRef.chapter &&
          c.verseRef.verse === verseRef.verse
        );
      },
      
      getConclusionsByBook: (book) => {
        const { conclusions } = get();
        return conclusions.filter(c => c.verseRef.book === book);
      },
      
      autoImportFromAnnotations: async () => {
        // Get conclusion symbols (arrowRight)
        const conclusionSymbols = getSymbolsForTracker('conclusion');
        
        // Query all annotations with conclusion symbols that have presetId
        const annotations = await getAnnotationsBySymbolsWithPreset(conclusionSymbols);
        
        // Get existing conclusions to avoid duplicates
        const existing = await db.conclusions.toArray();
        const existingAnnotationIds = new Set(
          existing
            .filter(c => c.annotationId)
            .map(c => c.annotationId!)
        );
        
        // Convert annotations to conclusions
        const newConclusions: Conclusion[] = [];
        
        for (const ann of annotations) {
          // Skip if already imported
          if (existingAnnotationIds.has(ann.id)) continue;
          
          // Get term text from annotation
          const term = getAnnotationText(ann) || 'Conclusion';
          const verseRef = getAnnotationVerseRef(ann);
          
          // Create conclusion entry
          const conclusion: Conclusion = {
            id: crypto.randomUUID(),
            term: term.trim() || 'Conclusion',
            verseRef,
            presetId: ann.presetId,
            annotationId: ann.id,
            // flowOrder will be assigned after sorting
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          newConclusions.push(conclusion);
        }
        
        // Sort by verse reference (canonical order) before assigning flowOrder
        newConclusions.sort((a, b) => {
          const bookA = getBookById(a.verseRef.book);
          const bookB = getBookById(b.verseRef.book);
          if (bookA && bookB && bookA.order !== bookB.order) return bookA.order - bookB.order;
          if (a.verseRef.chapter !== b.verseRef.chapter) return a.verseRef.chapter - b.verseRef.chapter;
          return a.verseRef.verse - b.verseRef.verse;
        });
        
        // Reassign flowOrder based on sorted order
        newConclusions.forEach((c, index) => {
          c.flowOrder = index + 1;
        });
        
        // Save to database
        if (newConclusions.length > 0) {
          await db.conclusions.bulkPut(newConclusions);
          
          // Update store
          const { conclusions } = get();
          set({ 
            conclusions: [...conclusions, ...newConclusions],
          });
        }
        
        return newConclusions.length;
      },
    }),
    {
      name: 'conclusion-store',
      partialize: (state) => ({ conclusions: state.conclusions }),
    }
  )
);
