/**
 * @vitest-environment jsdom
 *
 * Repetition Radar must never leak `RepetitionResult.token` into the DOM —
 * the hint ladder (count → category hint, skipped when Gnosis has no
 * matching entity → verse range → first-occurrence verse) is deliberately
 * Socratic. Hints are store-backed (`discoveryStore.revealedHints`) so they
 * persist across the card unmounting/remounting (panel close/reopen).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RepetitionCard } from '../RepetitionCard';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import type { RepetitionResult } from '@/lib/chapterAnalysis';
import type { ChapterEntities } from '@/types';

vi.mock('@/lib/database', () => ({
  updatePreferences: vi.fn(async () => {}),
  getPreferences: vi.fn(async () => ({})),
}));

vi.mock('@/stores/studyStore', () => ({
  useStudyStore: (selector: (s: { activeStudyId: string | null }) => unknown) =>
    selector({ activeStudyId: null }),
}));

const { markRepetitionAsKeywordMock } = vi.hoisted(() => ({
  markRepetitionAsKeywordMock: vi.fn(async () => ({ id: 'preset-1' })),
}));
vi.mock('@/lib/discoveryActions', () => ({
  markRepetitionAsKeyword: markRepetitionAsKeywordMock,
}));

const repetition: RepetitionResult = {
  token: 'zephyr',
  count: 7,
  firstVerse: 2,
  lastVerse: 9,
  occurrences: [],
  forms: ['zephyr', 'zephyrs'],
};

const noEntities: ChapterEntities | null = null;

function renderCard(overrides: Partial<Parameters<typeof RepetitionCard>[0]> = {}) {
  return render(
    <RepetitionCard
      repetition={repetition}
      translationCount={1}
      primaryTranslationAbbrev={null}
      book="John"
      chapter={1}
      translationId="sword-NASB"
      entities={noEntities}
      {...overrides}
    />
  );
}

describe('RepetitionCard', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({
      found: null,
      revealedHints: 0,
      markedPresetId: null,
    });
    usePreferencesStore.setState({ inductiveToolsEnabled: false, isHydrated: true });
    markRepetitionAsKeywordMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('advances the hint ladder and skips the category rung when there is no hint, never rendering the token', () => {
    const { container } = renderCard();

    expect(screen.getByText('One word appears 7× in this chapter')).toBeTruthy();
    expect(container.innerHTML.toLowerCase()).not.toContain('zephyr');

    const hintButton = screen.getByText('Need a hint?');
    fireEvent.click(hintButton);
    expect(screen.getByText('Look between v.2 and v.9.')).toBeTruthy();
    expect(screen.queryByText(/name for/)).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain('zephyr');

    fireEvent.click(screen.getByText('Need a hint?'));
    expect(screen.getByText('It first shows up in v.2.')).toBeTruthy();
    expect(screen.getByText('Look between v.2 and v.9.')).toBeTruthy();
    expect(screen.queryByText('Need a hint?')).toBeNull();
    expect(screen.getByText("That's all the hints — keep looking.")).toBeTruthy();
    expect(container.innerHTML.toLowerCase()).not.toContain('zephyr');
  });

  it('shows the category hint rung first when Gnosis has a matching entity, never rendering the token', () => {
    const entities: ChapterEntities = { book: 'John', chapter: 1, people: ['zephyr'], places: [], events: [], topics: [] };
    const { container } = renderCard({ entities });

    fireEvent.click(screen.getByText('Need a hint?'));
    expect(screen.getByText("It's a name for someone.")).toBeTruthy();
    expect(container.innerHTML.toLowerCase()).not.toContain('zephyr');

    fireEvent.click(screen.getByText('Need a hint?'));
    expect(screen.getByText('Look between v.2 and v.9.')).toBeTruthy();

    fireEvent.click(screen.getByText('Need a hint?'));
    expect(screen.getByText('It first shows up in v.2.')).toBeTruthy();
    expect(screen.queryByText('Need a hint?')).toBeNull();
  });

  it('revealed hints persist across unmount and remount (store-backed)', () => {
    const { unmount } = renderCard();
    fireEvent.click(screen.getByText('Need a hint?'));
    expect(screen.getByText('Look between v.2 and v.9.')).toBeTruthy();
    unmount();

    renderCard();
    expect(screen.getByText('Look between v.2 and v.9.')).toBeTruthy();
  });

  it('renders the found state from a seeded found.selection, never rendering the token', () => {
    useDiscoveryStore.setState({
      found: {
        book: 'John',
        chapter: 1,
        translationId: 'sword-NASB',
        selection: { moduleId: 'sword-NASB', book: 'John', chapter: 1, startVerse: 3, endVerse: 3, text: 'Zephyrs' },
      },
    });

    renderCard();
    expect(screen.getByText('Zephyrs')).toBeTruthy();
    expect(screen.getByText('Highlight it in this chapter')).toBeTruthy();
  });

  it('shows "Mark it as a key word" with the toolkit on and marks then disables the button', async () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true, isHydrated: true });
    useDiscoveryStore.setState({
      found: {
        book: 'John',
        chapter: 1,
        translationId: 'sword-NASB',
        selection: { moduleId: 'sword-NASB', book: 'John', chapter: 1, startVerse: 3, endVerse: 3, text: 'Zephyrs' },
      },
    });

    renderCard();
    const button = screen.getByText('Mark it as a key word');
    fireEvent.click(button);

    await vi.waitFor(() => expect(markRepetitionAsKeywordMock).toHaveBeenCalled());
    await vi.waitFor(() => expect(screen.getByText('Highlighted ✓')).toBeTruthy());
    expect((screen.getByText('Highlighted ✓') as HTMLButtonElement).disabled).toBe(true);
  });
});
