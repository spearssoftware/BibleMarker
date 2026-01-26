/**
 * Time Expression State Store
 * 
 * Manages time expressions - creating/editing time expressions, etc.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimeExpression } from '@/types/timeExpression';
import { db } from '@/lib/db';
import type { VerseRef } from '@/types/bible';
import { getBookById } from '@/types/bible';
import { getAnnotationsBySymbolsWithPreset, getAnnotationText, getAnnotationVerseRef } from '@/lib/annotationQueries';
import { getSymbolsForTracker } from '@/lib/observationSymbols';
import type { SymbolAnnotation } from '@/types/annotation';

interface TimeState {
  // Time expressions (cached)
  timeExpressions: TimeExpression[];
  
  // Actions
  loadTimeExpressions: () => Promise<void>;
  createTimeExpression: (expression: string, verseRef: VerseRef, notes?: string, presetId?: string, annotationId?: string, timeOrder?: number) => Promise<TimeExpression>;
  updateTimeExpression: (timeExpression: TimeExpression) => Promise<void>;
  deleteTimeExpression: (timeExpressionId: string) => Promise<void>;
  getTimeExpression: (timeExpressionId: string) => TimeExpression | null;
  getTimeExpressionsByVerse: (verseRef: VerseRef) => TimeExpression[];
  getTimeExpressionsByBook: (book: string) => TimeExpression[];
  autoImportFromAnnotations: () => Promise<number>; // Returns count of imported entries
}

export const useTimeStore = create<TimeState>()(
  persist(
    (set, get) => ({
      timeExpressions: [],
      
      loadTimeExpressions: async () => {
        const allTimeExpressions = await db.timeExpressions.toArray();
        set({ timeExpressions: allTimeExpressions });
      },
      
      createTimeExpression: async (expression, verseRef, notes, presetId, annotationId, timeOrder) => {
        const newTimeExpression: TimeExpression = {
          id: crypto.randomUUID(),
          expression: expression.trim(),
          verseRef,
          notes: notes?.trim() || undefined,
          presetId,
          annotationId,
          timeOrder,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        await db.timeExpressions.put(newTimeExpression);
        
        const { timeExpressions } = get();
        set({ 
          timeExpressions: [...timeExpressions, newTimeExpression],
        });
        
        return newTimeExpression;
      },
      
      updateTimeExpression: async (timeExpression) => {
        const updated = {
          ...timeExpression,
          expression: timeExpression.expression.trim(),
          notes: timeExpression.notes?.trim() || undefined,
          updatedAt: new Date(),
        };
        
        await db.timeExpressions.put(updated);
        
        const { timeExpressions } = get();
        set({ 
          timeExpressions: timeExpressions.map(t => t.id === timeExpression.id ? updated : t),
        });
      },
      
      deleteTimeExpression: async (timeExpressionId) => {
        await db.timeExpressions.delete(timeExpressionId);
        
        const { timeExpressions } = get();
        set({ 
          timeExpressions: timeExpressions.filter(t => t.id !== timeExpressionId),
        });
      },
      
      getTimeExpression: (timeExpressionId) => {
        const { timeExpressions } = get();
        return timeExpressions.find(t => t.id === timeExpressionId) || null;
      },
      
      getTimeExpressionsByVerse: (verseRef) => {
        const { timeExpressions } = get();
        return timeExpressions.filter(t => 
          t.verseRef.book === verseRef.book &&
          t.verseRef.chapter === verseRef.chapter &&
          t.verseRef.verse === verseRef.verse
        );
      },
      
      getTimeExpressionsByBook: (book) => {
        const { timeExpressions } = get();
        return timeExpressions.filter(t => t.verseRef.book === book);
      },
      
      autoImportFromAnnotations: async () => {
        // Get time symbols (clock, calendar, hourglass)
        const timeSymbols = getSymbolsForTracker('time');
        
        // Query all annotations with time symbols that have presetId
        const annotations = await getAnnotationsBySymbolsWithPreset(timeSymbols);
        
        // Get existing time expressions to avoid duplicates
        const existing = await db.timeExpressions.toArray();
        const existingAnnotationIds = new Set(
          existing
            .filter(t => t.annotationId)
            .map(t => t.annotationId!)
        );
        
        // Convert annotations to time expressions
        const newTimeExpressions: TimeExpression[] = [];
        
        for (const ann of annotations) {
          // Skip if already imported
          if (existingAnnotationIds.has(ann.id)) continue;
          
          // Get expression text from annotation
          const expression = getAnnotationText(ann) || 'Time expression';
          const verseRef = getAnnotationVerseRef(ann);
          
          // Create time expression entry
          const timeExpression: TimeExpression = {
            id: crypto.randomUUID(),
            expression: expression.trim() || 'Time expression',
            verseRef,
            presetId: ann.presetId,
            annotationId: ann.id,
            // timeOrder will be assigned after sorting
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          newTimeExpressions.push(timeExpression);
        }
        
        // Sort by verse reference (canonical order) before assigning timeOrder
        newTimeExpressions.sort((a, b) => {
          const bookA = getBookById(a.verseRef.book);
          const bookB = getBookById(b.verseRef.book);
          if (bookA && bookB && bookA.order !== bookB.order) return bookA.order - bookB.order;
          if (a.verseRef.chapter !== b.verseRef.chapter) return a.verseRef.chapter - b.verseRef.chapter;
          return a.verseRef.verse - b.verseRef.verse;
        });
        
        // Reassign timeOrder based on sorted order
        newTimeExpressions.forEach((te, index) => {
          te.timeOrder = index + 1;
        });
        
        // Save to database
        if (newTimeExpressions.length > 0) {
          await db.timeExpressions.bulkPut(newTimeExpressions);
          
          // Update store
          const { timeExpressions } = get();
          set({ 
            timeExpressions: [...timeExpressions, ...newTimeExpressions],
          });
        }
        
        return newTimeExpressions.length;
      },
    }),
    {
      name: 'time-store',
      partialize: (state) => ({ timeExpressions: state.timeExpressions }),
    }
  )
);
