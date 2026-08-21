/**
 * DiscoveryBar — the Discover-layer chip slot
 *
 * A stable insertion point in `MultiTranslationView` (Phase 1's "carve
 * insertion points" hygiene task) hosting the three teaser chips —
 * Repetition Radar, Connector Lens, entity counts. Renders nothing when the
 * Discover layer is remotely killed or there's no analysis yet, so there's
 * no layout reserve to explain away.
 */

import { useEffect, useRef } from 'react';
import { track } from '@/lib/telemetry';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { useDiscoveryEnabled, useDiscoveryConfig } from '@/lib/discovery-config';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { RepetitionChip } from './RepetitionChip';
import { ConnectorChip } from './ConnectorChip';
import { EntityChips } from './EntityChips';
import { ConnectorPrompt } from './ConnectorPrompt';
import type { ChapterAnalysis } from '@/lib/chapterAnalysis';

interface DiscoveryBarProps {
  analysis: ChapterAnalysis | null;
  translationCount: number;
  primaryTranslationName?: string;
}

export function DiscoveryBar({ analysis, translationCount, primaryTranslationName }: DiscoveryBarProps) {
  const enabled = useDiscoveryEnabled();
  const thresholds = useDiscoveryConfig();
  const book = useActiveChapterStore(s => s.book);
  const chapter = useActiveChapterStore(s => s.chapter);
  const translationId = useActiveChapterStore(s => s.translationId);

  const resetForChapter = useDiscoveryStore(s => s.resetForChapter);
  const lensActive = useDiscoveryStore(s => s.lensActive);
  const toggleLens = useDiscoveryStore(s => s.toggleLens);
  const activePrompt = useDiscoveryStore(s => s.activePrompt);
  const setActivePrompt = useDiscoveryStore(s => s.setActivePrompt);

  const connectorChipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resetForChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetForChapter is a stable store action
  }, [book, chapter, translationId]);

  const hasRepetition = Boolean(analysis?.repetition);
  const hasConnectorChip = (analysis?.connectors.length ?? 0) >= thresholds.connectorChipMinCount;
  useEffect(() => {
    if (!enabled || !book || chapter === null || !translationId) return;
    const key = `${book}:${chapter}:${translationId}`;
    if (hasRepetition) track('discovery_chip_shown', { feature: 'repetition', dedupeKey: `repetition:${key}` });
    if (hasConnectorChip) track('discovery_chip_shown', { feature: 'connector', dedupeKey: `connector:${key}` });
  }, [enabled, book, chapter, translationId, hasRepetition, hasConnectorChip]);

  const handleToggleLens = () => {
    track('lens_toggled', { feature: 'connector' });
    toggleLens();
  };

  if (!enabled || !analysis || !book || chapter === null || !translationId) return null;

  return (
    <div data-discovery-bar className="flex flex-wrap items-center gap-2 px-4 py-2 flex-shrink-0">
      <RepetitionChip
        repetition={analysis.repetition}
        translationCount={translationCount}
        primaryTranslationName={primaryTranslationName}
        book={book}
        chapter={chapter}
        translationId={translationId}
      />
      <ConnectorChip
        ref={connectorChipRef}
        count={analysis.connectors.length}
        minCount={thresholds.connectorChipMinCount}
        active={lensActive}
        onToggle={handleToggleLens}
      />
      <EntityChips book={book} chapter={chapter} />
      {activePrompt && (
        <ConnectorPrompt
          hit={activePrompt}
          triggerRef={connectorChipRef}
          onClose={() => setActivePrompt(null)}
          book={book}
          chapter={chapter}
        />
      )}
    </div>
  );
}
