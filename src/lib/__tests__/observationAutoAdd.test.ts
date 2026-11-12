/**
 * @vitest-environment jsdom
 *
 * Auto-added places, people and time expressions are stamped with the
 * effective study: the selected study in Study mode, none in Read.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Annotation, MarkingPreset, VerseRef } from '@/types';

const { createPlace, createPerson, createTimeExpression, studyState } = vi.hoisted(() => ({
  createPlace: vi.fn(async () => ({})),
  createPerson: vi.fn(async () => ({})),
  createTimeExpression: vi.fn(async () => ({})),
  studyState: { activeStudyId: null as string | null },
}));

vi.mock('@/stores/placeStore', () => ({
  usePlaceStore: { getState: () => ({ places: [], createPlace }) },
}));
vi.mock('@/stores/peopleStore', () => ({
  usePeopleStore: { getState: () => ({ people: [], createPerson }) },
}));
vi.mock('@/stores/timeStore', () => ({
  useTimeStore: { getState: () => ({ timeExpressions: [], createTimeExpression }) },
}));
vi.mock('@/stores/studyStore', () => ({
  useStudyStore: { getState: () => studyState },
}));

import { autoAddToPlaceTracker, autoAddToPeopleTracker, autoAddToTimeTracker } from '../observationAutoAdd';
import { useAppModeStore } from '@/stores/appModeStore';

const verseRef: VerseRef = { book: 'John', chapter: 1, verse: 1 };
const annotation = { id: 'ann-1' } as Annotation;
const preset = (category: MarkingPreset['category']) =>
  ({ id: 'preset-1', word: 'Word', category }) as MarkingPreset;

describe('observationAutoAdd study stamping', () => {
  beforeEach(() => {
    createPlace.mockClear();
    createPerson.mockClear();
    createTimeExpression.mockClear();
    studyState.activeStudyId = 'study-1';
  });

  it.each([
    ['read', undefined],
    ['discover', undefined],
    ['study', 'study-1'],
  ] as const)('in %s stamps %s', async (mode, expected) => {
    useAppModeStore.setState({ mode });

    await autoAddToPlaceTracker(preset('places'), annotation, verseRef);
    await autoAddToPeopleTracker(preset('people'), annotation, verseRef);
    await autoAddToTimeTracker(preset('time'), annotation, verseRef);

    expect(createPlace).toHaveBeenCalledWith('Word', verseRef, undefined, 'preset-1', 'ann-1', expected);
    expect(createPerson).toHaveBeenCalledWith('Word', verseRef, undefined, 'preset-1', 'ann-1', expected);
    expect(createTimeExpression).toHaveBeenCalledWith('Word', verseRef, undefined, 'preset-1', 'ann-1', undefined, expected);
  });
});
