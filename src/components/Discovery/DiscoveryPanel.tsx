/**
 * DiscoveryPanel — one scrolling page of Discover-layer cards
 *
 * Replaces the old chip strip (`DiscoveryBar`). Reads the atomic chapter
 * context (identity + analysis + translation meta) published by
 * `useDiscoveryHost`, plus entity counts from Gnosis. No props — everything
 * it needs is either already-mounted host state or store reads.
 *
 * `discovery_chip_shown` telemetry lives here (not in `useDiscoveryHost`,
 * which is always-mounted) so it fires only when the panel actually renders
 * a repetition/hinges card, not merely when the chapter analysis exists.
 *
 * Entity resolution races the chapter-analysis publish: `entities === null`
 * is ambiguous between "still loading" and "Gnosis has nothing" until
 * `useChapterEntities` also reports `isLoading`/`error`, so the "nothing
 * stands out" empty state is held back until entities have definitely
 * resolved (or errored).
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useDiscoveryConfig, useDiscoveryEnabled } from '@/lib/discovery-config';
import { useChapterEntities } from '@/hooks/useGnosis';
import { track } from '@/lib/telemetry';
import { RepetitionCard } from './RepetitionCard';
import { HingesCard } from './HingesCard';
import { PeoplePlacesCard } from './PeoplePlacesCard';

function DiscoveryDialog({ children }: { children: ReactNode }) {
  return (
    <div role="dialog" aria-label="Discover" aria-modal="true" className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar space-y-3">
        {children}
      </div>
    </div>
  );
}

export function DiscoveryPanel() {
  const context = useDiscoveryStore(s => s.context);
  const thresholds = useDiscoveryConfig();
  const discoveryEnabled = useDiscoveryEnabled();
  const { entities, isLoading: entitiesLoading, error: entitiesError } = useChapterEntities(
    context?.book,
    context?.chapter,
    discoveryEnabled
  );

  const book = context?.book ?? null;
  const chapter = context?.chapter ?? null;
  const translationId = context?.translationId ?? null;
  const analysis = context?.analysis ?? null;
  const translationCount = context?.translationCount ?? 1;
  const primaryTranslationAbbrev = context?.primaryTranslationAbbrev ?? null;

  const hasRepetition = Boolean(analysis?.repetition);
  const hingeCount = analysis?.connectors.length ?? 0;
  const showHinges = hingeCount >= thresholds.connectorChipMinCount;

  // Fire once per {book, chapter, translation} for each card actually shown —
  // mirrors the dedupe keys the old `useDiscoveryHost`-hosted version used.
  useEffect(() => {
    if (!discoveryEnabled || !book || chapter === null || !translationId) return;
    const key = `${book}:${chapter}:${translationId}`;
    if (hasRepetition) track('discovery_chip_shown', { feature: 'repetition', dedupeKey: `repetition:${key}` });
    if (showHinges) track('discovery_chip_shown', { feature: 'connector', dedupeKey: `connector:${key}` });
  }, [discoveryEnabled, book, chapter, translationId, hasRepetition, showHinges]);

  if (!discoveryEnabled) {
    return <DiscoveryDialog><p className="text-sm text-scripture-muted">Discover is turned off right now.</p></DiscoveryDialog>;
  }

  const entitiesStillLoading = entitiesLoading || (entities === null && !entitiesError);

  if (!analysis || (!hasRepetition && !showHinges && entitiesStillLoading)) {
    return <DiscoveryDialog><p className="text-sm text-scripture-muted">Reading the chapter…</p></DiscoveryDialog>;
  }

  const hasEntities = !!entities && (entities.people.length > 0 || entities.places.length > 0);
  const hasAnything = hasRepetition || showHinges || hasEntities;

  if (!hasAnything) {
    return (
      <DiscoveryDialog>
        <div className="bg-scripture-surface border border-scripture-border rounded-lg p-3">
          <p className="text-sm text-scripture-muted">Nothing stands out here — just read.</p>
        </div>
      </DiscoveryDialog>
    );
  }

  return (
    <DiscoveryDialog>
      {hasRepetition && book && chapter !== null && translationId && (
        <RepetitionCard
          repetition={analysis.repetition}
          translationCount={translationCount}
          primaryTranslationAbbrev={primaryTranslationAbbrev}
          book={book}
          chapter={chapter}
          translationId={translationId}
          entities={entities}
        />
      )}
      {showHinges && book && chapter !== null && (
        <HingesCard
          connectorRangesByVerse={analysis.connectorRangesByVerse}
          hingeCount={hingeCount}
          book={book}
          chapter={chapter}
        />
      )}
      <PeoplePlacesCard entities={entities} isLoading={entitiesLoading} error={entitiesError} />
    </DiscoveryDialog>
  );
}
