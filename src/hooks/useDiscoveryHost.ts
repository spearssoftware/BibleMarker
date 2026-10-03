/**
 * useDiscoveryHost
 *
 * Owns the Discover-layer state that must keep working while the reader
 * reads even though the Discover panel itself is usually unmounted: the
 * chapter-change reset (including clearing a stale text selection so it
 * can't re-confirm the repetition word after navigating away and back),
 * publishing the atomic chapter context to the store, the lens auto-off, the
 * cross-reference passages (the cross-reference lens needs them to know
 * which verses to light while the panel is closed), and the repetition
 * "find" confirmation (ported from the old `RepetitionChip`'s confirm
 * effect). On confirm, if the Discover panel isn't open to show the result,
 * a toast nudges the reader to open it. Call once from
 * `MultiTranslationView`.
 *
 * `discovery_chip_shown` telemetry does NOT live here — it moved to
 * `DiscoveryPanel` so it fires only when a card is actually rendered rather
 * than whenever this always-mounted hook sees analysis.
 */

import { useEffect, useRef } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePanelStore } from '@/stores/panelStore';
import { toast, useToastStore } from '@/stores/toastStore';
import { track } from '@/lib/telemetry';
import { normalizeForMatching } from '@/lib/keywordMatching';
import { useDiscoveryConfig } from '@/lib/discovery-config';
import { singularize, type ChapterAnalysis } from '@/lib/chapterAnalysis';
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
  const found = useDiscoveryStore(s => s.found);
  const setFound = useDiscoveryStore(s => s.setFound);
  const selection = useAnnotationStore(s => s.selection);
  // Id of the "you found it" toast shown below, so the chapter-reset effect
  // can dismiss it explicitly rather than leaving a stale nudge on screen
  // for a chapter the reader has already left.
  const foundToastIdRef = useRef<string | null>(null);

  // 1. Reset all Discover UI state when the chapter changes, and clear any
  // leftover text selection with it — otherwise a selection made just before
  // navigating away could re-confirm the repetition word for the new
  // chapter the moment its analysis (coincidentally) matches. Keyed on the
  // bibleStore-sourced values, which change *before* the new chapter's text
  // arrives — useChapterAnalysis's identity guard already returns null for
  // the old chapter by the time this fires, so there's no race with a stale
  // `analysis`. Declared before the publish effect below.
  useEffect(() => {
    resetForChapter();
    if (useAnnotationStore.getState().selection !== null) {
      useAnnotationStore.getState().clearSelection();
    }
    if (foundToastIdRef.current) {
      useToastStore.getState().dismiss(foundToastIdRef.current);
      foundToastIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetForChapter/clearSelection are stable store actions
  }, [currentBook, currentChapter, primaryTranslationId]);

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
  // Only do the work (index query + up to 6 chapter fetches) while something
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

  // 5. Repetition confirm: once the reader selects the exact word themselves
  // in the primary translation column, mark it found. If the Discover panel
  // isn't open to show the result, nudge the reader toward it with a toast.
  const repetition = analysis?.repetition ?? null;
  const isFound =
    found?.book === currentBook &&
    found?.chapter === currentChapter &&
    found?.translationId === primaryTranslationId;

  useEffect(() => {
    if (!enabled || !repetition || isFound || !selection || !primaryTranslationId) return;
    if (selection.moduleId !== primaryTranslationId) return;
    if (selection.book !== currentBook || selection.chapter !== currentChapter) return;
    if (selection.startVerse !== selection.endVerse) return;
    const normalized = singularize(normalizeForMatching(selection.text));
    if (normalized === repetition.token) {
      setFound({
        book: currentBook,
        chapter: currentChapter,
        translationId: primaryTranslationId,
        selection,
      });
      track('discovery_find_confirmed', { feature: 'repetition' });
      if (usePanelStore.getState().activePanel !== 'discovery') {
        foundToastIdRef.current = toast.info('You found it — open Discover to highlight it.');
      }
    }
  }, [enabled, selection, repetition, isFound, primaryTranslationId, currentBook, currentChapter, setFound]);
}
