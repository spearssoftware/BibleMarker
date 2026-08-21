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
import { useChapterEntities } from '@/hooks/useGnosis';
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
  const setLensActive = useDiscoveryStore(s => s.setLensActive);
  const activePrompt = useDiscoveryStore(s => s.activePrompt);
  const setActivePrompt = useDiscoveryStore(s => s.setActivePrompt);

  const connectorChipRef = useRef<HTMLDivElement>(null);
  const { entities, isLoading: entitiesLoading, error: entitiesError } = useChapterEntities(book ?? undefined, chapter ?? undefined, enabled);

  useEffect(() => {
    resetForChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetForChapter is a stable store action
  }, [book, chapter, translationId]);

  useEffect(() => {
    // The kill-switch (or a losing race with a chapter that turns out to have
    // no analysis) can turn `enabled` off while the lens is mid-toggle —
    // clear it so VerseText doesn't keep dimming with no chip left to
    // control it.
    if (!enabled) setLensActive(false);
  }, [enabled, setLensActive]);

  const hasRepetition = Boolean(analysis?.repetition);
  const hasConnectorChip = (analysis?.connectors.length ?? 0) >= thresholds.connectorChipMinCount;
  const hasEntityChip =
    !entitiesLoading && !entitiesError && !!entities && (entities.people.length > 0 || entities.places.length > 0);
  const hasAnyChip = hasRepetition || hasConnectorChip || hasEntityChip;

  useEffect(() => {
    if (!enabled || !book || chapter === null || !translationId) return;
    const key = `${book}:${chapter}:${translationId}`;
    if (hasRepetition) track('discovery_chip_shown', { feature: 'repetition', dedupeKey: `repetition:${key}` });
    if (hasConnectorChip) track('discovery_chip_shown', { feature: 'connector', dedupeKey: `connector:${key}` });
    if (hasEntityChip) track('discovery_chip_shown', { feature: 'entity', dedupeKey: `entity:${key}` });
  }, [enabled, book, chapter, translationId, hasRepetition, hasConnectorChip, hasEntityChip]);

  const handleToggleLens = () => {
    track('lens_toggled', { feature: 'connector' });
    toggleLens();
  };

  if (!enabled || !analysis || !book || chapter === null || !translationId || !hasAnyChip) return null;

  return (
    <div data-discovery-bar className="flex flex-wrap items-center gap-2 px-4 py-2 flex-shrink-0">
      <RepetitionChip
        repetition={analysis.repetition}
        translationCount={translationCount}
        primaryTranslationName={primaryTranslationName}
        book={book}
        chapter={chapter}
        translationId={translationId}
        entities={entities}
      />
      <ConnectorChip
        ref={connectorChipRef}
        count={analysis.connectors.length}
        minCount={thresholds.connectorChipMinCount}
        active={lensActive}
        onToggle={handleToggleLens}
      />
      <EntityChips entities={entities} isLoading={entitiesLoading} error={entitiesError} />
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
