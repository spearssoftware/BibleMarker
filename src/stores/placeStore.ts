/**
 * Geographic Location State Store
 * 
 * Manages places and geographic locations - creating/editing places, etc.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Place } from '@/types/place';
import { db, getAllPlaces as dbGetAllPlaces, savePlace as dbSavePlace, deletePlace as dbDeletePlace, getMarkingPreset } from '@/lib/db';
import type { VerseRef } from '@/types/bible';
import { validatePlace, sanitizeData, ValidationError } from '@/lib/validation';
import { getAnnotationsBySymbolsWithPreset, getAnnotationText, getAnnotationVerseRef } from '@/lib/annotationQueries';
import { getSymbolsForTracker } from '@/lib/observationSymbols';

interface PlaceState {
  // Places (cached)
  places: Place[];
  
  // Actions
  loadPlaces: () => Promise<void>;
  createPlace: (name: string, verseRef: VerseRef, notes?: string, presetId?: string, annotationId?: string) => Promise<Place>;
  updatePlace: (place: Place) => Promise<void>;
  deletePlace: (placeId: string) => Promise<void>;
  getPlace: (placeId: string) => Place | null;
  getPlacesByVerse: (verseRef: VerseRef) => Place[];
  getPlacesByBook: (book: string) => Place[];
  autoImportFromAnnotations: () => Promise<number>; // Returns count of imported places
  autoPopulateFromChapter: (book: string, chapter: number, moduleId?: string) => Promise<number>; // Auto-populate places for keywords found in chapter
  removeDuplicates: () => Promise<number>; // Remove duplicate places, returns count removed
}

export const usePlaceStore = create<PlaceState>()(
  persist(
    (set, get) => ({
      places: [],
      
      loadPlaces: async () => {
        const allPlaces = await dbGetAllPlaces();
        set({ places: allPlaces });
      },
      
      createPlace: async (name, verseRef, notes, presetId, annotationId) => {
        // Check for duplicates from DATABASE (not in-memory state) to avoid race conditions
        const allPlaces = await dbGetAllPlaces();
        
        // Check for duplicates: same annotationId, or same presetId + verseRef, or same name + verseRef
        const existingPlace = allPlaces.find(p => {
          // Exact annotationId match
          if (annotationId && p.annotationId === annotationId) return true;
          // Same preset + verse
          if (presetId && p.presetId === presetId &&
              p.verseRef.book === verseRef.book &&
              p.verseRef.chapter === verseRef.chapter &&
              p.verseRef.verse === verseRef.verse) {
            return true;
          }
          // Same name + verse (catches manual duplicates)
          if (name.trim().toLowerCase() === p.name.trim().toLowerCase() &&
              p.verseRef.book === verseRef.book &&
              p.verseRef.chapter === verseRef.chapter &&
              p.verseRef.verse === verseRef.verse) {
            return true;
          }
          return false;
        });
        
        if (existingPlace) {
          // Return existing place instead of creating duplicate
          return existingPlace;
        }
        
        const newPlace: Place = {
          id: crypto.randomUUID(),
          name: name.trim(),
          verseRef,
          notes: notes?.trim() || undefined,
          presetId,
          annotationId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        try {
          const validated = sanitizeData(newPlace, validatePlace);
          await dbSavePlace(validated);
          
          set({ 
            places: [...allPlaces, validated],
          });
          
          return validated;
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[createPlace] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid place data: ${error.message}`);
          }
          throw error;
        }
      },
      
      updatePlace: async (place) => {
        try {
          const updated = {
            ...place,
            name: place.name.trim(),
            notes: place.notes?.trim() || undefined,
            updatedAt: new Date(),
          };
          
          const validated = sanitizeData(updated, validatePlace);
          await dbSavePlace(validated);
          
          const { places } = get();
          set({ 
            places: places.map(p => p.id === place.id ? validated : p),
          });
        } catch (error) {
          if (error instanceof ValidationError) {
            console.error('[updatePlace] Validation error:', error.message, error.field, error.value);
            throw new Error(`Invalid place data: ${error.message}`);
          }
          throw error;
        }
      },
      
      deletePlace: async (placeId) => {
        await dbDeletePlace(placeId);
        
        const { places } = get();
        set({ 
          places: places.filter(p => p.id !== placeId),
        });
      },
      
      getPlace: (placeId) => {
        const { places } = get();
        return places.find(p => p.id === placeId) || null;
      },
      
      getPlacesByVerse: (verseRef) => {
        const { places } = get();
        return places.filter(p => 
          p.verseRef.book === verseRef.book &&
          p.verseRef.chapter === verseRef.chapter &&
          p.verseRef.verse === verseRef.verse
        );
      },
      
      getPlacesByBook: (book) => {
        const { places } = get();
        return places.filter(p => p.verseRef.book === book);
      },
      
      autoImportFromAnnotations: async () => {
        // Get place symbols (mapPin, mountain, city)
        const placeSymbols = getSymbolsForTracker('place');
        
        // Query all annotations with place symbols that have presetId
        const annotations = await getAnnotationsBySymbolsWithPreset(placeSymbols);
        
        const { places } = get();
        const existingAnnotationIds = new Set(places.map(p => p.annotationId).filter((id): id is string => id !== undefined));
        
        let importedCount = 0;
        
        for (const annotation of annotations) {
          // Skip if annotation has no id (can't track for deduplication) or already imported
          if (!annotation.id || existingAnnotationIds.has(annotation.id)) {
            continue;
          }
          
          // Get the preset to use its word as the place name
          let placeName = getAnnotationText(annotation);
          if (annotation.presetId) {
            const preset = await getMarkingPreset(annotation.presetId);
            if (preset?.word) {
              placeName = preset.word;
            }
          }
          
          // If we still don't have a name, use a default
          if (!placeName.trim()) {
            placeName = 'Place';
          }
          
          // Check if a place with the same name and verse already exists
          const verseRef = getAnnotationVerseRef(annotation);
          const existingPlace = places.find(p => 
            p.name === placeName.trim() &&
            p.verseRef.book === verseRef.book &&
            p.verseRef.chapter === verseRef.chapter &&
            p.verseRef.verse === verseRef.verse
          );
          
          if (existingPlace) {
            // Update existing place to link to annotation if not already linked
            if (!existingPlace.annotationId && annotation.id) {
              await get().updatePlace({
                ...existingPlace,
                annotationId: annotation.id,
                presetId: annotation.presetId,
              });
            }
            continue;
          }
          
          // Create new place from annotation
          const newPlace: Place = {
            id: crypto.randomUUID(),
            name: placeName.trim(),
            verseRef,
            presetId: annotation.presetId,
            annotationId: annotation.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          try {
            const validated = sanitizeData(newPlace, validatePlace);
            await dbSavePlace(validated);
            set({ places: [...places, validated] });
            importedCount++;
          } catch (error) {
            console.error('[autoImportFromAnnotations] Failed to import place:', error);
          }
        }
        
        return importedCount;
      },

      autoPopulateFromChapter: async (book, chapter, moduleId) => {
        const { places, createPlace } = get();
        
        // Get cached chapter data
        const cacheKey = moduleId ? `${moduleId}:${book}:${chapter}` : undefined;
        const chapterCache = cacheKey 
          ? await db.chapterCache.get(cacheKey)
          : await db.chapterCache
              .where('[book+chapter]')
              .equals([book, chapter])
              .first();
        
        if (!chapterCache || !chapterCache.verses) {
          return 0;
        }
        
        // Get all keyword presets with 'places' category
        const { useMarkingPresetStore } = await import('@/stores/markingPresetStore');
        const { presets } = useMarkingPresetStore.getState();
        const placePresets = presets.filter(p => 
          p.word && 
          p.category === 'places' &&
          (p.highlight || p.symbol)
        );
        
        let totalAdded = 0;
        
        // For each verse in the chapter, find which place keywords appear
        for (const [verseNum, verseText] of Object.entries(chapterCache.verses)) {
          const text = verseText as string;
          const verseNumInt = parseInt(verseNum, 10);
          if (isNaN(verseNumInt) || verseNumInt <= 0) continue;
          
          const verseRef: VerseRef = {
            book,
            chapter,
            verse: verseNumInt,
          };
          
          // Find which place keywords appear in this verse
          for (const preset of placePresets) {
            // Check if preset applies to this verse (scope check)
            if (preset.bookScope && preset.bookScope !== book) continue;
            if (preset.chapterScope !== undefined && preset.chapterScope !== chapter) continue;
            if (preset.moduleScope && preset.moduleScope !== moduleId) continue;
            
            // Check if keyword appears in this verse
            const effectiveModuleId = chapterCache.moduleId || moduleId;
            const { findKeywordMatches } = await import('@/lib/keywordMatching');
            const matches = findKeywordMatches(text, verseRef, [preset], effectiveModuleId);
            if (matches.length === 0) continue;
            
            // Check if this place already exists for this preset+verse
            const existingPlace = places.find(p => 
              p.presetId === preset.id &&
              p.verseRef.book === verseRef.book &&
              p.verseRef.chapter === verseRef.chapter &&
              p.verseRef.verse === verseRef.verse
            );
            
            if (!existingPlace) {
              // Use preset word as place name
              const placeName = preset.word || 'Place';
              
              try {
                await createPlace(
                  placeName,
                  verseRef,
                  undefined, // notes - user can add later
                  preset.id,
                  undefined // annotationId - no specific annotation, just keyword match
                );
                totalAdded++;
              } catch (error) {
                console.error(`[autoPopulateFromChapter] Failed to add place "${placeName}":`, error);
              }
            }
          }
        }
        
        return totalAdded;
      },

      removeDuplicates: async () => {
        // Get all places from database
        const allPlaces = await dbGetAllPlaces();
        
        // Track seen items to identify duplicates
        // Key includes annotationId to avoid deleting entries linked to different annotations
        const seen = new Map<string, Place>();
        const duplicateIds: string[] = [];
        
        for (const place of allPlaces) {
          // Create a unique key based on name + verse + annotationId (case insensitive)
          // If annotationId exists, include it to preserve annotation-linked entries
          // This ensures places from different annotations with the same name/verse are kept
          const annotationPart = place.annotationId ? `:${place.annotationId}` : '';
          const key = `${place.name.toLowerCase().trim()}:${place.verseRef.book}:${place.verseRef.chapter}:${place.verseRef.verse}${annotationPart}`;
          
          if (seen.has(key)) {
            // This is a duplicate - mark for deletion
            duplicateIds.push(place.id);
          } else {
            seen.set(key, place);
          }
        }
        
        // Delete duplicates from database
        if (duplicateIds.length > 0) {
          await Promise.all(duplicateIds.map(id => dbDeletePlace(id)));
          
          // Reload from database to get clean state
          const cleaned = await dbGetAllPlaces();
          set({ places: cleaned });
        }
        
        return duplicateIds.length;
      },
    }),
    {
      name: 'place-store',
      partialize: (state) => ({ places: state.places }),
    }
  )
);
