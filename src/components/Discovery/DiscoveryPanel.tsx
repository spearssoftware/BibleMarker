/**
 * DiscoveryPanel — one scrolling page of Discover-layer cards
 *
 * Replaces the old chip strip (`DiscoveryBar`). Reads the atomic chapter
 * context (identity + analysis + translation meta) published by
 * `useDiscoveryHost`, plus entity counts from Gnosis. No props — everything
 * it needs is either already-mounted host state or store reads.
 *
 * Section order: Setting → Cross-References → Who's here → Look closer
 * (Repetition, Connectors, Look-Again). Setting's intro and genre lines need
 * neither analysis extras nor Gnosis, so the loading gate is `!context` only
 * (S5) — a Gnosis hiccup must not blank the whole panel. Setting and Who's
 * here are each keyed per chapter, so their local state (expanded rows, the
 * intro toggle, the map selection and full-map modal) resets on navigation.
 * Remounting Setting costs nothing extra: the map unmounts anyway while an
 * uncached chapter's places load, and MapLibre's `remove()` releases its
 * WebGL context. Look closer renders its children only while open, so those cards' stable-id anchor divs exist only then.
 * Look-Again scroll targets are fallback chains resolved at tap time: place →
 * the Setting map, else Setting; person → Who's here, else Setting.
 *
 * `discovery_chip_shown` telemetry for repetition, connector and cross-references
 * lives here (not in `useDiscoveryHost`, which is always-mounted) so it fires
 * only when the card is actually rendered — repetition and connector only while
 * Look closer is open. Setting and Who's here fire their own events. The
 * cross-reference rows themselves are loaded by `useDiscoveryHost` (the
 * cross-reference lens needs them while the panel is closed) and read from
 * the store here.
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useDiscoveryConfig, useDiscoveryEnabled } from '@/lib/discovery-config';
import { useChapterEntities } from '@/hooks/useGnosis';
import { useLookAgain } from '@/hooks/useLookAgain';
import { useLookCloserState } from '@/hooks/useLookCloserState';
import { shouldShowConnectors } from '@/lib/chapterAnalysis';
import { LookAgainCard } from './LookAgainCard';
import { RepetitionCard } from './RepetitionCard';
import { ConnectorsCard } from './ConnectorsCard';
import { CrossRefsCard } from './CrossRefsCard';
import { LookCloserSection } from './LookCloserSection';
import { trackChip } from './discoveryTelemetry';
import { SETTING_ANCHOR_ID, SETTING_MAP_ANCHOR_ID, SettingSection } from './SettingSection';
import { WHOS_HERE_ANCHOR_ID, WhosHereCard } from './WhosHereCard';

const REPETITION_ANCHOR_ID = 'discovery-card-repetition';
const CONNECTOR_ANCHOR_ID = 'discovery-card-connectors';
const CROSS_REFS_ANCHOR_ID = 'discovery-card-cross-refs';
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
  const { open: lookCloserOpen } = useLookCloserState();
  const { entities, isLoading: entitiesLoading } = useChapterEntities(
    context?.book,
    context?.chapter,
    discoveryEnabled
  );
  const { items: lookAgainItems, ready: lookAgainReady } = useLookAgain(context, entities, entitiesLoading, discoveryEnabled, lookCloserOpen);
  const crossRefPassages = useDiscoveryStore(s => s.crossRefPassages);

  const hasRepetition = Boolean(context?.analysis.repetition);
  const connectorCount = context?.analysis.connectors.length ?? 0;
  const showConnectors = shouldShowConnectors(connectorCount, thresholds);
  const hasCrossRefs = crossRefPassages.rows.length > 0;

  // Fire once per {book, chapter, translation} for each card actually shown.
  useEffect(() => {
    if (!discoveryEnabled || !context) return;
    const scope = { book: context.book, chapter: context.chapter, translationId: context.translationId };
    if (lookCloserOpen && hasRepetition) trackChip('discovery_chip_shown', 'repetition', scope);
    if (lookCloserOpen && showConnectors) trackChip('discovery_chip_shown', 'connector', scope);
    if (hasCrossRefs) trackChip('discovery_chip_shown', 'crossref', scope);
  }, [discoveryEnabled, context, lookCloserOpen, hasRepetition, showConnectors, hasCrossRefs]);

  if (!discoveryEnabled) {
    return <DiscoveryDialog><p className="text-sm text-scripture-muted">Discover is turned off right now.</p></DiscoveryDialog>;
  }

  if (!context) {
    return <DiscoveryDialog><p className="text-sm text-scripture-muted">Reading the chapter…</p></DiscoveryDialog>;
  }

  const { book, chapter, translationId, analysis, translationCount, primaryTranslationAbbrev } = context;

  return (
    <DiscoveryDialog>
      <SettingSection key={`setting:${book}:${chapter}`} book={book} chapter={chapter} translationId={translationId} />
      {hasCrossRefs && (
        <div id={CROSS_REFS_ANCHOR_ID} className={ANCHOR_CLASS}>
          <CrossRefsCard rows={crossRefPassages.rows} expand={crossRefPassages.expand} book={book} chapter={chapter} />
        </div>
      )}
      <WhosHereCard key={`whos-here:${book}:${chapter}`} book={book} chapter={chapter} translationId={translationId} />
      <LookCloserSection book={book} chapter={chapter} translationId={translationId}>
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
        <LookAgainCard
          items={lookAgainItems}
          ready={lookAgainReady}
          anchors={{
            repetition: [REPETITION_ANCHOR_ID],
            connector: [CONNECTOR_ANCHOR_ID],
            people: [WHOS_HERE_ANCHOR_ID, SETTING_ANCHOR_ID],
            places: [SETTING_MAP_ANCHOR_ID, SETTING_ANCHOR_ID],
          }}
        />
      </LookCloserSection>
    </DiscoveryDialog>
  );
}
