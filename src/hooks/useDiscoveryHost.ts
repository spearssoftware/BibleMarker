/**
 * useDiscoveryHost
 *
 * Owns the Discover-layer state that must keep working while the reader
 * reads even though the Discover panel itself is usually unmounted: the
 * chapter-change reset, publishing analysis/translation meta to the store,
 * the lens auto-off, the repetition "find" confirmation (ported from the
 * old `RepetitionChip`'s confirm effect), and `discovery_chip_shown`
 * telemetry. Call once from `MultiTranslationView`.
 */

import { useEffect } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useDiscoveryConfig } from '@/lib/discovery-config';
import { track } from '@/lib/telemetry';
import { normalizeForMatching } from '@/lib/keywordMatching';
import { singularize, type ChapterAnalysis } from '@/lib/chapterAnalysis';

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
  const thresholds = useDiscoveryConfig();
  const resetForChapter = useDiscoveryStore(s => s.resetForChapter);
  const setAnalysis = useDiscoveryStore(s => s.setAnalysis);
  const setTranslationMeta = useDiscoveryStore(s => s.setTranslationMeta);
  const setLensActive = useDiscoveryStore(s => s.setLensActive);
  const found = useDiscoveryStore(s => s.found);
  const setFound = useDiscoveryStore(s => s.setFound);
  const selection = useAnnotationStore(s => s.selection);

  // 1. Reset all Discover UI state when the chapter changes. Keyed on the
  // bibleStore-sourced values, which change *before* the new chapter's text
  // arrives — useChapterAnalysis's identity guard already returns null for
  // the old chapter by the time this fires, so there's no race with a stale
  // `analysis`. Declared before the publish effect below.
  useEffect(() => {
    resetForChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetForChapter is a stable store action
  }, [currentBook, currentChapter, primaryTranslationId]);

  // 2. Publish analysis + translation meta so the panel (usually unmounted)
  // can read them on demand.
  useEffect(() => {
    setAnalysis(analysis);
  }, [analysis, setAnalysis]);

  useEffect(() => {
    setTranslationMeta(translationCount, primaryTranslationAbbrev);
  }, [translationCount, primaryTranslationAbbrev, setTranslationMeta]);

  // 3. The kill-switch (or a losing race with a chapter that turns out to
  // have no analysis) can turn `enabled` off while the lens is mid-toggle —
  // clear it so VerseText doesn't keep dimming with no control left for it.
  useEffect(() => {
    if (!enabled) setLensActive(false);
  }, [enabled, setLensActive]);

  // 4. Repetition confirm: once the reader selects the exact word themselves
  // in the primary translation column, mark it found.
  const repetition = analysis?.repetition ?? null;
  const isFound =
    found?.book === currentBook &&
    found?.chapter === currentChapter &&
    found?.translationId === primaryTranslationId;

  useEffect(() => {
    if (!repetition || isFound || !selection || !primaryTranslationId) return;
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
    }
  }, [selection, repetition, isFound, primaryTranslationId, currentBook, currentChapter, setFound]);

  // 5. `discovery_chip_shown` telemetry, deduped per {book, chapter, translation}
  // per session — same dedupe keys the old DiscoveryBar used.
  const hasRepetition = Boolean(analysis?.repetition);
  const hasConnectorChip = (analysis?.connectors.length ?? 0) >= thresholds.connectorChipMinCount;

  useEffect(() => {
    if (!enabled || !currentBook || currentChapter == null || !primaryTranslationId) return;
    const key = `${currentBook}:${currentChapter}:${primaryTranslationId}`;
    if (hasRepetition) track('discovery_chip_shown', { feature: 'repetition', dedupeKey: `repetition:${key}` });
    if (hasConnectorChip) track('discovery_chip_shown', { feature: 'connector', dedupeKey: `connector:${key}` });
  }, [enabled, currentBook, currentChapter, primaryTranslationId, hasRepetition, hasConnectorChip]);
}
