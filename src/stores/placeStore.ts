/**
 * Geographic Location State Store
 * 
 * Manages places and geographic locations - creating/editing places, etc.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Place } from '@/types/place';
import { db } from '@/lib/db';
import type { VerseRef } from '@/types/bible';
import { validatePlace, sanitizeData, ValidationError } from '@/lib/validation';
import { getAnnotationsBySymbolsWithPreset, getAnnotationText, getAnnotationVerseRef } from '@/lib/annotationQueries';
import { getSymbolsForTracker } from '@/lib/observationSymbols';
import { getMarkingPreset } from '@/lib/db';

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
}

export const usePlaceStore = create<PlaceState>()(
  persist(
    (set, get) => ({
      places: [],
      
      loadPlaces: async () => {
        const allPlaces = await db.places.toArray();
        set({ places: allPlaces });
      },
      
      createPlace: async (name, verseRef, notes, presetId, annotationId) => {
        const { places } = get();
        
        // Check for duplicates: same presetId + verseRef, or same annotationId
        const existingPlace = places.find(p => {
          if (annotationId && p.annotationId === annotationId) return true;
          if (presetId && p.presetId === presetId &&
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
          await db.places.put(validated);
          
          set({ 
            places: [...places, validated],
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
          await db.places.put(validated);
          
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
        await db.places.delete(placeId);
        
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
          // Skip if we already have a place for this annotation
          if (annotation.id && existingAnnotationIds.has(annotation.id)) {
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
            await db.places.put(validated);
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
    }),
    {
      name: 'place-store',
      partialize: (state) => ({ places: state.places }),
    }
  )
);
