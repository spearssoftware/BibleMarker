/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WorthNoticingCard } from '../WorthNoticingCard';
import { track } from '@/lib/telemetry';
import type { ChapterEntities, ChapterPerson, EntitySpread, PlaceSpread } from '@/types';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/discovery-config', () => ({ useDiscoveryConfig: () => ({ crossRefMinVotes: 20 }) }));

interface Query<T> { isLoading: boolean; error: string | null; data: T | null }
const ok = <T,>(data: T | null): Query<T> => ({ isLoading: false, error: null, data });

let people: Query<ChapterPerson[]>;
let entities: Query<ChapterEntities>;
let peopleSpread: Query<EntitySpread[]>;
let placesSpread: Query<PlaceSpread[]>;
let heavilyLinked: Query<ReadonlySet<string>>;
let capabilities: { peopleSpread: boolean; placesSpread: boolean; crossRefCounts: boolean };

vi.mock('@/hooks/useGnosis', () => ({
  useChapterPeople: () => ({ people: people.data, isLoading: people.isLoading, error: people.error }),
  useChapterEntities: () => ({ entities: entities.data, isLoading: entities.isLoading, error: entities.error }),
  usePeopleSpread: () => ({ spread: peopleSpread.data, isLoading: peopleSpread.isLoading, error: peopleSpread.error }),
  usePlacesSpread: () => ({ spread: placesSpread.data, isLoading: placesSpread.isLoading, error: placesSpread.error }),
  useHeavilyLinkedChapters: () => ({
    chapters: heavilyLinked.data,
    isLoading: heavilyLinked.isLoading,
    error: heavilyLinked.error,
  }),
  useGnosisCapabilities: () => capabilities,
}));

const BETHEL: PlaceSpread = {
  slug: 'bethel',
  name: 'Bethel',
  firstRef: 'Gen.12.8',
  firstNtRef: null,
  lastRef: 'Judg.20.31',
  books: ['Gen', 'Judg'],
};

const renderCard = () => render(<WorthNoticingCard book="Gen" chapter={12} translationId="sword-NASB" />);

describe('WorthNoticingCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    people = ok<ChapterPerson[]>([]);
    entities = ok<ChapterEntities>({ book: 'Gen', chapter: 12, people: [], places: ['bethel'], events: [], topics: [] });
    peopleSpread = ok<EntitySpread[]>(null);
    placesSpread = ok<PlaceSpread[]>([BETHEL]);
    heavilyLinked = ok<ReadonlySet<string>>(new Set(['Gen.12']));
    capabilities = { peopleSpread: true, placesSpread: true, crossRefCounts: true };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the facts in priority order under a Worth noticing title', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Worth noticing' })).toBeTruthy();
    const items = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(items).toEqual([
      'Bethel is named for the first time here.',
      'This chapter is one of the most cross-referenced in Scripture.',
    ]);
  });

  it('fires discovery_chip_shown once for worth_noticing', () => {
    renderCard();
    expect(track).toHaveBeenCalledWith('discovery_chip_shown', {
      feature: 'worth_noticing',
      dedupeKey: 'discovery_chip_shown:worth_noticing:Gen:12:sword-NASB',
    });
  });

  it('is hidden, and fires nothing, when no fact qualifies', () => {
    placesSpread = ok<PlaceSpread[]>([{ ...BETHEL, firstRef: 'Gen.11.1' }]);
    heavilyLinked = ok<ReadonlySet<string>>(new Set());
    const { container } = renderCard();
    expect(container.innerHTML).toBe('');
    expect(track).not.toHaveBeenCalled();
  });

  it.each<[string, () => void]>([
    ['people are loading', () => { people = { isLoading: true, error: null, data: null }; }],
    ['entities are loading', () => { entities = { isLoading: true, error: null, data: null }; }],
    ['the places spread has not arrived', () => { placesSpread = ok<PlaceSpread[]>(null); }],
    ['the heavily-linked set has not arrived', () => { heavilyLinked = ok<ReadonlySet<string>>(null); }],
  ])('is hidden while %s', (_label, arrange) => {
    arrange();
    const { container } = renderCard();
    expect(container.innerHTML).toBe('');
  });

  it('still shows the other kinds when the density query fails', () => {
    heavilyLinked = { isLoading: false, error: 'boom', data: null };
    renderCard();
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Bethel is named for the first time here.']);
  });

  it('still shows the density fact when the places spread fails', () => {
    placesSpread = { isLoading: false, error: 'boom', data: null };
    renderCard();
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'This chapter is one of the most cross-referenced in Scripture.',
    ]);
  });

  it('treats missing capabilities as no facts of that kind, not as loading', () => {
    capabilities = { peopleSpread: false, placesSpread: false, crossRefCounts: true };
    placesSpread = ok<PlaceSpread[]>(null);
    renderCard();
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'This chapter is one of the most cross-referenced in Scripture.',
    ]);
  });

  it('treats a chapter with no places as an empty places spread, not as loading', () => {
    entities = ok<ChapterEntities>({ book: 'Gen', chapter: 12, people: [], places: [], events: [], topics: [] });
    placesSpread = ok<PlaceSpread[]>(null);
    renderCard();
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'This chapter is one of the most cross-referenced in Scripture.',
    ]);
  });
});
