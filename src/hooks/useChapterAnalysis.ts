/**
 * useChapterAnalysis
 *
 * Runs the Discover-layer chapter analysis (Repetition Radar + Connector
 * Lens) against the primary translation's currently-loaded chapter text.
 *
 * Reads `useActiveChapterStore` rather than re-fetching — that store already
 * caches `{translationId, book, chapter, verses}` for exactly this purpose
 * (see `MultiTranslationView.loadChapters`). Because the store can briefly
 * hold the *previous* chapter's text while a fetch is in flight (or the old
 * primary's text when the primary column changes to an already-loaded
 * column), this guards on an identity match against the caller's current
 * book/chapter/translationId before running analysis — same guard shape as
 * `ChapterAtAGlance.tsx`.
 */

import { useMemo } from 'react';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { useDiscoveryEnabled, useDiscoveryConfig } from '@/lib/discovery-config';
import { analyzeChapter } from '@/lib/chapterAnalysis';
import type { ChapterAnalysis } from '@/lib/chapterAnalysis';

export function useChapterAnalysis(
  currentBook: string | null | undefined,
  currentChapter: number | null | undefined,
  primaryTranslationId: string | null | undefined
): ChapterAnalysis | null {
  const enabled = useDiscoveryEnabled();
  const thresholds = useDiscoveryConfig();
  const book = useActiveChapterStore(state => state.book);
  const chapter = useActiveChapterStore(state => state.chapter);
  const translationId = useActiveChapterStore(state => state.translationId);
  const verses = useActiveChapterStore(state => state.verses);

  const isActiveChapter =
    book === currentBook && chapter === currentChapter && translationId === primaryTranslationId;

  return useMemo(() => {
    if (!enabled || !isActiveChapter) return null;
    return analyzeChapter(verses, thresholds);
  }, [verses, thresholds, enabled, isActiveChapter]);
}
