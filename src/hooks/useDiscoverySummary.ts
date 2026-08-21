/**
 * useDiscoverySummary
 *
 * Derives the Discover-layer badge/gating state from `discoveryStore` +
 * `activeChapterStore` + the remote thresholds. A hook rather than a plain
 * store selector because zustand v5 rejects selectors that return a fresh
 * object identity on every call (the repo has no `useShallow` usage), so the
 * composition is memoized here instead.
 *
 * `hasOpenChallenge` means "a challenge you haven't solved yet" — hinges and
 * entities are always-available tools, not challenges, so they never
 * contribute to the badge (otherwise the dot would be permanent). The dot
 * clears the moment the reader *finds* the word, before they press
 * "Highlight it" / "Mark it as a key word".
 */

import { useMemo } from 'react';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { useDiscoveryConfig } from '@/lib/discovery-config';

export interface DiscoverySummary {
  hasRepetition: boolean;
  repetitionFound: boolean;
  hingeCount: number;
  showHinges: boolean;
  hasOpenChallenge: boolean;
}

export function useDiscoverySummary(): DiscoverySummary {
  const analysis = useDiscoveryStore(s => s.analysis);
  const found = useDiscoveryStore(s => s.found);
  const book = useActiveChapterStore(s => s.book);
  const chapter = useActiveChapterStore(s => s.chapter);
  const translationId = useActiveChapterStore(s => s.translationId);
  const thresholds = useDiscoveryConfig();

  return useMemo(() => {
    const hasRepetition = Boolean(analysis?.repetition);
    const repetitionFound = Boolean(
      found && found.book === book && found.chapter === chapter && found.translationId === translationId
    );
    const hingeCount = analysis?.connectors.length ?? 0;
    const showHinges = hingeCount >= thresholds.connectorChipMinCount;
    const hasOpenChallenge = hasRepetition && !repetitionFound;

    return { hasRepetition, repetitionFound, hingeCount, showHinges, hasOpenChallenge };
  }, [analysis, found, book, chapter, translationId, thresholds]);
}
