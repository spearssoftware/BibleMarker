/**
 * Time Expression State Store
 * 
 * Manages time expressions - creating/editing time expressions, etc.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimeExpression } from '@/types/timeExpression';
import { getAllTimeExpressions as dbGetAllTimeExpressions, saveTimeExpression as dbSaveTimeExpression, deleteTimeExpression as dbDeleteTimeExpression } from '@/lib/database';
import type { VerseRef } from '@/types/bible';
import { getBookById } from '@/types/bible';
import { getAnnotationsBySymbolsWithPreset, getAnnotationText, getAnnotationVerseRef } from '@/lib/annotationQueries';
import { getSymbolsForTracker } from '@/lib/observationSymbols';

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
  autoPopulateFromChapter: (book: string, chapter: number, moduleId?: string) => Promise<number>; // Auto-populate time expressions for keywords found in chapter
  removeDuplicates: () => Promise<number>; // Remove duplicate time expressions, returns count removed
}

export const useTimeStore = create<TimeState>()(
  persist(
    (set, get) => ({
      timeExpressions: [],
      
      loadTimeExpressions: async () => {
        const allTimeExpressions = await dbGetAllTimeExpressions();
        set({ timeExpressions: allTimeExpressions });
      },
      
      createTimeExpression: async (expression, verseRef, notes, presetId, annotationId, timeOrder) => {
        // Check for duplicates from DATABASE (not in-memory state) to avoid race conditions
        const allTimeExpressions = await dbGetAllTimeExpressions();
        
        // Check for duplicates: same annotationId, or same presetId + verseRef, or same expression + verseRef
        const existingTimeExpression = allTimeExpressions.find(t => {
          // Exact annotationId match
          if (annotationId && t.annotationId === annotationId) return true;
          // Same preset + verse
          if (presetId && t.presetId === presetId &&
              t.verseRef.book === verseRef.book &&
              t.verseRef.chapter === verseRef.chapter &&
              t.verseRef.verse === verseRef.verse) {
            return true;
          }
          // Same expression text + verse (catches manual duplicates)
          if (expression.trim().toLowerCase() === t.expression.trim().toLowerCase() &&
              t.verseRef.book === verseRef.book &&
              t.verseRef.chapter === verseRef.chapter &&
              t.verseRef.verse === verseRef.verse) {
            return true;
          }
          return false;
        });
        
        if (existingTimeExpression) {
          // Return existing time expression instead of creating duplicate
          return existingTimeExpression;
        }
        
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
        
        await dbSaveTimeExpression(newTimeExpression);
        
        set({ 
          timeExpressions: [...allTimeExpressions, newTimeExpression],
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
        
        await dbSaveTimeExpression(updated);
        
        const { timeExpressions } = get();
        set({ 
          timeExpressions: timeExpressions.map(t => t.id === timeExpression.id ? updated : t),
        });
      },
      
      deleteTimeExpression: async (timeExpressionId) => {
        await dbDeleteTimeExpression(timeExpressionId);
        
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
        const existing = await dbGetAllTimeExpressions();
        const existingAnnotationIds = new Set(
          existing
            .filter(t => t.annotationId)
            .map(t => t.annotationId!)
        );
        
        // Convert annotations to time expressions
        const newTimeExpressions: TimeExpression[] = [];
        
        for (const ann of annotations) {
          // Skip if already imported or annotation has no id
          if (!ann.id || existingAnnotationIds.has(ann.id)) continue;
          
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
          await Promise.all(newTimeExpressions.map(t => dbSaveTimeExpression(t)));
          
          // Update store
          const { timeExpressions } = get();
          set({ 
            timeExpressions: [...timeExpressions, ...newTimeExpressions],
          });
        }
        
        return newTimeExpressions.length;
      },

      autoPopulateFromChapter: async (book, chapter, moduleId) => {
        const { timeExpressions, createTimeExpression } = get();
        
        // Get cached chapter data
        const { getCachedChapter } = await import('@/lib/database');
        const chapterCache = await getCachedChapter(moduleId || '', book, chapter);
        
        if (!chapterCache || !chapterCache.verses) {
          return 0;
        }
        
        // Get all keyword presets with 'time' category
        const { useMarkingPresetStore } = await import('@/stores/markingPresetStore');
        const { presets } = useMarkingPresetStore.getState();
        const timePresets = presets.filter(p => 
          p.word && 
          p.category === 'time' &&
          (p.highlight || p.symbol)
        );
        
        // Import dependencies
        const { findKeywordMatches } = await import('@/lib/keywordMatching');
        const { getBookById } = await import('@/types/bible');
        
        let totalAdded = 0;
        const timeExpressionsForOrdering: Array<{ preset: typeof timePresets[0]; verseRef: VerseRef; expression: string }> = [];
        
        // For each verse in the chapter, find which time keywords appear
        for (const [verseNum, verseText] of Object.entries(chapterCache.verses)) {
          const text = verseText as string;
          const verseNumInt = parseInt(verseNum, 10);
          if (isNaN(verseNumInt) || verseNumInt <= 0) continue;
          
          const verseRef: VerseRef = {
            book,
            chapter,
            verse: verseNumInt,
          };
          
          // Find which time keywords appear in this verse
          for (const preset of timePresets) {
            // Check if preset applies to this verse (scope check)
            if (preset.bookScope && preset.bookScope !== book) continue;
            if (preset.chapterScope !== undefined && preset.chapterScope !== chapter) continue;
            if (preset.moduleScope && preset.moduleScope !== moduleId) continue;
            
            // Check if keyword appears in this verse
            const effectiveModuleId = moduleId;
            const matches = findKeywordMatches(text, verseRef, [preset], effectiveModuleId);
            if (matches.length === 0) continue;
            
            // Check if this time expression already exists for this preset+verse
            const existingTimeExpression = timeExpressions.find(t => 
              t.presetId === preset.id &&
              t.verseRef.book === verseRef.book &&
              t.verseRef.chapter === verseRef.chapter &&
              t.verseRef.verse === verseRef.verse
            );
            
            if (!existingTimeExpression) {
              // Use preset word as expression
              const expression = preset.word || 'Time expression';
              
              // Store for ordering later
              timeExpressionsForOrdering.push({ preset, verseRef, expression });
            }
          }
        }
        
        // Sort by verse reference (canonical order) before assigning timeOrder
        timeExpressionsForOrdering.sort((a, b) => {
          const bookA = getBookById(a.verseRef.book);
          const bookB = getBookById(b.verseRef.book);
          if (bookA && bookB && bookA.order !== bookB.order) return bookA.order - bookB.order;
          if (a.verseRef.chapter !== b.verseRef.chapter) return a.verseRef.chapter - b.verseRef.chapter;
          return a.verseRef.verse - b.verseRef.verse;
        });
        
        // Create time expressions with proper ordering
        for (let i = 0; i < timeExpressionsForOrdering.length; i++) {
          const { preset, verseRef, expression } = timeExpressionsForOrdering[i];
          try {
            await createTimeExpression(
              expression,
              verseRef,
              undefined, // notes - user can add later
              preset.id,
              undefined, // annotationId - no specific annotation, just keyword match
              i + 1 // timeOrder based on sorted order
            );
            totalAdded++;
          } catch (error) {
            console.error(`[autoPopulateFromChapter] Failed to add time expression "${expression}":`, error);
          }
        }
        
        return totalAdded;
      },

      removeDuplicates: async () => {
        // Get all time expressions from database
        const allTimeExpressions = await dbGetAllTimeExpressions();
        
        // Track seen items to identify duplicates
        // Key includes annotationId to avoid deleting entries linked to different annotations
        const seen = new Map<string, TimeExpression>();
        const duplicateIds: string[] = [];
        
        for (const te of allTimeExpressions) {
          // Create a unique key based on expression + verse + annotationId (case insensitive)
          // If annotationId exists, include it to preserve annotation-linked entries
          // This ensures time expressions from different annotations with the same text/verse are kept
          const annotationPart = te.annotationId ? `:${te.annotationId}` : '';
          const key = `${te.expression.toLowerCase().trim()}:${te.verseRef.book}:${te.verseRef.chapter}:${te.verseRef.verse}${annotationPart}`;
          
          if (seen.has(key)) {
            // This is a duplicate - mark for deletion
            duplicateIds.push(te.id);
          } else {
            seen.set(key, te);
          }
        }
        
        // Delete duplicates from database
        if (duplicateIds.length > 0) {
          await Promise.all(duplicateIds.map(id => dbDeleteTimeExpression(id)));
          
          // Reload from database to get clean state
          const cleaned = await dbGetAllTimeExpressions();
          set({ timeExpressions: cleaned });
        }
        
        return duplicateIds.length;
      },
    }),
    {
      name: 'time-store',
      partialize: (state) => ({ timeExpressions: state.timeExpressions }),
    }
  )
);
