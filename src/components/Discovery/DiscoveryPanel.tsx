/**
 * DiscoveryPanel — one scrolling page of Discover-layer cards
 *
 * Replaces the old chip strip (`DiscoveryBar`). Reads chapter identity from
 * `activeChapterStore`, the published analysis/translation meta/hint/found
 * state from `discoveryStore`, and entity counts from Gnosis. No props —
 * everything it needs is either already-mounted host state or store reads.
 */

import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useDiscoveryConfig } from '@/lib/discovery-config';
import { useChapterEntities } from '@/hooks/useGnosis';
import { RepetitionCard } from './RepetitionCard';
import { HingesCard } from './HingesCard';
import { PeoplePlacesCard } from './PeoplePlacesCard';

export function DiscoveryPanel() {
  const book = useActiveChapterStore(s => s.book);
  const chapter = useActiveChapterStore(s => s.chapter);
  const translationId = useActiveChapterStore(s => s.translationId);
  const analysis = useDiscoveryStore(s => s.analysis);
  const translationCount = useDiscoveryStore(s => s.translationCount);
  const primaryTranslationAbbrev = useDiscoveryStore(s => s.primaryTranslationAbbrev);
  const thresholds = useDiscoveryConfig();
  const { entities, isLoading: entitiesLoading, error: entitiesError } = useChapterEntities(
    book ?? undefined,
    chapter ?? undefined
  );

  if (!analysis) {
    return (
      <div role="dialog" aria-label="Discover" className="flex-1 min-h-0 overflow-y-auto p-3">
        <p className="text-sm text-scripture-muted">Reading the chapter…</p>
      </div>
    );
  }

  const hasRepetition = Boolean(analysis.repetition);
  const hasHinges = analysis.connectors.length >= thresholds.connectorChipMinCount;
  const hasEntities =
    !entitiesLoading && !entitiesError && !!entities && (entities.people.length > 0 || entities.places.length > 0);
  const hasAnything = hasRepetition || hasHinges || hasEntities;

  return (
    <div role="dialog" aria-label="Discover" className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
      {!hasAnything ? (
        <div className="bg-scripture-surface border border-scripture-border rounded-lg p-3">
          <p className="text-sm text-scripture-muted">Nothing stands out here — just read.</p>
        </div>
      ) : (
        <>
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
          {hasHinges && book && chapter !== null && (
            <HingesCard
              connectors={analysis.connectors}
              minCount={thresholds.connectorChipMinCount}
              book={book}
              chapter={chapter}
            />
          )}
          <PeoplePlacesCard entities={entities} isLoading={entitiesLoading} error={entitiesError} />
        </>
      )}
    </div>
  );
}
