/**
 * @vitest-environment jsdom
 *
 * useDiscoveryHost owns the Discover-layer state that must keep working
 * while the reader reads even though the Discover panel is usually
 * unmounted: the chapter-change reset (including clearing a stale text
 * selection), publishing analysis/translation meta, and the
 * repetition "find" confirmation ported from the old `RepetitionChip`'s
 * confirm effect (moduleId/book/chapter/single-verse guards included), plus
 * the toast nudge shown when the reader confirms a find with the Discover
 * panel closed. `discovery_chip_shown` telemetry moved to `DiscoveryPanel`
 * and is covered by DiscoveryPanel.test.tsx instead.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useDiscoveryHost } from '../useDiscoveryHost';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePanelStore } from '@/stores/panelStore';
import { useToastStore } from '@/stores/toastStore';
import { DEFAULT_DISCOVERY_THRESHOLDS, type ChapterAnalysis } from '@/lib/chapterAnalysis';
import type { CrossRefPassageRow } from '@/hooks/useCrossRefPassages';
import type { ChapterCrossRefIndex } from '@/types';
import {
  makeChapterAnalysis,
  makeChapterCrossRefIndex,
  makeCrossRefPassageRow,
  makeDiscoveryContext,
  makeTextSelection,
} from '@/lib/__test__/factories';

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

vi.mock('@/lib/discovery-config', () => ({
  useDiscoveryConfig: () => DEFAULT_DISCOVERY_THRESHOLDS,
}));

let mockCrossRefIndex: ChapterCrossRefIndex | null = null;
const crossRefIndexMock = vi.fn(() => ({ index: mockCrossRefIndex, isLoading: false, error: null }));
vi.mock('@/hooks/useGnosis', () => ({
  useChapterCrossRefIndex: (...args: unknown[]) => crossRefIndexMock(...(args as [])),
}));

let mockRows: CrossRefPassageRow[] = [];
const expandMock = vi.fn();
const crossRefPassagesMock = vi.fn(() => ({ rows: mockRows, expand: expandMock }));
vi.mock('@/hooks/useCrossRefPassages', () => ({
  useCrossRefPassages: (...args: unknown[]) => crossRefPassagesMock(...(args as [])),
}));

interface HostProps {
  currentBook: string;
  currentChapter: number;
  primaryTranslationId: string | null;
  analysis: ChapterAnalysis | null;
  translationCount: number;
  primaryTranslationAbbrev: string | null;
  enabled: boolean;
}

function renderHost(initialProps: HostProps) {
  return renderHook((props: HostProps) => useDiscoveryHost(props), { initialProps });
}

const baseProps: HostProps = {
  currentBook: 'John',
  currentChapter: 1,
  primaryTranslationId: 'sword-NASB',
  analysis: makeChapterAnalysis(),
  translationCount: 1,
  primaryTranslationAbbrev: null,
  enabled: true,
};

describe('useDiscoveryHost', () => {
  beforeEach(() => {
    trackMock.mockClear();
    crossRefIndexMock.mockClear();
    crossRefPassagesMock.mockClear();
    mockCrossRefIndex = null;
    mockRows = [];
    useAnnotationStore.setState({ selection: null });
    useDiscoveryStore.setState({
      context: null,
      lens: null,
      activePrompt: null,
      activeCrossRefKey: null,
      crossRefPassages: { rows: [], expand: () => {} },
      found: null,
      markedPresetId: null,
      revealedRungs: [],
    });
    usePanelStore.setState({ activePanel: null, isCollapsed: false });
    useToastStore.setState({ toasts: [] });
  });

  // Without this, a still-mounted host from an earlier test (renderHook
  // instances aren't unmounted automatically) keeps its selection
  // subscription live and can react to a later test's `setState`, since
  // most of these tests deliberately reuse `baseProps`' book/chapter/module.
  afterEach(() => {
    cleanup();
  });

  it('publishes the atomic context to the store', () => {
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().context).toEqual(makeDiscoveryContext());
  });

  it('confirms the repetition word once the reader selects it themselves, and tracks it', () => {
    renderHost(baseProps);

    act(() => {
      useAnnotationStore.setState({ selection: makeTextSelection() });
    });

    const found = useDiscoveryStore.getState().found;
    expect(found).toMatchObject({ book: 'John', chapter: 1, translationId: 'sword-NASB' });
    expect(found?.selection.text).toBe('Word');
    expect(trackMock).toHaveBeenCalledWith('discovery_find_confirmed', { feature: 'repetition' });
  });

  it('shows a toast nudging the reader to open Discover when the panel is not open', () => {
    usePanelStore.setState({ activePanel: null });
    renderHost(baseProps);

    act(() => {
      useAnnotationStore.setState({ selection: makeTextSelection() });
    });

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ message: 'You found it — open Discover to highlight it.', variant: 'info' });
  });

  it('does not show a toast when the Discover panel is already open', () => {
    usePanelStore.setState({ activePanel: 'discovery' });
    renderHost(baseProps);

    act(() => {
      useAnnotationStore.setState({ selection: makeTextSelection() });
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does not confirm when the selection is in a different translation column', () => {
    useAnnotationStore.setState({ selection: makeTextSelection({ moduleId: 'sword-KJV', text: 'Word' }) });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('does not confirm a stale selection left over from a different chapter', () => {
    useAnnotationStore.setState({ selection: makeTextSelection({ chapter: 2, text: 'Word' }) });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('does not confirm a stale selection left over from a different book', () => {
    useAnnotationStore.setState({ selection: makeTextSelection({ book: 'Luke', text: 'Word' }) });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('does not confirm a multi-verse selection', () => {
    useAnnotationStore.setState({ selection: makeTextSelection({ endVerse: 4, text: 'Word' }) });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('does not confirm when the Discover layer is disabled', () => {
    renderHost({ ...baseProps, enabled: false });

    act(() => {
      useAnnotationStore.setState({ selection: makeTextSelection() });
    });

    expect(useDiscoveryStore.getState().found).toBeNull();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('resets lens/prompt/rungs/marked (but not context) when the bibleStore chapter changes', () => {
    const { rerender } = renderHost(baseProps);

    act(() => {
      useDiscoveryStore.setState({
        lens: 'crossRefs',
        activePrompt: makeChapterAnalysis().connectors[0],
        activeCrossRefKey: 'John.1:1:Gen.1.1',
        revealedRungs: ['range', 'first'],
        markedPresetId: 'preset-1',
      });
    });

    rerender({ ...baseProps, currentChapter: 2 });

    const state = useDiscoveryStore.getState();
    expect(state.lens).toBeNull();
    expect(state.activePrompt).toBeNull();
    expect(state.activeCrossRefKey).toBeNull();
    expect(state.revealedRungs).toEqual([]);
    expect(state.markedPresetId).toBeNull();
    // The publish effect re-runs with the new chapter, but the analysis
    // itself (still the same prop value) isn't wiped by the reset.
    expect(state.context).toEqual(makeDiscoveryContext({ chapter: 2 }));
  });

  it('clears a stale text selection when the chapter changes', () => {
    const { rerender } = renderHost(baseProps);

    act(() => {
      useAnnotationStore.setState({ selection: makeTextSelection({ chapter: 1, text: 'Something' }) });
    });
    expect(useAnnotationStore.getState().selection).not.toBeNull();

    rerender({ ...baseProps, currentChapter: 2 });

    expect(useAnnotationStore.getState().selection).toBeNull();
  });

  it('does not call clearSelection on chapter change when there is no selection', () => {
    useAnnotationStore.setState({ selection: null });
    const clearSelectionSpy = vi.spyOn(useAnnotationStore.getState(), 'clearSelection');

    const { rerender } = renderHost(baseProps);
    rerender({ ...baseProps, currentChapter: 2 });

    expect(clearSelectionSpy).not.toHaveBeenCalled();
    clearSelectionSpy.mockRestore();
  });

  it('dismisses the "you found it" toast when the chapter changes', () => {
    usePanelStore.setState({ activePanel: null });
    const { rerender } = renderHost(baseProps);

    act(() => {
      useAnnotationStore.setState({ selection: makeTextSelection() });
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);

    rerender({ ...baseProps, currentChapter: 2 });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('turns the lens off when `enabled` flips false', () => {
    const { rerender } = renderHost({ ...baseProps, enabled: true });

    act(() => {
      useDiscoveryStore.setState({ lens: 'connectors' });
    });

    rerender({ ...baseProps, enabled: false });
    expect(useDiscoveryStore.getState().lens).toBeNull();
  });

  it('loads the cross-reference index for the chapter and publishes the passages to the store', () => {
    mockCrossRefIndex = makeChapterCrossRefIndex();
    const row = makeCrossRefPassageRow();
    mockRows = [row];
    usePanelStore.setState({ activePanel: 'discovery' });

    renderHost(baseProps);

    expect(crossRefIndexMock).toHaveBeenCalledWith('John', 1, DEFAULT_DISCOVERY_THRESHOLDS.crossRefMinVotes, true);
    expect(crossRefPassagesMock).toHaveBeenCalledWith(mockCrossRefIndex.crossRefs, 'John', 1, 'sword-NASB');
    expect(useDiscoveryStore.getState().crossRefPassages).toEqual({ rows: [row], expand: expandMock });
  });

  it('passes `enabled` through to the cross-reference index query', () => {
    usePanelStore.setState({ activePanel: 'discovery' });
    renderHost({ ...baseProps, enabled: false });
    expect(crossRefIndexMock).toHaveBeenCalledWith('John', 1, DEFAULT_DISCOVERY_THRESHOLDS.crossRefMinVotes, false);
  });

  describe('cross-reference work gating', () => {
    it('does not query or fetch while the panel is closed and the lens is off', () => {
      mockCrossRefIndex = makeChapterCrossRefIndex();
      renderHost(baseProps);

      expect(crossRefIndexMock).toHaveBeenLastCalledWith('John', 1, DEFAULT_DISCOVERY_THRESHOLDS.crossRefMinVotes, false);
      expect(crossRefPassagesMock).toHaveBeenLastCalledWith([], 'John', 1, 'sword-NASB');
    });

    it('starts loading when the Discover panel opens', () => {
      mockCrossRefIndex = makeChapterCrossRefIndex();
      renderHost(baseProps);

      act(() => {
        usePanelStore.setState({ activePanel: 'discovery' });
      });

      expect(crossRefIndexMock).toHaveBeenLastCalledWith('John', 1, DEFAULT_DISCOVERY_THRESHOLDS.crossRefMinVotes, true);
      expect(crossRefPassagesMock).toHaveBeenLastCalledWith(mockCrossRefIndex.crossRefs, 'John', 1, 'sword-NASB');
    });

    it('keeps loading while the cross-reference lens is on and the panel is closed, including on the next chapter', () => {
      mockCrossRefIndex = makeChapterCrossRefIndex();
      mockRows = [makeCrossRefPassageRow()];
      const { rerender } = renderHost(baseProps);

      act(() => {
        useDiscoveryStore.setState({ lens: 'crossRefs' });
      });
      expect(crossRefIndexMock).toHaveBeenLastCalledWith('John', 1, DEFAULT_DISCOVERY_THRESHOLDS.crossRefMinVotes, true);

      rerender({ ...baseProps, currentChapter: 2 });
      act(() => {
        useDiscoveryStore.setState({ lens: 'crossRefs' });
      });
      expect(crossRefIndexMock).toHaveBeenLastCalledWith('John', 2, DEFAULT_DISCOVERY_THRESHOLDS.crossRefMinVotes, true);
      expect(crossRefPassagesMock).toHaveBeenLastCalledWith(mockCrossRefIndex.crossRefs, 'John', 2, 'sword-NASB');
    });
  });

  describe('cross-reference lens', () => {
    it('leaves the lens on when there are no rows — the reader derives "nothing to dim" itself', () => {
      mockCrossRefIndex = makeChapterCrossRefIndex();
      mockRows = [];
      renderHost(baseProps);

      act(() => {
        useDiscoveryStore.setState({ lens: 'crossRefs' });
      });

      expect(useDiscoveryStore.getState().lens).toBe('crossRefs');
    });

    it('leaves the lens on when rows exist, and leaves the connector lens alone', () => {
      mockCrossRefIndex = makeChapterCrossRefIndex();
      mockRows = [makeCrossRefPassageRow()];
      renderHost(baseProps);

      act(() => {
        useDiscoveryStore.setState({ lens: 'crossRefs' });
      });
      expect(useDiscoveryStore.getState().lens).toBe('crossRefs');

      mockRows = [];
      act(() => {
        useDiscoveryStore.setState({ lens: 'connectors' });
      });
      expect(useDiscoveryStore.getState().lens).toBe('connectors');
    });
  });
});
