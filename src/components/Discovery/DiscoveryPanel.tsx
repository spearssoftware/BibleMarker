/**
 * DiscoveryPanel — one scrolling page of Discover-layer cards
 *
 * Replaces the old chip strip (`DiscoveryBar`). Reads the atomic chapter
 * context (identity + analysis + translation meta) published by
 * `useDiscoveryHost`, plus entity counts from Gnosis. No props — everything
 * it needs is either already-mounted host state or store reads.
 *
 * Card order: Genre Compass → Look-Again checklist → Repetition → Connectors →
 * Cross-References → People & Places. Genre and the Look-Again title item need
 * neither analysis extras nor Gnosis, so the loading gate is `!context` only
 * (S5) — a Gnosis hiccup must not blank the whole panel. Each card after
 * Look-Again is wrapped in a stable-id `div`; the first three are also
 * `LookAgainCard` scroll targets for its undone rows (Cross-References has no
 * checklist item — see the Phase 2b plan's deliberate deltas).
 *
 * `discovery_chip_shown` telemetry lives here (not in `useDiscoveryHost`,
 * which is always-mounted) so it fires only when the panel actually renders
 * a repetition/connector/cross-reference/entity card, not merely when the chapter analysis
 * exists. The cross-reference rows themselves are loaded by `useDiscoveryHost`
 * (the cross-reference lens needs them while the panel is closed) and read
 * from the store here.
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useDiscoveryConfig, useDiscoveryEnabled } from '@/lib/discovery-config';
import { useChapterEntities } from '@/hooks/useGnosis';
import { useLookAgain } from '@/hooks/useLookAgain';
import { shouldShowConnectors } from '@/lib/chapterAnalysis';
import { track } from '@/lib/telemetry';
import { GenreCard } from './GenreCard';
import { LookAgainCard } from './LookAgainCard';
import { RepetitionCard } from './RepetitionCard';
import { ConnectorsCard } from './ConnectorsCard';
import { CrossRefsCard } from './CrossRefsCard';
import { PeoplePlacesCard } from './PeoplePlacesCard';

const REPETITION_ANCHOR_ID = 'discovery-card-repetition';
const CONNECTOR_ANCHOR_ID = 'discovery-card-connectors';
const CROSS_REFS_ANCHOR_ID = 'discovery-card-cross-refs';
const PEOPLE_PLACES_ANCHOR_ID = 'discovery-card-people-places';
const ANCHOR_CLASS = 'scroll-mt-4';

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
  const { items: lookAgainItems, ready: lookAgainReady } = useLookAgain(context, entities, entitiesLoading, discoveryEnabled);
  const crossRefPassages = useDiscoveryStore(s => s.crossRefPassages);

  const hasRepetition = Boolean(context?.analysis.repetition);
  const connectorCount = context?.analysis.connectors.length ?? 0;
  const showConnectors = shouldShowConnectors(connectorCount, thresholds);
  const hasEntities = !!entities && (entities.people.length > 0 || entities.places.length > 0);
  const hasCrossRefs = crossRefPassages.rows.length > 0;

  // Fire once per {book, chapter, translation} for each card actually shown —
  // mirrors the dedupe keys the old `useDiscoveryHost`-hosted version used.
  useEffect(() => {
    if (!discoveryEnabled || !context) return;
    const { book, chapter, translationId } = context;
    const key = `${book}:${chapter}:${translationId}`;
    if (hasRepetition) track('discovery_chip_shown', { feature: 'repetition', dedupeKey: `repetition:${key}` });
    if (showConnectors) track('discovery_chip_shown', { feature: 'connector', dedupeKey: `connector:${key}` });
    if (hasEntities) track('discovery_chip_shown', { feature: 'entity', dedupeKey: `entity:${key}` });
    if (hasCrossRefs) track('discovery_chip_shown', { feature: 'crossref', dedupeKey: `crossref:${key}` });
  }, [discoveryEnabled, context, hasRepetition, showConnectors, hasEntities, hasCrossRefs]);

  if (!discoveryEnabled) {
    return <DiscoveryDialog><p className="text-sm text-scripture-muted">Discover is turned off right now.</p></DiscoveryDialog>;
  }

  if (!context) {
    return <DiscoveryDialog><p className="text-sm text-scripture-muted">Reading the chapter…</p></DiscoveryDialog>;
  }

  const { book, chapter, translationId, analysis, translationCount, primaryTranslationAbbrev } = context;

  return (
    <DiscoveryDialog>
      <GenreCard book={book} chapter={chapter} />
      <LookAgainCard
        items={lookAgainItems}
        ready={lookAgainReady}
        anchors={{
          repetition: REPETITION_ANCHOR_ID,
          connector: CONNECTOR_ANCHOR_ID,
          peoplePlaces: PEOPLE_PLACES_ANCHOR_ID,
        }}
      />
      {hasRepetition && (
        <div id={REPETITION_ANCHOR_ID} className={ANCHOR_CLASS}>
          <RepetitionCard
            repetition={analysis.repetition}
            translationCount={translationCount}
            primaryTranslationAbbrev={primaryTranslationAbbrev}
            book={book}
            chapter={chapter}
            translationId={translationId}
            entities={entities}
          />
        </div>
      )}
      {showConnectors && (
        <div id={CONNECTOR_ANCHOR_ID} className={ANCHOR_CLASS}>
          <ConnectorsCard
            connectorRangesByVerse={analysis.connectorRangesByVerse}
            connectorCount={connectorCount}
            book={book}
            chapter={chapter}
          />
        </div>
      )}
      {hasCrossRefs && (
        <div id={CROSS_REFS_ANCHOR_ID} className={ANCHOR_CLASS}>
          <CrossRefsCard rows={crossRefPassages.rows} expand={crossRefPassages.expand} book={book} chapter={chapter} />
        </div>
      )}
      <div id={PEOPLE_PLACES_ANCHOR_ID} className={ANCHOR_CLASS}>
        <PeoplePlacesCard entities={entities} isLoading={entitiesLoading} error={entitiesError} />
      </div>
    </DiscoveryDialog>
  );
}
