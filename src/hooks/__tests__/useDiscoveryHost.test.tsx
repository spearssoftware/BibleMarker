/**
 * @vitest-environment jsdom
 *
 * useDiscoveryHost owns the Discover-layer state that must keep working
 * while the reader reads even though the Discover panel is usually
 * unmounted: the chapter-change reset, publishing analysis/translation meta,
 * lens auto-off, and the repetition "find" confirmation ported from the old
 * `RepetitionChip`'s confirm effect (moduleId/book/chapter/single-verse
 * guards included).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiscoveryHost } from '../useDiscoveryHost';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import type { ChapterAnalysis, ConnectorHit } from '@/lib/chapterAnalysis';

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

describe('useDiscoveryHost', () => {
  beforeEach(() => {
    useAnnotationStore.setState({ selection: null });
    useDiscoveryStore.setState({
      analysis: null,
      translationCount: 1,
      primaryTranslationAbbrev: null,
      lensActive: false,
      activePrompt: null,
      found: null,
      markedPresetId: null,
      revealedHints: 0,
    });
  });

  it('publishes the analysis to the store', () => {
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().analysis).toEqual(makeAnalysis());
  });

  it('confirms the repetition word once the reader selects it themselves', () => {
    renderHost(baseProps);

    act(() => {
      useAnnotationStore.setState({
        selection: {
          moduleId: 'sword-NASB',
          book: 'John',
          chapter: 1,
          startVerse: 3,
          endVerse: 3,
          text: 'Words',
        },
      });
    });

    const found = useDiscoveryStore.getState().found;
    expect(found).toMatchObject({ book: 'John', chapter: 1, translationId: 'sword-NASB' });
    expect(found?.selection.text).toBe('Words');
  });

  it('does not confirm when the selection is in a different translation column', () => {
    useAnnotationStore.setState({
      selection: { moduleId: 'sword-KJV', book: 'John', chapter: 1, startVerse: 3, endVerse: 3, text: 'Word' },
    });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('does not confirm a stale selection left over from a different chapter', () => {
    useAnnotationStore.setState({
      selection: { moduleId: 'sword-NASB', book: 'John', chapter: 2, startVerse: 3, endVerse: 3, text: 'Word' },
    });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('does not confirm a stale selection left over from a different book', () => {
    useAnnotationStore.setState({
      selection: { moduleId: 'sword-NASB', book: 'Luke', chapter: 1, startVerse: 3, endVerse: 3, text: 'Word' },
    });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('does not confirm a multi-verse selection', () => {
    useAnnotationStore.setState({
      selection: { moduleId: 'sword-NASB', book: 'John', chapter: 1, startVerse: 3, endVerse: 4, text: 'Word' },
    });
    renderHost(baseProps);
    expect(useDiscoveryStore.getState().found).toBeNull();
  });

  it('resets lens/prompt/hints/marked (but not analysis) when the bibleStore chapter changes', () => {
    const { rerender } = renderHost(baseProps);

    act(() => {
      useDiscoveryStore.setState({
        lensActive: true,
        activePrompt: makeAnalysis().connectors[0],
        revealedHints: 2,
        markedPresetId: 'preset-1',
      });
    });

    rerender({ ...baseProps, currentChapter: 2 });

    const state = useDiscoveryStore.getState();
    expect(state.lensActive).toBe(false);
    expect(state.activePrompt).toBeNull();
    expect(state.revealedHints).toBe(0);
    expect(state.markedPresetId).toBeNull();
    expect(state.analysis).toEqual(makeAnalysis());
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
