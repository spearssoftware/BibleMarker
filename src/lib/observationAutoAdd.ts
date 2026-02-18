/**
 * Auto-Add Helper Functions
 * 
 * Automatically add keywords to observation lists (Places, Time) when marked with appropriate symbols.
 */

import type { MarkingPreset } from '@/types/keyWord';
import type { Annotation } from '@/types/annotation';
import type { VerseRef } from '@/types/bible';
import { usePlaceStore } from '@/stores/placeStore';
import { useTimeStore } from '@/stores/timeStore';
import { usePeopleStore } from '@/stores/peopleStore';
import { useStudyStore } from '@/stores/studyStore';
import { getAnnotationText } from './annotationQueries';

/**
 * Automatically add a keyword to the Place tracker if it has 'places' category
 */
export async function autoAddToPlaceTracker(
  preset: MarkingPreset,
  annotation: Annotation,
  verseRef: VerseRef,
  notes?: string
): Promise<void> {
  // Check if preset has 'places' category
  if (preset.category !== 'places') return;

  const placeStore = usePlaceStore.getState();
  const activeStudyId = useStudyStore.getState().activeStudyId ?? undefined;
  
  // Check for existing place with same presetId and verseRef to avoid duplicates
  const existingPlaces = placeStore.places.filter(
    p => p.presetId === preset.id &&
         p.verseRef.book === verseRef.book &&
         p.verseRef.chapter === verseRef.chapter &&
         p.verseRef.verse === verseRef.verse
  );

  if (existingPlaces.length > 0) {
    // Already exists, skip
    return;
  }

  // Get place name from preset word or annotation text
  const placeName = preset.word || getAnnotationText(annotation) || 'Place';
  
  try {
    await placeStore.createPlace(
      placeName,
      verseRef,
      notes,
      preset.id,
      annotation.id,
      activeStudyId
    );
  } catch (error) {
    // Don't block annotation creation if auto-add fails
    console.error('[autoAddToPlaceTracker] Failed to add place:', error);
  }
}

/**
 * Automatically add a keyword to the Time tracker if it has 'time' category
 */
export async function autoAddToTimeTracker(
  preset: MarkingPreset,
  annotation: Annotation,
  verseRef: VerseRef,
  notes?: string
): Promise<void> {
  // Check if preset has 'time' category
  if (preset.category !== 'time') return;

  const timeStore = useTimeStore.getState();
  const activeStudyId = useStudyStore.getState().activeStudyId ?? undefined;
  
  // Check for existing time expression with same presetId and verseRef to avoid duplicates
  const existingTimeExpressions = timeStore.timeExpressions.filter(
    t => t.presetId === preset.id &&
         t.verseRef.book === verseRef.book &&
         t.verseRef.chapter === verseRef.chapter &&
         t.verseRef.verse === verseRef.verse
  );

  if (existingTimeExpressions.length > 0) {
    // Already exists, skip
    return;
  }

  // Get expression text from preset word or annotation text
  const expression = preset.word || getAnnotationText(annotation) || 'Time expression';
  
  try {
    await timeStore.createTimeExpression(
      expression,
      verseRef,
      notes,
      preset.id,
      annotation.id,
      undefined, // timeOrder - will be assigned if needed
      activeStudyId
    );
  } catch (error) {
    // Don't block annotation creation if auto-add fails
    console.error('[autoAddToTimeTracker] Failed to add time expression:', error);
  }
}

/**
 * Automatically add a keyword to the People tracker if it has 'people' category
 */
export async function autoAddToPeopleTracker(
  preset: MarkingPreset,
  annotation: Annotation,
  verseRef: VerseRef,
  notes?: string
): Promise<void> {
  if (preset.category !== 'people') return;

  const peopleStore = usePeopleStore.getState();
  const activeStudyId = useStudyStore.getState().activeStudyId ?? undefined;

  const existing = peopleStore.people.filter(
    p => p.presetId === preset.id &&
         p.verseRef.book === verseRef.book &&
         p.verseRef.chapter === verseRef.chapter &&
         p.verseRef.verse === verseRef.verse
  );
  if (existing.length > 0) return;

  const name = preset.word || getAnnotationText(annotation) || 'Person';
  try {
    await peopleStore.createPerson(name, verseRef, notes, preset.id, annotation.id, activeStudyId);
  } catch (error) {
    console.error('[autoAddToPeopleTracker] Failed to add person:', error);
  }
}

/**
 * Auto-add keyword to appropriate observation tracker based on category
 */
export async function autoAddToObservationTracker(
  preset: MarkingPreset,
  annotation: Annotation,
  verseRef: VerseRef,
  notes?: string
): Promise<void> {
  await Promise.all([
    autoAddToPlaceTracker(preset, annotation, verseRef, notes),
    autoAddToTimeTracker(preset, annotation, verseRef, notes),
    autoAddToPeopleTracker(preset, annotation, verseRef, notes),
  ]);
}
