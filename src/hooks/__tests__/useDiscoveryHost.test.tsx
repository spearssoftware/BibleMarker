/**
 * @vitest-environment jsdom
 *
 * useDiscoveryHost owns the Discover-layer state that must keep working
 * while the reader reads even though the Discover panel is usually
 * unmounted: the chapter-change reset (including clearing a stale text
 * selection), publishing analysis/translation meta, lens auto-off, and the
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
import type { DiscoveryContext } from '@/stores/discoveryStore';
import type { ChapterAnalysis, ConnectorHit } from '@/lib/chapterAnalysis';

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

function makeAnalysis(): ChapterAnalysis {
  const hit: ConnectorHit = { phrase: 'therefore', category: 'conclusion', verse: 1, start: 0, end: 9 };
  return {
    repetition: { token: 'word', count: 11, firstVerse: 1, lastVerse: 14, occurrences: [], forms: ['word', 'words'] },
    connectors: [hit],
    connectorRangesByVerse: new Map([[1, [hit]]]),
  };
}

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
  analysis: makeAnalysis(),
  translationCount: 1,
  primaryTranslationAbbrev: null,
  enabled: true,
};

function makeContext(overrides: Partial<DiscoveryContext> = {}): DiscoveryContext {
  return {
    book: 'John',
    chapter: 1,
    translationId: 'sword-NASB',
    analysis: makeAnalysis(),
    translationCount: 1,
    primaryTranslationAbbrev: null,
    ...overrides,
  };
}

function makeSelection(overrides: Partial<{ moduleId: string; book: string; chapter: number; startVerse: number; endVerse: number; text: string }> = {}) {
  return {
    moduleId: 'sword-NASB',
    book: 'John',
    chapter: 1,
    startVerse: 3,
    endVerse: 3,
    text: 'Words',
    ...overrides,
  };
}

describe('useDiscoveryHost', () => {
  beforeEach(() => {
    trackMock.mockClear();
    useAnnotationStore.setState({ selection: null });
    useDiscoveryStore.setState({
      context: null,
      lensActive: false,
      activePrompt: null,
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
    expect(useDiscoveryStore.getState().context).toEqual(makeContext());
  });

  it('confirms the repetition word once the reader selects it themselves, and tracks it', () => {
    renderHost(baseProps);

    act(() => {
      useAnnotationStore.setState({ selection: makeSelection() });
    });

    const found = useDiscoveryStore.getState().found;
    expect(found).toMatchObject({ book: 'John', chapter: 1, translationId: 'sword-NASB' });
    expect(found?.selection.text).toBe('Words');
    expect(trackMock).toHaveBeenCalledWith('discovery_find_confirmed', { feature: 'repetition' });
  });

  it('shows a toast nudging the reader to open Discover when the panel is not open', () => {
    usePanelStore.setState({ activePanel: null });
    renderHost(baseProps);

    act(() => {
      useAnnotationStore.setState({ selection: makeSelection() });
    });

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ message: 'You found it — open Discover to highlight it.', variant: 'info' });
  });

  it('does not show a toast when the Discover panel is already open', () => {
    usePanelStore.setState({ activePanel: 'discovery' });
    renderHost(baseProps);

    act(() => {
      useAnnotationStore.setState({ selection: makeSelection() });
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does not confirm when the selection is in a different translation column', () => {
    useAnnotationStore.setState({ selection: makeSelection({ moduleId: 'sword-KJV', text: 'Word' }) });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('does not confirm a stale selection left over from a different chapter', () => {
    useAnnotationStore.setState({ selection: makeSelection({ chapter: 2, text: 'Word' }) });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('does not confirm a stale selection left over from a different book', () => {
    useAnnotationStore.setState({ selection: makeSelection({ book: 'Luke', text: 'Word' }) });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('does not confirm a multi-verse selection', () => {
    useAnnotationStore.setState({ selection: makeSelection({ endVerse: 4, text: 'Word' }) });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('does not confirm when the Discover layer is disabled', () => {
    renderHost({ ...baseProps, enabled: false });

    act(() => {
      useAnnotationStore.setState({ selection: makeSelection() });
    });

    expect(useDiscoveryStore.getState().found).toBeNull();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('resets lens/prompt/rungs/marked (but not context) when the bibleStore chapter changes', () => {
    const { rerender } = renderHost(baseProps);

    act(() => {
      useDiscoveryStore.setState({
        lensActive: true,
        activePrompt: makeAnalysis().connectors[0],
        revealedRungs: ['range', 'first'],
        markedPresetId: 'preset-1',
      });
    });

    rerender({ ...baseProps, currentChapter: 2 });

    const state = useDiscoveryStore.getState();
    expect(state.lensActive).toBe(false);
    expect(state.activePrompt).toBeNull();
    expect(state.revealedRungs).toEqual([]);
    expect(state.markedPresetId).toBeNull();
    // The publish effect re-runs with the new chapter, but the analysis
    // itself (still the same prop value) isn't wiped by the reset.
    expect(state.context).toEqual(makeContext({ chapter: 2 }));
  });

  it('clears a stale text selection when the chapter changes', () => {
    const { rerender } = renderHost(baseProps);

    act(() => {
      useAnnotationStore.setState({ selection: makeSelection({ chapter: 1, text: 'Something' }) });
    });
    expect(useAnnotationStore.getState().selection).not.toBeNull();

    rerender({ ...baseProps, currentChapter: 2 });

    expect(useAnnotationStore.getState().selection).toBeNull();
  });

  it('turns the lens off when `enabled` flips false', () => {
    const { rerender } = renderHost({ ...baseProps, enabled: true });

    act(() => {
      useDiscoveryStore.setState({ lensActive: true });
    });

    rerender({ ...baseProps, enabled: false });
    expect(useDiscoveryStore.getState().lensActive).toBe(false);
  });
});
