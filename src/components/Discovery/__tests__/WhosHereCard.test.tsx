/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WhosHereCard } from '../WhosHereCard';
import { usePanelStore } from '@/stores/panelStore';
import { track } from '@/lib/telemetry';
import type { ChapterPerson, EntitySpread } from '@/types';

vi.mock('@/lib/database');
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const navigateToVerse = vi.fn();
vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: (selector: (s: { navigateToVerse: typeof navigateToVerse }) => unknown) => selector({ navigateToVerse }),
}));

interface PeopleResult { people: ChapterPerson[] | null; isLoading: boolean; error: string | null }
interface SpreadResult { spread: EntitySpread[] | null; isLoading: boolean; error: string | null }
let peopleResult: PeopleResult;
let spreadResult: SpreadResult;
vi.mock('@/hooks/useGnosis', () => ({
  useChapterPeople: () => peopleResult,
  usePeopleSpread: () => spreadResult,
}));

function person(slug: string, name: string, verses: number[]): ChapterPerson {
  return { slug, name, verses };
}

describe('WhosHereCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePanelStore.setState({ activePanel: null });
    peopleResult = {
      people: [person('god', 'God', [1, 2, 3]), person('abram', 'Abram', [1, 4, 6]), person('lot', 'Lot', [4])],
      isLoading: false,
      error: null,
    };
    spreadResult = {
      spread: [
        { slug: 'abram', firstRef: 'Gen.11.26', books: ['Gen'] },
        { slug: 'lot', firstRef: 'Gen.12.4', books: ['Gen', 'Exod'] },
      ],
      isLoading: false,
      error: null,
    };
  });
  afterEach(cleanup);

  it('excludes deity slugs and orders by verses named', () => {
    render(<WhosHereCard book="Gen" chapter={12} translationId="nasb" />);
    expect(screen.queryByText('God')).toBeNull();
    const names = screen.getAllByRole('button').map(b => b.textContent);
    expect(names[0]).toContain('Abram');
    expect(names[1]).toContain('Lot');
  });

  it('shows first appears vs first time, and verse counts with the singular form', () => {
    render(<WhosHereCard book="Gen" chapter={12} translationId="nasb" />);
    expect(screen.getByText('First appears in Genesis 11:26')).toBeTruthy();
    expect(screen.getByText('First time in Scripture')).toBeTruthy();
    expect(screen.getByText('Named in 3 verses here')).toBeTruthy();
    expect(screen.getByText('Named in 1 verse here')).toBeTruthy();
  });

  it('caps at 5 with +N more', () => {
    peopleResult = {
      people: Array.from({ length: 8 }, (_, i) => person(`p${i}`, `Person ${i}`, [i + 1])),
      isLoading: false,
      error: null,
    };
    spreadResult = { spread: null, isLoading: false, error: null };
    render(<WhosHereCard book="Gen" chapter={10} translationId="nasb" />);
    expect(screen.queryByText('Person 7')).toBeNull();
    fireEvent.click(screen.getByText('+3 more'));
    expect(screen.getByText('Person 7')).toBeTruthy();
  });

  it('expands inline with books, tappable verses and More in Reference (person)', () => {
    render(<WhosHereCard book="Gen" chapter={12} translationId="nasb" />);
    fireEvent.click(screen.getByRole('button', { name: /Lot/ }));
    expect(screen.getByText('Named in Genesis and Exodus')).toBeTruthy();
    fireEvent.click(screen.getByText('4'));
    expect(navigateToVerse).toHaveBeenCalledWith('Gen', 12, 4, true);
    fireEvent.click(screen.getByText('More in Reference'));
    const state = usePanelStore.getState();
    expect(state.activePanel).toBe('reference');
    expect(state.referenceEntitySlug).toBe('lot');
    expect(state.referenceEntityType).toBe('person');
  });

  it('words the books line for 1, 3 and many books', () => {
    const books = (n: number) => ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh'].slice(0, n);
    const cases: [number, string][] = [
      [1, 'Named in Genesis'],
      [3, 'Named in Genesis, Exodus, and Leviticus'],
      [6, 'Named in Genesis, Exodus, and 4 other books'],
    ];
    for (const [n, text] of cases) {
      spreadResult = { spread: [{ slug: 'abram', firstRef: 'Gen.11.26', books: books(n) }], isLoading: false, error: null };
      render(<WhosHereCard book="Gen" chapter={12} translationId="nasb" />);
      fireEvent.click(screen.getByRole('button', { name: /Abram/ }));
      expect(screen.getByText(text)).toBeTruthy();
      cleanup();
    }
  });

  it('hides while loading, on error, for a null capability, or when only deity is named', () => {
    const cases: PeopleResult[] = [
      { people: null, isLoading: true, error: null },
      { people: [person('abram', 'Abram', [1])], isLoading: false, error: 'boom' },
      { people: null, isLoading: false, error: null },
      { people: [person('god', 'God', [1])], isLoading: false, error: null },
    ];
    for (const result of cases) {
      peopleResult = result;
      const { container } = render(<WhosHereCard book="Gen" chapter={12} translationId="nasb" />);
      expect(container.textContent).toBe('');
      cleanup();
    }
    expect(track).not.toHaveBeenCalled();
  });

  it('still renders rows when the spread is missing', () => {
    spreadResult = { spread: null, isLoading: false, error: null };
    render(<WhosHereCard book="Gen" chapter={12} translationId="nasb" />);
    expect(screen.getByText('Abram')).toBeTruthy();
    expect(screen.queryByText(/First appears/)).toBeNull();
  });

  it('fires entity shown and tapped with per-chapter dedupe keys', () => {
    const { rerender } = render(<WhosHereCard book="Gen" chapter={12} translationId="nasb" />);
    rerender(<WhosHereCard book="Gen" chapter={12} translationId="nasb" />);
    fireEvent.click(screen.getByRole('button', { name: /Abram/ }));
    fireEvent.click(screen.getByRole('button', { name: /Lot/ }));
    const calls = vi.mocked(track).mock.calls;
    expect(calls).toContainEqual(['discovery_chip_shown', { feature: 'entity', dedupeKey: 'discovery_chip_shown:entity:Gen:12:nasb' }]);
    expect(calls).toContainEqual(['discovery_chip_tapped', { feature: 'entity', dedupeKey: 'discovery_chip_tapped:entity:Gen:12:nasb' }]);
  });
});
