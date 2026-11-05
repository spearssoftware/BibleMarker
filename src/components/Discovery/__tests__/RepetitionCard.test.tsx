/**
 * @vitest-environment jsdom
 *
 * The repetition card names the chapter's most-repeated word and offers to
 * mark it; an existing key word that already covers the word replaces the
 * offer with a note.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RepetitionCard } from '../RepetitionCard';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useToastStore } from '@/stores/toastStore';
import { makeMarkingPreset } from '@/lib/__test__/factories';
import type { RepetitionResult } from '@/lib/chapterAnalysis';

vi.mock('@/lib/database', () => ({
  updatePreferences: vi.fn(async () => {}),
  getPreferences: vi.fn(async () => ({})),
}));

vi.mock('@/stores/studyStore', () => ({
  useStudyStore: (selector: (s: { activeStudyId: string | null }) => unknown) =>
    selector({ activeStudyId: null }),
}));

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

const { markRepetitionAsKeywordMock } = vi.hoisted(() => ({
  markRepetitionAsKeywordMock: vi.fn(async () => ({ id: 'preset-1' })),
}));
vi.mock('@/lib/discoveryActions', () => ({
  markRepetitionAsKeyword: markRepetitionAsKeywordMock,
}));

const repetition: RepetitionResult = {
  token: 'zephyr',
  display: 'Zephyr',
  count: 7,
  firstVerse: 2,
  lastVerse: 9,
  occurrences: [],
  forms: ['zephyr', 'zephyrs'],
};

function renderCard(overrides: Partial<Parameters<typeof RepetitionCard>[0]> = {}) {
  return render(
    <RepetitionCard
      repetition={repetition}
      translationCount={1}
      primaryTranslationAbbrev={null}
      book="John"
      chapter={1}
      translationId="sword-NASB"
      {...overrides}
    />
  );
}

describe('RepetitionCard', () => {
  beforeEach(() => {
    usePreferencesStore.setState({ inductiveToolsEnabled: false, isHydrated: true });
    useMarkingPresetStore.setState({ presets: [] });
    useToastStore.setState({ toasts: [] });
    trackMock.mockClear();
    markRepetitionAsKeywordMock.mockReset();
    // Mirrors the real `markRepetitionAsKeyword`'s side effect (adding the
    // preset to the marking-preset store) so `useRepetitionKeyword` finds it
    // the same way it would in production.
    markRepetitionAsKeywordMock.mockImplementation(async () => {
      const preset = makeMarkingPreset({ id: 'preset-1', word: 'Zephyr', scopes: [{ book: 'John', chapter: 1 }] });
      useMarkingPresetStore.setState(s => ({ presets: [...s.presets, preset] }));
      return preset;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('names the word and its count in the title', () => {
    renderCard();
    expect(screen.getByText('“Zephyr” appears 7× in this chapter')).toBeTruthy();
    expect(screen.getByText('Highlight it in this chapter')).toBeTruthy();
  });

  it('shows the translation suffix when there is more than one translation column', () => {
    renderCard({ translationCount: 2, primaryTranslationAbbrev: 'NASB' });
    expect(screen.getByText('“Zephyr” appears 7× in this chapter (NASB)')).toBeTruthy();
  });

  it('marks the word, tracks the tap, and then reports it as marked', async () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true, isHydrated: true });
    renderCard();
    fireEvent.click(screen.getByText('Mark it as a key word'));

    expect(trackMock).toHaveBeenCalledWith('discovery_chip_tapped', { feature: 'repetition' });
    await vi.waitFor(() => expect(markRepetitionAsKeywordMock).toHaveBeenCalledWith(repetition, 'John', 1, undefined));
    await vi.waitFor(() => expect(screen.getByText(/You've already marked it/)).toBeTruthy());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('re-enables the button and shows a toast when marking fails', async () => {
    markRepetitionAsKeywordMock.mockRejectedValueOnce(new Error('db write failed'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderCard();
    fireEvent.click(screen.getByText('Highlight it in this chapter'));

    await vi.waitFor(() => expect(markRepetitionAsKeywordMock).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect((screen.getByText('Highlight it in this chapter') as HTMLButtonElement).disabled).toBe(false)
    );
    expect(useToastStore.getState().toasts).toContainEqual(
      expect.objectContaining({ message: "Couldn't highlight it — try again.", variant: 'error' })
    );

    consoleErrorSpy.mockRestore();
  });

  describe('when a key word already matches', () => {
    it('says it is already marked instead of offering to mark it', () => {
      useMarkingPresetStore.setState({ presets: [makeMarkingPreset({ id: 'kw', word: 'Zephyrs' })] });
      renderCard();
      expect(screen.getByText('Zephyrs')).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('still offers when the key word is scoped to another chapter', () => {
      useMarkingPresetStore.setState({
        presets: [makeMarkingPreset({ id: 'kw', word: 'zephyr', scopes: [{ book: 'John', chapter: 2 }] })],
      });
      renderCard();
      expect(screen.getByText('Highlight it in this chapter')).toBeTruthy();
    });

    it('still offers when the key word belongs to another study', () => {
      useMarkingPresetStore.setState({ presets: [makeMarkingPreset({ id: 'kw', word: 'zephyr', studyId: 'other' })] });
      renderCard();
      expect(screen.getByText('Highlight it in this chapter')).toBeTruthy();
    });
  });
});
