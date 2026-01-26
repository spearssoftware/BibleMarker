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
          
          const { places } = get();
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
    }),
    {
      name: 'place-store',
      partialize: (state) => ({ places: state.places }),
    }
  )
);
