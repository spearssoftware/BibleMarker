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

const repetition: RepetitionResult = {
  token: 'zephyr',
  count: 7,
  firstVerse: 2,
  lastVerse: 9,
  occurrences: [],
  forms: ['zephyr', 'zephyrs'],
};

const noEntities: ChapterEntities | null = null;

describe('RepetitionChip', () => {
  beforeEach(() => {
    useAnnotationStore.setState({ selection: null });
    useDiscoveryStore.setState({ lensActive: false, found: null, activePrompt: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('advances the hint ladder and skips the category rung when there is no hint, never rendering the token', () => {
    const { container } = render(
      <RepetitionChip
        repetition={repetition}
        translationCount={1}
        book="John"
        chapter={1}
        translationId="sword-NASB"
        entities={noEntities}
      />
    );

    const chip = screen.getByText('One word appears 7× in this chapter');
    expect(container.innerHTML.toLowerCase()).not.toContain('zephyr');

    fireEvent.click(chip);
    expect(screen.getByText('It appears 7 times.')).toBeTruthy();
    expect(container.innerHTML.toLowerCase()).not.toContain('zephyr');

    fireEvent.click(chip);
    expect(screen.getByText('Look between v.2 and v.9.')).toBeTruthy();
    expect(screen.queryByText(/name for/)).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain('zephyr');
  });

  it('shows the category hint rung when Gnosis has a matching entity, never rendering the token', () => {
    const entities: ChapterEntities = { book: 'John', chapter: 1, people: ['zephyr'], places: [], events: [], topics: [] };

    const { container } = render(
      <RepetitionChip
        repetition={repetition}
        translationCount={1}
        book="John"
        chapter={1}
        translationId="sword-NASB"
        entities={entities}
      />
    );

    const chip = screen.getByText('One word appears 7× in this chapter');
    fireEvent.click(chip);
    expect(container.innerHTML.toLowerCase()).not.toContain('zephyr');

    fireEvent.click(chip);
    expect(screen.getByText("It's a name for someone.")).toBeTruthy();
    expect(container.innerHTML.toLowerCase()).not.toContain('zephyr');

    fireEvent.click(chip);
    expect(screen.getByText('Look between v.2 and v.9.')).toBeTruthy();
    expect(container.innerHTML.toLowerCase()).not.toContain('zephyr');
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
        entities={noEntities}
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
        entities={noEntities}
      />
    );

    expect(screen.queryByText('You found it')).toBeNull();
  });

  it('does not confirm a stale selection left over from a different chapter', () => {
    useAnnotationStore.setState({
      selection: {
        moduleId: 'sword-NASB',
        book: 'John',
        chapter: 2,
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
        entities={noEntities}
      />
    );

    expect(screen.queryByText('You found it')).toBeNull();
  });

  it('does not confirm a stale selection left over from a different book', () => {
    useAnnotationStore.setState({
      selection: {
        moduleId: 'sword-NASB',
        book: 'Luke',
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
        entities={noEntities}
      />
    );

    expect(screen.queryByText('You found it')).toBeNull();
  });
});
