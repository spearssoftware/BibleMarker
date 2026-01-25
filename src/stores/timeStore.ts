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

interface TimeState {
  // Time expressions (cached)
  timeExpressions: TimeExpression[];
  
  // Actions
  loadTimeExpressions: () => Promise<void>;
  createTimeExpression: (expression: string, verseRef: VerseRef, notes?: string, annotationId?: string) => Promise<TimeExpression>;
  updateTimeExpression: (timeExpression: TimeExpression) => Promise<void>;
  deleteTimeExpression: (timeExpressionId: string) => Promise<void>;
  getTimeExpression: (timeExpressionId: string) => TimeExpression | null;
  getTimeExpressionsByVerse: (verseRef: VerseRef) => TimeExpression[];
  getTimeExpressionsByBook: (book: string) => TimeExpression[];
}

export const useTimeStore = create<TimeState>()(
  persist(
    (set, get) => ({
      timeExpressions: [],
      
      loadTimeExpressions: async () => {
        const allTimeExpressions = await db.timeExpressions.toArray();
        set({ timeExpressions: allTimeExpressions });
      },
      
      createTimeExpression: async (expression, verseRef, notes, annotationId) => {
        const newTimeExpression: TimeExpression = {
          id: crypto.randomUUID(),
          expression: expression.trim(),
          verseRef,
          notes: notes?.trim() || undefined,
          annotationId,
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
    }),
    {
      name: 'time-store',
      partialize: (state) => ({ timeExpressions: state.timeExpressions }),
    }
  )
);
