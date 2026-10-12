/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SettingSection } from '../SettingSection';
import { introFor, orientationFor, questionFor } from '@/lib/chapterAnalysis';
import { track } from '@/lib/telemetry';
import type { ChapterEntities, ChapterEvent, ChapterPlace } from '@/types';

vi.mock('@/lib/database');
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('../ChapterMap', () => ({
  ChapterMap: ({ places, onMarkerTap, onOpenFullMap }: { places: ChapterPlace[]; onMarkerTap?: () => void; onOpenFullMap?: () => void }) => (
    <div data-testid="chapter-map">
      <button onClick={onMarkerTap}>marker</button>
      <button onClick={onOpenFullMap}>Open full map ({places.length})</button>
    </div>
  ),
}));
vi.mock('../ChapterMapModal', () => ({
  ChapterMapModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="map-modal" /> : null),
}));

interface Result<T> { isLoading: boolean; error: string | null; data: T }
const ok = <T,>(data: T): Result<T> => ({ isLoading: false, error: null, data });
let entitiesResult: Result<ChapterEntities | null>;
let eventsResult: Result<ChapterEvent[] | null>;
let yearResult: Result<{ year: number; yearDisplay: string } | null>;
let placesResult: Result<ChapterPlace[] | null>;

vi.mock('@/hooks/useGnosis', () => ({
  useChapterEntities: () => ({ entities: entitiesResult.data, isLoading: entitiesResult.isLoading, error: entitiesResult.error }),
  useChapterEvents: () => ({ events: eventsResult.data, isLoading: eventsResult.isLoading, error: eventsResult.error }),
  useChapterYear: () => ({ year: yearResult.data, isLoading: yearResult.isLoading, error: yearResult.error }),
  useChapterPlaces: () => ({ places: placesResult.data, isLoading: placesResult.isLoading, error: placesResult.error }),
}));

const entities: ChapterEntities = {
  book: 'Gen', chapter: 12, people: ['god', 'abram', 'sarai'], places: ['haran', 'shechem'], events: [], topics: [],
};
const events: ChapterEvent[] = [
  { slug: 'call-of-abram', title: 'The call of Abram', startYearDisplay: '1921 BC', sortKey: 1, participants: [], verses: [1] },
];
const places: ChapterPlace[] = [{ slug: 'haran', name: 'Haran', latitude: 1, longitude: 2, verses: [4] }];

function renderSetting(book = 'Gen', chapter = 12) {
  return render(<SettingSection book={book} chapter={chapter} translationId="nasb" />);
}

describe('SettingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitiesResult = ok(entities);
    eventsResult = ok(events);
    yearResult = ok({ year: -1920, yearDisplay: '1921 BC' });
    placesResult = ok(places);
  });
  afterEach(cleanup);

  it('shows the full intro on chapter 1', () => {
    renderSetting('Phil', 1);
    expect(screen.getByText(introFor('Phil')!)).toBeTruthy();
    expect(screen.queryByText('About Philippians')).toBeNull();
  });

  it('collapses the intro behind About <Book> on other chapters and expands it on tap', () => {
    renderSetting('Phil', 2);
    expect(screen.queryByText(introFor('Phil')!)).toBeNull();
    const toggle = screen.getByRole('button', { name: 'About Philippians' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(introFor('Phil')!)).toBeTruthy();
    expect(track).toHaveBeenCalledWith('discovery_chip_tapped', {
      feature: 'setting',
      dedupeKey: 'discovery_chip_tapped:setting:Phil:2:nasb',
    });
  });

  it('renders the genre label, orientation and question', () => {
    renderSetting('Heb', 3);
    expect(screen.getByText('Hebrews — a letter')).toBeTruthy();
    expect(screen.getByText(orientationFor('Heb')!)).toBeTruthy();
    expect(screen.getByText(questionFor('Heb', 3)!)).toBeTruthy();
  });

  it('builds the chapter line from year, people (minus deity), places and first event', () => {
    renderSetting();
    expect(screen.getByText('About 1921 BC · 2 people · 2 places · The call of Abram')).toBeTruthy();
  });

  it('excludes foretold people from the count in OT chapters only', () => {
    entitiesResult = ok({ ...entities, people: ['jesus-son-of-joseph', 'david'], places: [] });
    eventsResult = ok([]);
    yearResult = ok(null);
    renderSetting('Ps', 2);
    expect(screen.getByText('1 person')).toBeTruthy();
    cleanup();
    renderSetting('Matt', 1);
    expect(screen.getByText('2 people')).toBeTruthy();
  });

  it('omits the year for Genesis 1-11', () => {
    renderSetting('Gen', 6);
    expect(screen.getByText('2 people · 2 places · The call of Abram')).toBeTruthy();
  });

  it('omits pieces without data and hides the line when none have data', () => {
    yearResult = ok(null);
    eventsResult = ok([]);
    entitiesResult = ok({ ...entities, places: [] });
    renderSetting();
    expect(screen.getByText('2 people')).toBeTruthy();
    cleanup();

    entitiesResult = ok(null);
    placesResult = ok(null);
    renderSetting();
    expect(screen.queryByText(/^\d+ (person|people|place)/)).toBeNull();
    expect(screen.queryByTestId('chapter-map')).toBeNull();
  });

  it('renders the map and fires map telemetry, and opens the full map', () => {
    renderSetting();
    expect(screen.getByTestId('chapter-map')).toBeTruthy();
    fireEvent.click(screen.getByText('marker'));
    fireEvent.click(screen.getByText(/Open full map/));
    expect(screen.getByTestId('map-modal')).toBeTruthy();
    const calls = vi.mocked(track).mock.calls;
    expect(calls).toContainEqual(['discovery_chip_shown', { feature: 'setting_map', dedupeKey: 'discovery_chip_shown:setting_map:Gen:12:nasb' }]);
    expect(calls).toContainEqual(['discovery_chip_tapped', { feature: 'setting_map', dedupeKey: 'discovery_chip_tapped:setting_map:Gen:12:nasb' }]);
  });

  it('shows the era strip and event list, and fires shown telemetry for setting and timeline', () => {
    renderSetting();
    expect(screen.getByTestId('era-strip')).toBeTruthy();
    expect(screen.getByRole('button', { name: /The call of Abram/ })).toBeTruthy();
    const features = vi.mocked(track).mock.calls.filter(c => c[0] === 'discovery_chip_shown').map(c => c[1]?.feature);
    expect(features).toContain('setting');
    expect(features.filter(f => f === 'setting_timeline')).toHaveLength(1);
  });

  it('fires timeline shown from the event list alone, and not when neither strip nor events show', () => {
    yearResult = ok(null);
    renderSetting('Ps', 23);
    expect(vi.mocked(track).mock.calls.some(c => c[1]?.feature === 'setting_timeline')).toBe(true);
    cleanup();
    vi.clearAllMocks();
    eventsResult = ok([]);
    renderSetting('Ps', 23);
    expect(vi.mocked(track).mock.calls.some(c => c[1]?.feature === 'setting_timeline')).toBe(false);
  });

  it('hides the era strip for Genesis 1-11 while the year is loading', () => {
    yearResult = { isLoading: true, error: null, data: null };
    renderSetting('Gen', 3);
    expect(screen.queryByTestId('era-strip')).toBeNull();
  });

  it('hides every Gnosis piece while loading, on error or for a null capability, but keeps intro and genre', () => {
    const loading = { isLoading: true, error: null, data: null };
    const failed = { isLoading: false, error: 'boom', data: null };
    for (const state of [loading, failed, ok(null)]) {
      entitiesResult = state;
      eventsResult = state;
      yearResult = state;
      placesResult = state;
      renderSetting('Phil', 1);
      expect(screen.getByText(introFor('Phil')!)).toBeTruthy();
      expect(screen.getByText('Philippians — a letter')).toBeTruthy();
      expect(screen.queryByTestId('chapter-map')).toBeNull();
      expect(screen.queryByTestId('era-strip')).toBeNull();
      expect(screen.queryByText(/^\d+ (person|people|place)/)).toBeNull();
      cleanup();
    }
  });
});
