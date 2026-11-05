/**
 * useDiscoveryHost
 *
 * Owns the Discover-layer state that must keep working while the reader
 * reads even though the Discover panel itself is usually unmounted: the
 * chapter-change reset (including clearing a stale text selection, so the
 * selection menu can't act on the previous chapter's verse), publishing the
 * atomic chapter context to the store, the lens auto-off, and the
 * cross-reference passages (the cross-reference lens needs them to know
 * which verses to light while the panel is closed).
 * Call once from `MultiTranslationView`.
 *
 * `discovery_chip_shown` telemetry does NOT live here — it moved to
 * `DiscoveryPanel` so it fires only when a card is actually rendered rather
 * than whenever this always-mounted hook sees analysis.
 */

import { useEffect } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePanelStore } from '@/stores/panelStore';
import { useDiscoveryConfig } from '@/lib/discovery-config';
import type { ChapterAnalysis } from '@/lib/chapterAnalysis';
import type { ChapterCrossRef } from '@/types';
import { useChapterCrossRefIndex } from '@/hooks/useGnosis';
import { useCrossRefPassages } from '@/hooks/useCrossRefPassages';

const NO_CROSS_REFS: ChapterCrossRef[] = [];

interface UseDiscoveryHostOptions {
  currentBook: string;
  currentChapter: number;
  primaryTranslationId: string | null;
  analysis: ChapterAnalysis | null;
  translationCount: number;
  primaryTranslationAbbrev: string | null;
  enabled: boolean;
}

export function useDiscoveryHost({
  currentBook,
  currentChapter,
  primaryTranslationId,
  analysis,
  translationCount,
  primaryTranslationAbbrev,
  enabled,
}: UseDiscoveryHostOptions): void {
  const resetForChapter = useDiscoveryStore(s => s.resetForChapter);
  const setContext = useDiscoveryStore(s => s.setContext);
  const setLens = useDiscoveryStore(s => s.setLens);
  const setCrossRefPassages = useDiscoveryStore(s => s.setCrossRefPassages);
  const setLaterCrossRefPassages = useDiscoveryStore(s => s.setLaterCrossRefPassages);

  // 1. Reset all Discover UI state when the chapter changes, and clear any
  // leftover text selection with it — otherwise the selection menu stays up
  // and acts on a verse of the chapter the reader just left. Keyed on the
  // bibleStore-sourced values, which change *before* the new chapter's text
  // arrives. Declared before the publish effect below.
  useEffect(() => {
    resetForChapter();
    if (useAnnotationStore.getState().selection !== null) {
      useAnnotationStore.getState().clearSelection();
    }
  }, [currentBook, currentChapter, primaryTranslationId, resetForChapter]);

  // 2. Publish chapter identity + analysis + translation meta as one atomic
  // context so the panel (usually unmounted) never reads a chapter's
  // analysis paired with a different chapter's translation meta.
  useEffect(() => {
    if (!analysis || !primaryTranslationId) {
      setContext(null);
      return;
    }
    setContext({
      book: currentBook,
      chapter: currentChapter,
      translationId: primaryTranslationId,
      analysis,
      translationCount,
      primaryTranslationAbbrev,
    });
  }, [analysis, currentBook, currentChapter, primaryTranslationId, translationCount, primaryTranslationAbbrev, setContext]);

  // 3. The kill-switch (or a losing race with a chapter that turns out to
  // have no analysis) can turn `enabled` off while the lens is mid-toggle —
  // clear it so VerseText doesn't keep dimming with no control left for it.
  useEffect(() => {
    if (!enabled) setLens(null);
  }, [enabled, setLens]);

  // 4. Cross-reference passages: loaded here rather than in the card so the
  // cross-reference lens can light the right verses while the panel is
  // closed, and so a row's fetched passage survives the panel closing.
  const { crossRefMinVotes } = useDiscoveryConfig();
  // Only do the work (index query + up to 6 chapter fetches per direction) while something
  // can show it: the Discover panel is open, or the lens is already on.
  const discoverOpen = usePanelStore(s => s.activePanel === 'discovery');
  const lens = useDiscoveryStore(s => s.lens);
  const crossRefsActive = enabled && (discoverOpen || lens === 'crossRefs');
  const { index: crossRefIndex } = useChapterCrossRefIndex(currentBook, currentChapter, crossRefMinVotes, crossRefsActive);
  const { rows, expand } = useCrossRefPassages(
    crossRefsActive ? crossRefIndex?.crossRefs ?? NO_CROSS_REFS : NO_CROSS_REFS,
    currentBook,
    currentChapter,
    primaryTranslationId ?? ''
  );
  useEffect(() => {
    setCrossRefPassages({ rows, expand });
  }, [rows, expand, setCrossRefPassages]);
  const { rows: laterRows, expand: laterExpand } = useCrossRefPassages(
    crossRefsActive ? crossRefIndex?.laterCrossRefs ?? NO_CROSS_REFS : NO_CROSS_REFS,
    currentBook,
    currentChapter,
    primaryTranslationId ?? '',
    { order: 'votes' }
  );
  useEffect(() => {
    setLaterCrossRefPassages({ rows: laterRows, expand: laterExpand });
  }, [laterRows, laterExpand, setLaterCrossRefPassages]);
}
