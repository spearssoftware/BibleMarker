/**
 * @vitest-environment jsdom
 *
 * useLookAgain derives the Look-Again checklist items. Exercises: DB-sourced
 * chapter data (mocked `@/lib/database`, reloaded on `annotationsUpdated`),
 * real-annotation + virtual-keyword-match marked-verse detection (B2), the
 * S2 overlap rules (offset-less = whole verse, hinge char-range overlap),
 * and the S4 in-session-transition-only completion telemetry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { useLookAgain } from '../useLookAgain';
import { getChapterAnnotations, getChapterTitle } from '@/lib/database';
import { useStudyStore } from '@/stores/studyStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useKeywordExclusionStore } from '@/stores/keywordExclusionStore';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import {
  makeChapterAnalysis,
  makeChapterEntities,
  makeChapterEntityVerseIndex,
  makeDiscoveryContext,
  makeHighlightAnnotation,
  makeMarkingPreset,
  makeSymbolAnnotation,
} from '@/lib/__test__/factories';
import type { ChapterEntities, ChapterEntityVerseIndex } from '@/types';

vi.mock('@/lib/database');

let mockIndex: ChapterEntityVerseIndex | null = null;
let mockEntities: ChapterEntities | null = null;
vi.mock('@/hooks/useGnosis', () => ({
  useChapterEntityVerseIndex: () => ({ index: mockIndex, isLoading: false, error: null }),
  useChapterEntities: () => ({ entities: mockEntities, isLoading: false, error: null }),
}));

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

function renderLookAgain(context = makeDiscoveryContext()) {
  return renderHook((ctx: ReturnType<typeof makeDiscoveryContext> | null) => useLookAgain(ctx), {
    initialProps: context,
  });
}

describe('useLookAgain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIndex = null;
    mockEntities = null;
    vi.mocked(getChapterAnnotations).mockResolvedValue([]);
    vi.mocked(getChapterTitle).mockResolvedValue(undefined);
    useStudyStore.setState({ activeStudyId: null });
    useMarkingPresetStore.setState({ presets: [] });
    useKeywordExclusionStore.setState({ exclusions: [] });
    useActiveChapterStore.setState({ book: null, chapter: null, translationId: null, verses: [] });
    useDiscoveryStore.setState({
      context: null,
      lensActive: false,
      activePrompt: null,
      found: null,
      markedPresetId: null,
      revealedRungs: [],
      checklistCompletedTracked: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('returns nothing for a null context', () => {
    const { result } = renderLookAgain(null as unknown as ReturnType<typeof makeDiscoveryContext>);
    expect(result.current).toEqual([]);
  });

  it('shows repetition, hinge, and title items (no entities index) and queries the DB for the chapter', async () => {
    const { result } = renderLookAgain();

    await waitFor(() => expect(getChapterAnnotations).toHaveBeenCalledWith('sword-NASB', 'John', 1));
    expect(getChapterTitle).toHaveBeenCalledWith(null, 'John', 1, null);

    await waitFor(() => expect(result.current.map(i => i.id)).toEqual(['repetition', 'hinge', 'title']));
    expect(result.current.find(i => i.id === 'repetition')).toMatchObject({
      label: 'One word repeats 11× — find and mark it',
      done: false,
    });
    expect(result.current.find(i => i.id === 'title')).toMatchObject({ done: false });
  });

  it('marks repetition done once useMarkedPresetExists is true', async () => {
    useMarkingPresetStore.setState({ presets: [makeMarkingPreset({ id: 'preset-1' })] });
    useDiscoveryStore.setState({ markedPresetId: 'preset-1' });

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.find(i => i.id === 'repetition')?.done).toBe(true));
  });

  it('shows person/place items only when the entity verse index has verses, counted from useChapterEntities', async () => {
    mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [2], placesVerses: [5] });
    mockEntities = makeChapterEntities({ people: ['Jesus'], places: ['Jerusalem', 'Galilee'] });

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.map(i => i.id)).toEqual(['repetition', 'person', 'place', 'hinge', 'title']));

    expect(result.current.find(i => i.id === 'person')).toMatchObject({
      label: '1 person are named — mark one where a person appears',
      done: false,
    });
    expect(result.current.find(i => i.id === 'place')).toMatchObject({
      label: '2 places are named — mark one where a place appears',
      done: false,
    });
  });

  it('an offset-less real annotation counts as a whole-verse mark, checking off the person item', async () => {
    mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [2] });
    mockEntities = makeChapterEntities({ people: ['Jesus'] });
    vi.mocked(getChapterAnnotations).mockResolvedValue([
      makeHighlightAnnotation({
        moduleId: 'sword-NASB',
        startRef: { book: 'John', chapter: 1, verse: 2 },
        endRef: { book: 'John', chapter: 1, verse: 2 },
        startOffset: undefined,
        endOffset: undefined,
      }),
    ]);

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.find(i => i.id === 'person')?.done).toBe(true));
  });

  it('ignores a real annotation from a different translation (moduleId filter)', async () => {
    mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [2] });
    mockEntities = makeChapterEntities({ people: ['Jesus'] });
    vi.mocked(getChapterAnnotations).mockResolvedValue([
      makeHighlightAnnotation({
        moduleId: 'sword-KJV', // context.translationId is 'sword-NASB'
        startRef: { book: 'John', chapter: 1, verse: 2 },
        endRef: { book: 'John', chapter: 1, verse: 2 },
      }),
    ]);

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.some(i => i.id === 'person')).toBe(true));
    expect(result.current.find(i => i.id === 'person')?.done).toBe(false);
  });

  it('a symbol annotation counts by ref.verse for the place item', async () => {
    mockIndex = makeChapterEntityVerseIndex({ placesVerses: [7] });
    mockEntities = makeChapterEntities({ places: ['Bethlehem'] });
    vi.mocked(getChapterAnnotations).mockResolvedValue([
      makeSymbolAnnotation({ moduleId: 'sword-NASB', ref: { book: 'John', chapter: 1, verse: 7 } }),
    ]);

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.find(i => i.id === 'place')?.done).toBe(true));
  });

  it('counts a virtual keyword-preset match (no real annotation) toward the person item', async () => {
    mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [3] });
    mockEntities = makeChapterEntities({ people: ['Pharaoh'] });
    useMarkingPresetStore.setState({
      presets: [makeMarkingPreset({ id: 'preset-pharaoh', word: 'Pharaoh' })],
    });
    useActiveChapterStore.setState({
      book: 'John',
      chapter: 1,
      translationId: 'sword-NASB',
      verses: [{ ref: { book: 'John', chapter: 1, verse: 3 }, text: 'Pharaoh ruled the land.' }],
    });

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.find(i => i.id === 'person')?.done).toBe(true));
  });

  it('does not use active-chapter verses for a different chapter than the context', async () => {
    mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [3] });
    mockEntities = makeChapterEntities({ people: ['Pharaoh'] });
    useMarkingPresetStore.setState({
      presets: [makeMarkingPreset({ id: 'preset-pharaoh', word: 'Pharaoh' })],
    });
    // Active chapter store is stale from a different chapter.
    useActiveChapterStore.setState({
      book: 'John',
      chapter: 2,
      translationId: 'sword-NASB',
      verses: [{ ref: { book: 'John', chapter: 2, verse: 3 }, text: 'Pharaoh ruled the land.' }],
    });

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.some(i => i.id === 'person')).toBe(true));
    expect(result.current.find(i => i.id === 'person')?.done).toBe(false);
  });

  it('hinge done when a marked range overlaps the connector hit char range', async () => {
    const context = makeDiscoveryContext({
      analysis: makeChapterAnalysis({
        connectors: [{ phrase: 'therefore', category: 'conclusion', verse: 1, start: 10, end: 19 }],
        connectorRangesByVerse: new Map(),
      }),
    });
    vi.mocked(getChapterAnnotations).mockResolvedValue([
      makeHighlightAnnotation({
        moduleId: 'sword-NASB',
        startRef: { book: 'John', chapter: 1, verse: 1 },
        endRef: { book: 'John', chapter: 1, verse: 1 },
        startOffset: 12,
        endOffset: 15,
      }),
    ]);

    const { result } = renderLookAgain(context);
    await waitFor(() => expect(result.current.find(i => i.id === 'hinge')?.done).toBe(true));
  });

  it('hinge stays undone when the marked range does not overlap the connector hit', async () => {
    const context = makeDiscoveryContext({
      analysis: makeChapterAnalysis({
        connectors: [{ phrase: 'therefore', category: 'conclusion', verse: 1, start: 10, end: 19 }],
        connectorRangesByVerse: new Map(),
      }),
    });
    vi.mocked(getChapterAnnotations).mockResolvedValue([
      makeHighlightAnnotation({
        moduleId: 'sword-NASB',
        startRef: { book: 'John', chapter: 1, verse: 1 },
        endRef: { book: 'John', chapter: 1, verse: 1 },
        startOffset: 0,
        endOffset: 5,
      }),
    ]);

    const { result } = renderLookAgain(context);
    await waitFor(() => expect(result.current.some(i => i.id === 'hinge')).toBe(true));
    expect(result.current.find(i => i.id === 'hinge')?.done).toBe(false);
  });

  it('title item checks off after the chapter title loads following an annotationsUpdated event', async () => {
    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.find(i => i.id === 'title')?.done).toBe(false));

    vi.mocked(getChapterTitle).mockResolvedValue({
      id: 'title-1',
      book: 'John',
      chapter: 1,
      title: 'The Word became flesh',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    act(() => {
      window.dispatchEvent(new Event('annotationsUpdated'));
    });

    await waitFor(() => expect(result.current.find(i => i.id === 'title')?.done).toBe(true));
  });

  it('fires discovery_checklist_completed exactly once on the in-session undone -> all-done transition', async () => {
    const context = makeDiscoveryContext({
      analysis: makeChapterAnalysis({ repetition: null, connectors: [], connectorRangesByVerse: new Map() }),
    });
    const { rerender } = renderLookAgain(context);
    await waitFor(() => expect(getChapterTitle).toHaveBeenCalled());
    expect(trackMock).not.toHaveBeenCalled();

    vi.mocked(getChapterTitle).mockResolvedValue({
      id: 'title-1',
      book: 'John',
      chapter: 1,
      title: 'Title',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    act(() => {
      window.dispatchEvent(new Event('annotationsUpdated'));
    });

    await waitFor(() => expect(trackMock).toHaveBeenCalledWith('discovery_checklist_completed'));
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(useDiscoveryStore.getState().checklistCompletedTracked).toBe(true);

    // Re-rendering with the same (already-complete) context must not re-fire.
    rerender(context);
    await act(async () => {});
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it('does not fire completion telemetry when revisiting an already-complete chapter (first evaluation is already done)', async () => {
    const context = makeDiscoveryContext({
      analysis: makeChapterAnalysis({ repetition: null, connectors: [], connectorRangesByVerse: new Map() }),
    });
    vi.mocked(getChapterTitle).mockResolvedValue({
      id: 'title-1',
      book: 'John',
      chapter: 1,
      title: 'Already titled',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    renderLookAgain(context);
    await waitFor(() => expect(getChapterTitle).toHaveBeenCalled());
    await act(async () => {});

    expect(trackMock).not.toHaveBeenCalled();
    expect(useDiscoveryStore.getState().checklistCompletedTracked).toBe(false);
  });
});
