/**
 * @vitest-environment jsdom
 *
 * Repetition Radar must never leak `RepetitionResult.token` into the DOM —
 * the hint ladder (count → category hint, skipped when Gnosis has no
 * matching entity → verse range) is deliberately Socratic, and confirmation
 * only happens once the reader selects the exact word themselves.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RepetitionChip } from '../RepetitionChip';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import type { RepetitionResult } from '@/lib/chapterAnalysis';
import type { ChapterEntities } from '@/types';

vi.mock('@/lib/database', () => ({
  updatePreferences: vi.fn(async () => {}),
  getPreferences: vi.fn(async () => ({})),
  getAllMarkingPresets: vi.fn(async () => []),
  saveMarkingPreset: vi.fn(async () => {}),
  deleteMarkingPreset: vi.fn(async () => {}),
  searchMarkingPresets: vi.fn(async () => []),
  incrementMarkingPresetUsage: vi.fn(async () => {}),
  pruneTrackersForPreset: vi.fn(async () => {}),
  getAllStudies: vi.fn(async () => []),
  saveStudy: vi.fn(async () => {}),
  deleteStudy: vi.fn(async () => {}),
  getAllConclusions: vi.fn(async () => []),
  saveConclusion: vi.fn(async () => {}),
  deleteConclusion: vi.fn(async () => {}),
}));

let mockEntities: ChapterEntities | null = null;
vi.mock('@/hooks/useGnosis', () => ({
  useChapterEntities: () => ({ entities: mockEntities, isLoading: false, error: null }),
}));

const repetition: RepetitionResult = {
  token: 'zephyr',
  count: 7,
  firstVerse: 2,
  lastVerse: 9,
  occurrences: [],
};

describe('RepetitionChip', () => {
  beforeEach(() => {
    mockEntities = null;
    useAnnotationStore.setState({ selection: null });
    useDiscoveryStore.setState({ lensActive: false, found: null, activePrompt: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('advances the hint ladder and skips the category rung when there is no hint', () => {
    render(
      <RepetitionChip
        repetition={repetition}
        translationCount={1}
        book="John"
        chapter={1}
        translationId="sword-NASB"
      />
    );

    const chip = screen.getByText('One word appears 7× in this chapter');
    fireEvent.click(chip);
    expect(screen.getByText('It appears 7 times.')).toBeTruthy();

    fireEvent.click(chip);
    expect(screen.getByText('Look between v.2 and v.9.')).toBeTruthy();
    expect(screen.queryByText(/name for/)).toBeNull();
  });

  it('shows the category hint rung when Gnosis has a matching entity', () => {
    mockEntities = { book: 'John', chapter: 1, people: ['zephyr'], places: [], events: [], topics: [] };

    render(
      <RepetitionChip
        repetition={repetition}
        translationCount={1}
        book="John"
        chapter={1}
        translationId="sword-NASB"
      />
    );

    const chip = screen.getByText('One word appears 7× in this chapter');
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(screen.getByText("It's a name for someone.")).toBeTruthy();
  });

  it('confirms once the reader selects the exact word in the primary translation, and never renders the token', () => {
    useAnnotationStore.setState({
      selection: {
        moduleId: 'sword-NASB',
        book: 'John',
        chapter: 1,
        startVerse: 3,
        endVerse: 3,
        text: 'Zephyrs',
      },
    });

    const { container } = render(
      <RepetitionChip
        repetition={repetition}
        translationCount={1}
        book="John"
        chapter={1}
        translationId="sword-NASB"
      />
    );

    expect(screen.getByText('You found it')).toBeTruthy();
    expect(container.innerHTML.toLowerCase()).not.toContain('zephyr');
  });

  it('does not confirm when the selection is in a different translation column', () => {
    useAnnotationStore.setState({
      selection: {
        moduleId: 'sword-KJV',
        book: 'John',
        chapter: 1,
        startVerse: 3,
        endVerse: 3,
        text: 'Zephyrs',
      },
    });

    render(
      <RepetitionChip
        repetition={repetition}
        translationCount={1}
        book="John"
        chapter={1}
        translationId="sword-NASB"
      />
    );

    expect(screen.queryByText('You found it')).toBeNull();
  });
});
