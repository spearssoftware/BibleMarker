/**
 * @vitest-environment jsdom
 *
 * placeStore.autoPopulateFromChapter uses the effective study: reading in
 * Read must not re-assign a place to the selected study, and a key word that
 * belongs only to that study creates no place there.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Place } from '@/types';
import { makeMarkingPreset, makePlace, makeVerseRef } from '@/lib/__test__/factories';

const { db, presetState } = vi.hoisted(() => ({
  db: { places: [] as Place[] },
  presetState: { presets: [] as unknown[] },
}));

vi.mock('@/lib/database', () => ({
  getAllPlaces: vi.fn(async () => db.places.map(p => ({ ...p }))),
  savePlace: vi.fn(async (place: Place) => {
    db.places = [...db.places.filter(p => p.id !== place.id), place];
  }),
  deletePlace: vi.fn(async () => {}),
  getMarkingPreset: vi.fn(async () => undefined),
  getAllStudies: vi.fn(async () => []),
  saveStudy: vi.fn(async () => {}),
  deleteStudy: vi.fn(async () => {}),
}));
vi.mock('@/lib/bible-api', () => ({
  fetchChapter: vi.fn(async () => ({
    verses: [{ ref: { book: 'Gen', chapter: 1, verse: 1 }, text: 'In Eden the garden grew.' }],
  })),
}));
vi.mock('@/stores/markingPresetStore', () => ({
  useMarkingPresetStore: { getState: () => presetState },
}));

import { usePlaceStore } from '../placeStore';
import { useAppModeStore } from '../appModeStore';
import { useStudyStore } from '../studyStore';

const eden = (overrides: Parameters<typeof makeMarkingPreset>[0] = {}) =>
  makeMarkingPreset({ id: 'preset-eden', word: 'Eden', category: 'places', ...overrides });

describe('placeStore.autoPopulateFromChapter', () => {
  beforeEach(() => {
    db.places = [];
    presetState.presets = [];
    useStudyStore.setState({ activeStudyId: 'study-1' });
    useAppModeStore.setState({ mode: 'read' });
  });

  it('does not rewrite an existing place to the selected study while in Read', async () => {
    presetState.presets = [eden()];
    db.places = [makePlace({ id: 'place-eden', name: 'Eden', presetId: 'preset-eden', verseRef: makeVerseRef({ verse: 1 }) })];

    await usePlaceStore.getState().autoPopulateFromChapter('Gen', 1);

    expect(db.places).toHaveLength(1);
    expect(db.places[0].studyId).toBeUndefined();
  });

  it('rewrites a stale study in Study, as before', async () => {
    useAppModeStore.setState({ mode: 'study' });
    presetState.presets = [eden()];
    db.places = [makePlace({ id: 'place-eden', name: 'Eden', presetId: 'preset-eden', verseRef: makeVerseRef({ verse: 1 }) })];

    await usePlaceStore.getState().autoPopulateFromChapter('Gen', 1);

    expect(db.places[0].studyId).toBe('study-1');
  });

  it('creates no place from a key word that belongs only to the selected study while in Read', async () => {
    presetState.presets = [eden({ studyId: 'study-1' })];

    await usePlaceStore.getState().autoPopulateFromChapter('Gen', 1);

    expect(db.places).toHaveLength(0);
  });

  it('creates a place from that key word in Study, stamped with the study', async () => {
    useAppModeStore.setState({ mode: 'study' });
    presetState.presets = [eden({ studyId: 'study-1' })];

    await usePlaceStore.getState().autoPopulateFromChapter('Gen', 1);

    expect(db.places).toHaveLength(1);
    expect(db.places[0].studyId).toBe('study-1');
  });
});
