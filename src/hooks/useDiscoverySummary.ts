/**
 * useDiscoverySummary
 *
 * Derives the Discover-layer badge/gating state from `discoveryStore` + the
 * remote thresholds. A hook rather than a plain store selector because
 * zustand v5 rejects selectors that return a fresh object identity on every
 * call (the repo has no `useShallow` usage), so the composition is memoized
 * here instead.
 *
 * `hasOpenChallenge` means "a challenge you haven't resolved yet" — hinges
 * and entities are always-available tools, not challenges, so they never
 * contribute to the badge (otherwise the dot would be permanent). The dot
 * stays lit through the reader *finding* the word — it only clears once
 * they act on it via "Highlight it…" / "Mark it as a key word"
 * (`markedPresetId` set), since finding it without marking it still leaves
 * something to do.
 */

import { useMemo } from 'react';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useDiscoveryConfig } from '@/lib/discovery-config';

export interface DiscoverySummary {
  hasRepetition: boolean;
  showHinges: boolean;
  hasOpenChallenge: boolean;
}

export function useDiscoverySummary(): DiscoverySummary {
  const analysis = useDiscoveryStore(s => s.analysis);
  const markedPresetId = useDiscoveryStore(s => s.markedPresetId);
  const thresholds = useDiscoveryConfig();

  return useMemo(() => {
    const hasRepetition = Boolean(analysis?.repetition);
    const hingeCount = analysis?.connectors.length ?? 0;
    const showHinges = hingeCount >= thresholds.connectorChipMinCount;
    const hasOpenChallenge = hasRepetition && !markedPresetId;

    return { hasRepetition, showHinges, hasOpenChallenge };
  }, [analysis, markedPresetId, thresholds]);
}
