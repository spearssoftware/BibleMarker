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
import { getChapterAnnotations, getChapterHeadings, getChapterTitle } from '@/lib/database';
import { useStudyStore } from '@/stores/studyStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useKeywordExclusionStore } from '@/stores/keywordExclusionStore';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { DEFAULT_CONFIG } from '@/lib/feature-flags';
import { DEFAULT_DISCOVERY_THRESHOLDS } from '@/lib/chapterAnalysis';
import {
  makeChapterAnalysis,
  makeChapterEntities,
  makeChapterEntityVerseIndex,
  makeDiscoveryContext,
  makeHighlightAnnotation,
  makeMarkingPreset,
  makeSymbolAnnotation,
} from '@/lib/__test__/factories';
import type { ChapterEntities, ChapterEntityVerseIndex, ChapterTitle, VerseRef } from '@/types';

vi.mock('@/lib/database');

let mockIndex: ChapterEntityVerseIndex | null = null;
let mockEntities: ChapterEntities | null = null;
const { useChapterEntityVerseIndexMock } = vi.hoisted(() => ({ useChapterEntityVerseIndexMock: vi.fn() }));
vi.mock('@/hooks/useGnosis', () => ({
  useChapterEntityVerseIndex: useChapterEntityVerseIndexMock,
}));

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

const { createBookScopedKeywordPresetMock } = vi.hoisted(() => ({ createBookScopedKeywordPresetMock: vi.fn() }));
vi.mock('@/lib/discoveryActions', () => ({
  createBookScopedKeywordPreset: createBookScopedKeywordPresetMock,
}));

/** 11 bare verses for a chapter identity, for the C (heading item) >10-verse gate. */
function makeVerses(book: string, chapter: number, count: number): { ref: VerseRef; text: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    ref: { book, chapter, verse: i + 1 },
    text: `Verse ${i + 1}.`,
  }));
}

// entities/entitiesLoading are caller-supplied params (mirroring DiscoveryPanel's
// own useChapterEntities call) rather than fetched internally by the hook, so
// `mockEntities` is threaded through as the `entities` argument here.
// `discoveryEnabled` defaults to true (the panel is on) for every existing test;
// the kill-switch itself gets its own test below.
function renderLookAgain(context = makeDiscoveryContext(), discoveryEnabled = true) {
  return renderHook(
    (ctx: ReturnType<typeof makeDiscoveryContext> | null) => useLookAgain(ctx, mockEntities, false, discoveryEnabled),
    { initialProps: context }
  );
}

describe('useLookAgain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIndex = null;
    mockEntities = null;
    useChapterEntityVerseIndexMock.mockImplementation(() => ({ index: mockIndex, isLoading: false, error: null }));
    vi.mocked(getChapterAnnotations).mockResolvedValue([]);
    vi.mocked(getChapterTitle).mockResolvedValue(undefined);
    vi.mocked(getChapterHeadings).mockResolvedValue([]);
    createBookScopedKeywordPresetMock.mockReset();
    createBookScopedKeywordPresetMock.mockResolvedValue(makeMarkingPreset({ id: 'new-preset' }));
    useStudyStore.setState({ activeStudyId: null });
    useMarkingPresetStore.setState({ presets: [] });
    useKeywordExclusionStore.setState({ exclusions: [] });
    useActiveChapterStore.setState({ book: null, chapter: null, translationId: null, verses: [] });
    useFeatureFlagsStore.setState({ config: DEFAULT_CONFIG });
    useDiscoveryStore.setState({
      context: null,
      lensActive: false,
      activePrompt: null,
      found: null,
      markedPresetId: null,
      revealedRungs: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('returns nothing (and stays not-ready) for a null context', () => {
    const { result } = renderLookAgain(null as unknown as ReturnType<typeof makeDiscoveryContext>);
    expect(result.current.items).toEqual([]);
    expect(result.current.ready).toBe(false);
  });

  it('is not ready until the chapter DB data has loaded', async () => {
    const { result } = renderLookAgain();
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('shows repetition, hinge, and title items (no entities index) and queries the DB for the chapter', async () => {
    const { result } = renderLookAgain();

    await waitFor(() => expect(getChapterAnnotations).toHaveBeenCalledWith('sword-NASB', 'John', 1));
    expect(getChapterTitle).toHaveBeenCalledWith(null, 'John', 1, null);

    await waitFor(() => expect(result.current.items.map(i => i.id)).toEqual(['repetition', 'hinge', 'title']));
    expect(result.current.items.find(i => i.id === 'repetition')).toMatchObject({
      label: 'One word repeats 11× — find and mark it',
      done: false,
    });
    expect(result.current.items.find(i => i.id === 'title')).toMatchObject({ done: false });
  });

  it('marks repetition done once useMarkedPresetExists is true', async () => {
    useMarkingPresetStore.setState({ presets: [makeMarkingPreset({ id: 'preset-1' })] });
    useDiscoveryStore.setState({ markedPresetId: 'preset-1' });

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.items.find(i => i.id === 'repetition')?.done).toBe(true));
  });

  it('keeps repetition done on a revisit: a preset whose word singularizes to the token, scoped to this chapter', async () => {
    // No markedPresetId (cleared by resetForChapter on revisit) — durability
    // comes from the preset itself. "words" singularizes to the token "word".
    useMarkingPresetStore.setState({
      presets: [makeMarkingPreset({ id: 'p1', word: 'Words', scopes: [{ book: 'John', chapter: 1 }] })],
    });

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.items.find(i => i.id === 'repetition')?.done).toBe(true));
  });

  it('keeps repetition done via a matching variant on a global preset', async () => {
    useMarkingPresetStore.setState({
      presets: [makeMarkingPreset({ id: 'p1', word: 'logos', variants: [{ text: 'word' }] })],
    });

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.items.find(i => i.id === 'repetition')?.done).toBe(true));
  });

  it('does not count a matching preset scoped to a different chapter', async () => {
    useMarkingPresetStore.setState({
      presets: [makeMarkingPreset({ id: 'p1', word: 'word', scopes: [{ book: 'John', chapter: 3 }] })],
    });

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.items.find(i => i.id === 'repetition')?.done).toBe(false);
  });

  it('does not count a matching preset that belongs to a different study', async () => {
    useStudyStore.setState({ activeStudyId: 'study-A' });
    useMarkingPresetStore.setState({
      presets: [makeMarkingPreset({ id: 'p1', word: 'word', studyId: 'study-B' })],
    });

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.items.find(i => i.id === 'repetition')?.done).toBe(false);
  });

  it('shows person/place items only when the entity verse index has verses, counted from useChapterEntities', async () => {
    mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [2], placesVerses: [5] });
    mockEntities = makeChapterEntities({ people: ['Jesus'], places: ['Jerusalem', 'Galilee'] });

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.items.map(i => i.id)).toEqual(['repetition', 'person', 'place', 'hinge', 'title']));

    expect(result.current.items.find(i => i.id === 'person')).toMatchObject({
      label: '1 person is named — mark one where a person appears',
      done: false,
    });
    expect(result.current.items.find(i => i.id === 'place')).toMatchObject({
      label: '2 places are named — mark one where a place appears',
      done: false,
    });
  });

  it('hides the person/place items when only the verse index resolved (both Gnosis sources required)', async () => {
    mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [2], placesVerses: [5] });
    mockEntities = null;

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.items.some(i => i.id === 'person')).toBe(false);
    expect(result.current.items.some(i => i.id === 'place')).toBe(false);
  });

  it('hides the person item when the entity list resolves with zero people (never "0 people")', async () => {
    mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [2] });
    mockEntities = makeChapterEntities({ people: [] });

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.items.some(i => i.id === 'person')).toBe(false);
  });

  describe('person/place key-word follow-up (refinement A)', () => {
    beforeEach(() => {
      mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [2] });
      mockEntities = makeChapterEntities({ people: ['Pharaoh'] });
    });

    it('exposes a follow-up when done via a real preset-less annotation covering the entity verse', async () => {
      vi.mocked(getChapterAnnotations).mockResolvedValue([
        makeHighlightAnnotation({
          moduleId: 'sword-NASB',
          startRef: { book: 'John', chapter: 1, verse: 2 },
          endRef: { book: 'John', chapter: 1, verse: 2 },
          selectedText: 'Pharaoh',
        }),
      ]);

      const { result } = renderLookAgain();
      await waitFor(() => expect(result.current.items.find(i => i.id === 'person')?.done).toBe(true));

      const person = result.current.items.find(i => i.id === 'person');
      expect(person?.followUp).toMatchObject({
        text: 'Marked ‘Pharaoh’? Highlight every mention in this chapter.',
        actionLabel: 'Highlight every mention',
      });
    });

    it('does not expose a follow-up when the item was satisfied by a virtual keyword-preset match (no real annotation)', async () => {
      useMarkingPresetStore.setState({ presets: [makeMarkingPreset({ id: 'preset-pharaoh', word: 'Pharaoh' })] });
      useActiveChapterStore.setState({
        book: 'John',
        chapter: 1,
        translationId: 'sword-NASB',
        verses: [{ ref: { book: 'John', chapter: 1, verse: 2 }, text: 'Pharaoh ruled the land.' }],
      });

      const { result } = renderLookAgain();
      await waitFor(() => expect(result.current.items.find(i => i.id === 'person')?.done).toBe(true));
      expect(result.current.items.find(i => i.id === 'person')?.followUp).toBeUndefined();
    });

    it('does not expose a follow-up when a matching preset already exists, even with a preset-less annotation present', async () => {
      useMarkingPresetStore.setState({ presets: [makeMarkingPreset({ id: 'preset-pharaoh', word: 'Pharaoh' })] });
      vi.mocked(getChapterAnnotations).mockResolvedValue([
        makeHighlightAnnotation({
          moduleId: 'sword-NASB',
          startRef: { book: 'John', chapter: 1, verse: 2 },
          endRef: { book: 'John', chapter: 1, verse: 2 },
          selectedText: 'Pharaoh',
        }),
      ]);

      const { result } = renderLookAgain();
      await waitFor(() => expect(result.current.items.find(i => i.id === 'person')?.done).toBe(true));
      expect(result.current.items.find(i => i.id === 'person')?.followUp).toBeUndefined();
    });

    it('does not expose a follow-up when the annotation carries a presetId (a preset-based mark, not preset-less)', async () => {
      vi.mocked(getChapterAnnotations).mockResolvedValue([
        makeHighlightAnnotation({
          moduleId: 'sword-NASB',
          startRef: { book: 'John', chapter: 1, verse: 2 },
          endRef: { book: 'John', chapter: 1, verse: 2 },
          selectedText: 'Pharaoh',
          presetId: 'some-preset',
        }),
      ]);

      const { result } = renderLookAgain();
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.items.find(i => i.id === 'person')?.followUp).toBeUndefined();
    });

    it("run() creates a book-scoped, chapter-pinned 'people' preset for the annotation's word, and the follow-up disappears once a matching preset exists", async () => {
      vi.mocked(getChapterAnnotations).mockResolvedValue([
        makeHighlightAnnotation({
          moduleId: 'sword-NASB',
          startRef: { book: 'John', chapter: 1, verse: 2 },
          endRef: { book: 'John', chapter: 1, verse: 2 },
          selectedText: 'Pharaoh',
        }),
      ]);

      const { result } = renderLookAgain();
      await waitFor(() => expect(result.current.items.find(i => i.id === 'person')?.followUp).toBeDefined());

      await act(async () => {
        await result.current.items.find(i => i.id === 'person')!.followUp!.run();
      });

      expect(createBookScopedKeywordPresetMock).toHaveBeenCalledWith(
        expect.objectContaining({ word: 'Pharaoh', book: 'John', chapter: 1, category: 'people' })
      );

      // Simulate the store update createBookScopedKeywordPreset would have
      // caused for real (it calls markingPresetStore.addPreset internally) —
      // the follow-up must vanish now that a matching preset exists.
      act(() => {
        useMarkingPresetStore.setState({ presets: [makeMarkingPreset({ id: 'new-preset', word: 'Pharaoh' })] });
      });
      await waitFor(() => expect(result.current.items.find(i => i.id === 'person')?.followUp).toBeUndefined());
    });

    it('uses the first candidate by verse order and the "places" category for the place item', async () => {
      mockIndex = makeChapterEntityVerseIndex({ placesVerses: [3, 5] });
      mockEntities = makeChapterEntities({ places: ['Bethlehem'] });
      vi.mocked(getChapterAnnotations).mockResolvedValue([
        makeHighlightAnnotation({
          id: 'ann-later',
          moduleId: 'sword-NASB',
          startRef: { book: 'John', chapter: 1, verse: 5 },
          endRef: { book: 'John', chapter: 1, verse: 5 },
          selectedText: 'Later Town',
        }),
        makeHighlightAnnotation({
          id: 'ann-earlier',
          moduleId: 'sword-NASB',
          startRef: { book: 'John', chapter: 1, verse: 3 },
          endRef: { book: 'John', chapter: 1, verse: 3 },
          selectedText: 'Bethlehem',
        }),
      ]);

      const { result } = renderLookAgain();
      await waitFor(() => expect(result.current.items.find(i => i.id === 'place')?.followUp).toBeDefined());

      const place = result.current.items.find(i => i.id === 'place');
      expect(place?.followUp?.text).toContain('Bethlehem');
      expect(createBookScopedKeywordPresetMock).not.toHaveBeenCalled();
    });
  });

  it('hides the hinge item below the connector threshold, matching the panel card gate', async () => {
    useFeatureFlagsStore.setState({
      config: {
        ...DEFAULT_CONFIG,
        discoveryThresholds: { ...DEFAULT_DISCOVERY_THRESHOLDS, connectorChipMinCount: 2 },
      },
    });

    const { result } = renderLookAgain(); // factory analysis has 1 connector
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.items.some(i => i.id === 'hinge')).toBe(false);
  });

  it('uses the singular hinge wording for exactly one hinge (refinement B)', async () => {
    const { result } = renderLookAgain(); // factory analysis has 1 connector
    await waitFor(() =>
      expect(result.current.items.find(i => i.id === 'hinge')).toMatchObject({
        label: '1 hinge holds this chapter — mark it',
      })
    );
  });

  it('uses the plural "which one carries the argument" wording for 2+ hinges (refinement B)', async () => {
    const hits = [
      { phrase: 'therefore', category: 'conclusion' as const, verse: 1, start: 0, end: 9 },
      { phrase: 'but', category: 'contrast' as const, verse: 2, start: 0, end: 3 },
    ];
    const context = makeDiscoveryContext({
      analysis: makeChapterAnalysis({ connectors: hits, connectorRangesByVerse: new Map([[1, [hits[0]]], [2, [hits[1]]]]) }),
    });

    const { result } = renderLookAgain(context);
    await waitFor(() =>
      expect(result.current.items.find(i => i.id === 'hinge')).toMatchObject({
        label: '2 hinges — which one carries the argument? Mark it',
      })
    );
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
    await waitFor(() => expect(result.current.items.find(i => i.id === 'person')?.done).toBe(true));
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
    await waitFor(() => expect(result.current.items.some(i => i.id === 'person')).toBe(true));
    expect(result.current.items.find(i => i.id === 'person')?.done).toBe(false);
  });

  it('a symbol annotation counts by ref.verse for the place item', async () => {
    mockIndex = makeChapterEntityVerseIndex({ placesVerses: [7] });
    mockEntities = makeChapterEntities({ places: ['Bethlehem'] });
    vi.mocked(getChapterAnnotations).mockResolvedValue([
      makeSymbolAnnotation({ moduleId: 'sword-NASB', ref: { book: 'John', chapter: 1, verse: 7 } }),
    ]);

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.items.find(i => i.id === 'place')?.done).toBe(true));
  });

  describe('multi-verse annotation coverage (S2)', () => {
    const multiVerseAnnotation = () =>
      makeHighlightAnnotation({
        moduleId: 'sword-NASB',
        startRef: { book: 'John', chapter: 1, verse: 2 },
        endRef: { book: 'John', chapter: 1, verse: 4 },
        startOffset: 10,
        endOffset: 3,
      });

    it('covers middle verses fully regardless of offsets', async () => {
      mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [3] });
      mockEntities = makeChapterEntities({ people: ['Jesus'] });
      vi.mocked(getChapterAnnotations).mockResolvedValue([multiVerseAnnotation()]);

      const { result } = renderLookAgain();
      await waitFor(() => expect(result.current.items.find(i => i.id === 'person')?.done).toBe(true));
    });

    it('bounds the start verse by its startOffset (hinge before the offset does not overlap)', async () => {
      const context = makeDiscoveryContext({
        analysis: makeChapterAnalysis({
          connectors: [{ phrase: 'therefore', category: 'conclusion', verse: 2, start: 0, end: 9 }],
          connectorRangesByVerse: new Map(),
        }),
      });
      vi.mocked(getChapterAnnotations).mockResolvedValue([multiVerseAnnotation()]);

      const { result } = renderLookAgain(context);
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.items.find(i => i.id === 'hinge')?.done).toBe(false);
    });

    it('bounds the end verse by its endOffset (hinge after the offset does not overlap; before does)', async () => {
      const past = makeDiscoveryContext({
        analysis: makeChapterAnalysis({
          connectors: [{ phrase: 'therefore', category: 'conclusion', verse: 4, start: 10, end: 19 }],
          connectorRangesByVerse: new Map(),
        }),
      });
      vi.mocked(getChapterAnnotations).mockResolvedValue([multiVerseAnnotation()]);

      const first = renderLookAgain(past);
      await waitFor(() => expect(first.result.current.ready).toBe(true));
      expect(first.result.current.items.find(i => i.id === 'hinge')?.done).toBe(false);
      first.unmount();

      const within = makeDiscoveryContext({
        analysis: makeChapterAnalysis({
          connectors: [{ phrase: 'therefore', category: 'conclusion', verse: 4, start: 0, end: 2 }],
          connectorRangesByVerse: new Map(),
        }),
      });
      const second = renderLookAgain(within);
      await waitFor(() => expect(second.result.current.items.find(i => i.id === 'hinge')?.done).toBe(true));
    });

    it('an annotation starting in a different chapter contributes nothing here', async () => {
      mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [2] });
      mockEntities = makeChapterEntities({ people: ['Jesus'] });
      // John 2:1–2:2 span; its verse numbers must not leak into John 1's set.
      vi.mocked(getChapterAnnotations).mockResolvedValue([
        makeHighlightAnnotation({
          moduleId: 'sword-NASB',
          startRef: { book: 'John', chapter: 2, verse: 1 },
          endRef: { book: 'John', chapter: 2, verse: 2 },
        }),
      ]);

      const { result } = renderLookAgain();
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.items.find(i => i.id === 'person')?.done).toBe(false);
    });

    it('a span running into the next chapter is clamped to its start verse', async () => {
      mockIndex = makeChapterEntityVerseIndex({ peopleVerses: [50, 51] });
      mockEntities = makeChapterEntities({ people: ['Jesus'] });
      vi.mocked(getChapterAnnotations).mockResolvedValue([
        makeHighlightAnnotation({
          moduleId: 'sword-NASB',
          startRef: { book: 'John', chapter: 1, verse: 51 },
          endRef: { book: 'John', chapter: 2, verse: 2 },
        }),
      ]);

      const { result } = renderLookAgain();
      // Start verse 51 counts; nothing from chapter 2 (verse 2) does.
      await waitFor(() => expect(result.current.items.find(i => i.id === 'person')?.done).toBe(true));
    });
  });

  it('drops a stale DB response that resolves after a newer one (request-id race)', async () => {
    const title = {
      id: 'title-1',
      book: 'John',
      chapter: 1,
      title: 'Fresh title',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    let resolveStale: (v: ChapterTitle | undefined) => void = () => {};
    vi.mocked(getChapterTitle).mockImplementationOnce(
      () => new Promise<ChapterTitle | undefined>(res => { resolveStale = res; })
    );

    const { result } = renderLookAgain();
    await waitFor(() => expect(getChapterTitle).toHaveBeenCalledTimes(1));

    // A newer load (annotationsUpdated) resolves first, with a title…
    vi.mocked(getChapterTitle).mockResolvedValue(title);
    act(() => {
      window.dispatchEvent(new Event('annotationsUpdated'));
    });
    await waitFor(() => expect(result.current.items.find(i => i.id === 'title')?.done).toBe(true));

    // …then the stale first response (no title) lands and must be dropped.
    act(() => {
      resolveStale(undefined);
    });
    await act(async () => {});
    expect(result.current.items.find(i => i.id === 'title')?.done).toBe(true);
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
    await waitFor(() => expect(result.current.items.find(i => i.id === 'person')?.done).toBe(true));
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
    await waitFor(() => expect(result.current.items.some(i => i.id === 'person')).toBe(true));
    expect(result.current.items.find(i => i.id === 'person')?.done).toBe(false);
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
    await waitFor(() => expect(result.current.items.find(i => i.id === 'hinge')?.done).toBe(true));
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
    await waitFor(() => expect(result.current.items.some(i => i.id === 'hinge')).toBe(true));
    expect(result.current.items.find(i => i.id === 'hinge')?.done).toBe(false);
  });

  it('title item checks off after the chapter title loads following an annotationsUpdated event', async () => {
    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.items.find(i => i.id === 'title')?.done).toBe(false));

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

    await waitFor(() => expect(result.current.items.find(i => i.id === 'title')?.done).toBe(true));
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

    // Re-rendering with the same (already-complete) context must not re-fire.
    rerender(context);
    await act(async () => {});
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it('fires discovery_checklist_completed again after switching studies: the latch is keyed to {book, chapter, translationId, activeStudyId}, not global', async () => {
    const bareAnalysis = makeChapterAnalysis({ repetition: null, connectors: [], connectorRangesByVerse: new Map() });
    const context = makeDiscoveryContext({ analysis: bareAnalysis });

    useStudyStore.setState({ activeStudyId: 'study-A' });
    const { result } = renderLookAgain(context);
    await waitFor(() => expect(getChapterTitle).toHaveBeenCalledWith(null, 'John', 1, 'study-A'));
    expect(trackMock).not.toHaveBeenCalled();

    vi.mocked(getChapterTitle).mockResolvedValue({
      id: 'title-A',
      book: 'John',
      chapter: 1,
      title: 'Title A',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    act(() => {
      window.dispatchEvent(new Event('annotationsUpdated'));
    });
    await waitFor(() => expect(trackMock).toHaveBeenCalledTimes(1));

    // Switching the active study is a new {book, chapter, translationId,
    // activeStudyId} identity — the completion latch must re-arm rather than
    // staying tripped from study A. Study B starts with no title of its own.
    vi.mocked(getChapterTitle).mockResolvedValue(undefined);
    act(() => {
      useStudyStore.setState({ activeStudyId: 'study-B' });
    });
    await waitFor(() => expect(getChapterTitle).toHaveBeenCalledWith(null, 'John', 1, 'study-B'));
    await waitFor(() => expect(result.current.items.find(i => i.id === 'title')?.done).toBe(false));

    vi.mocked(getChapterTitle).mockResolvedValue({
      id: 'title-B',
      book: 'John',
      chapter: 1,
      title: 'Title B',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    act(() => {
      window.dispatchEvent(new Event('annotationsUpdated'));
    });

    await waitFor(() => expect(trackMock).toHaveBeenCalledTimes(2));
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
  });

  it('renders conservative undone items (never throws or leaves an unhandled rejection) when the DB load fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getChapterAnnotations).mockRejectedValue(new Error('DB unavailable'));

    const { result } = renderLookAgain();

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.items.length).toBeGreaterThan(0);
    expect(result.current.items.find(i => i.id === 'title')).toMatchObject({ done: false });
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('re-runs the failed load on the next annotationsUpdated and recovers', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getChapterAnnotations).mockRejectedValueOnce(new Error('DB unavailable'));

    const { result } = renderLookAgain();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.items.find(i => i.id === 'title')?.done).toBe(false);

    vi.mocked(getChapterAnnotations).mockResolvedValue([]);
    vi.mocked(getChapterTitle).mockResolvedValue({
      id: 'title-1',
      book: 'John',
      chapter: 1,
      title: 'Recovered title',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    act(() => {
      window.dispatchEvent(new Event('annotationsUpdated'));
    });

    await waitFor(() => expect(result.current.items.find(i => i.id === 'title')?.done).toBe(true));
    consoleError.mockRestore();
  });

  it('does no DB work and returns not-ready when the Discover kill switch is off', async () => {
    const { result } = renderLookAgain(makeDiscoveryContext(), false);

    await act(async () => {});

    expect(result.current).toEqual({ items: [], ready: false });
    expect(getChapterAnnotations).not.toHaveBeenCalled();
    expect(getChapterTitle).not.toHaveBeenCalled();
    expect(getChapterHeadings).not.toHaveBeenCalled();
    expect(useChapterEntityVerseIndexMock).toHaveBeenCalledWith('John', 1, false);
  });

  describe('heading item (refinement C)', () => {
    it('is hidden for a chapter with 10 or fewer verses', async () => {
      useActiveChapterStore.setState({
        book: 'John',
        chapter: 1,
        translationId: 'sword-NASB',
        verses: makeVerses('John', 1, 10),
      });

      const { result } = renderLookAgain();
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.items.some(i => i.id === 'heading')).toBe(false);
    });

    it('is shown, undone, for a chapter with more than 10 verses', async () => {
      useActiveChapterStore.setState({
        book: 'John',
        chapter: 1,
        translationId: 'sword-NASB',
        verses: makeVerses('John', 1, 11),
      });

      const { result } = renderLookAgain();
      await waitFor(() =>
        expect(result.current.items.find(i => i.id === 'heading')).toMatchObject({
          label: 'Where does this chapter shift? Add a section heading where it turns',
          done: false,
        })
      );
    });

    it('is hidden when the active-chapter store holds a different chapter\'s verses (identity guard)', async () => {
      useActiveChapterStore.setState({
        book: 'John',
        chapter: 2,
        translationId: 'sword-NASB',
        verses: makeVerses('John', 2, 20),
      });

      const { result } = renderLookAgain();
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.items.some(i => i.id === 'heading')).toBe(false);
    });

    it('is done once the chapter has at least one section heading loaded from the DB', async () => {
      useActiveChapterStore.setState({
        book: 'John',
        chapter: 1,
        translationId: 'sword-NASB',
        verses: makeVerses('John', 1, 11),
      });
      vi.mocked(getChapterHeadings).mockResolvedValue([
        {
          id: 'heading-1',
          beforeRef: { book: 'John', chapter: 1, verse: 6 },
          title: 'The Word Made Flesh',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const { result } = renderLookAgain();
      await waitFor(() => expect(getChapterHeadings).toHaveBeenCalledWith(null, 'John', 1, null));
      await waitFor(() => expect(result.current.items.find(i => i.id === 'heading')?.done).toBe(true));
    });

    it('toggles done after a heading is added via annotationsUpdated', async () => {
      useActiveChapterStore.setState({
        book: 'John',
        chapter: 1,
        translationId: 'sword-NASB',
        verses: makeVerses('John', 1, 11),
      });

      const { result } = renderLookAgain();
      await waitFor(() => expect(result.current.items.find(i => i.id === 'heading')?.done).toBe(false));

      vi.mocked(getChapterHeadings).mockResolvedValue([
        {
          id: 'heading-1',
          beforeRef: { book: 'John', chapter: 1, verse: 6 },
          title: 'The Word Made Flesh',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      act(() => {
        window.dispatchEvent(new Event('annotationsUpdated'));
      });

      await waitFor(() => expect(result.current.items.find(i => i.id === 'heading')?.done).toBe(true));
    });
  });
});
