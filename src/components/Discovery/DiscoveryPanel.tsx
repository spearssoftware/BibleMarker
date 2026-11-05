/**
 * DiscoveryPanel — one scrolling page of Discover-layer cards
 *
 * Reads the atomic chapter context (identity + analysis + translation meta)
 * published by `useDiscoveryHost`. No props — everything it needs is either
 * already-mounted host state or store reads.
 *
 * Section order: Setting → Who's here → Worth noticing → Cross-References →
 * Commentary → Look closer (Repetition, Connectors). Setting's intro needs
 * neither analysis extras nor Gnosis, so the loading gate is `!context` only
 * — a Gnosis hiccup must not blank the whole panel. Setting, Who's here and
 * Worth noticing are each keyed per chapter, so their local state (expanded
 * rows, the intro toggle, the map selection and full-map modal) resets on
 * navigation. Look closer renders its children only while open, and is
 * omitted entirely on a chapter with nothing to put in it.
 *
 * `discovery_chip_shown` telemetry for repetition, connector and
 * cross-references lives here (not in `useDiscoveryHost`, which is
 * always-mounted) so it fires only when the card is actually rendered —
 * repetition and connector only while Look closer is open. Setting, Worth
 * noticing, Who's here and Commentary fire their own events. The
 * cross-reference rows themselves are loaded by `useDiscoveryHost` (the
 * cross-reference lens needs them while the panel is closed) and read from
 * the store here.
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useDiscoveryConfig, useDiscoveryEnabled } from '@/lib/discovery-config';
import { useLookCloserState } from '@/hooks/useLookCloserState';
import { shouldShowConnectors } from '@/lib/chapterAnalysis';
import { RepetitionCard } from './RepetitionCard';
import { ConnectorsCard } from './ConnectorsCard';
import { CommentaryCard } from './CommentaryCard';
import { CrossRefsCard } from './CrossRefsCard';
import { LookCloserSection } from './LookCloserSection';
import { trackChip } from '@/lib/discoveryTelemetry';
import { SettingSection } from './SettingSection';
import { WhosHereCard } from './WhosHereCard';
import { WorthNoticingCard } from './WorthNoticingCard';

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
  const crossRefPassages = useDiscoveryStore(s => s.crossRefPassages);
  const laterCrossRefPassages = useDiscoveryStore(s => s.laterCrossRefPassages);

  const hasRepetition = Boolean(context?.analysis.repetition);
  const connectorCount = context?.analysis.connectors.length ?? 0;
  const showConnectors = shouldShowConnectors(connectorCount, thresholds);
  const hasCrossRefs = crossRefPassages.rows.length > 0;
  const hasLaterCrossRefs = laterCrossRefPassages.rows.length > 0;

  // Fire once per {book, chapter, translation} for each card actually shown.
  useEffect(() => {
    if (!discoveryEnabled || !context) return;
    const scope = { book: context.book, chapter: context.chapter, translationId: context.translationId };
    if (lookCloserOpen && hasRepetition) trackChip('discovery_chip_shown', 'repetition', scope);
    if (lookCloserOpen && showConnectors) trackChip('discovery_chip_shown', 'connector', scope);
    if (hasCrossRefs) trackChip('discovery_chip_shown', 'crossref', scope);
    if (hasLaterCrossRefs) trackChip('discovery_chip_shown', 'crossref_later', scope);
  }, [discoveryEnabled, context, lookCloserOpen, hasRepetition, showConnectors, hasCrossRefs, hasLaterCrossRefs]);

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
      <WhosHereCard key={`whos-here:${book}:${chapter}`} book={book} chapter={chapter} translationId={translationId} />
      <WorthNoticingCard key={`worth-noticing:${book}:${chapter}`} book={book} chapter={chapter} translationId={translationId} />
      {(hasCrossRefs || hasLaterCrossRefs) && (
        <CrossRefsCard
          rows={crossRefPassages.rows}
          expand={crossRefPassages.expand}
          laterRows={laterCrossRefPassages.rows}
          laterExpand={laterCrossRefPassages.expand}
          book={book}
          chapter={chapter}
        />
      )}
      <CommentaryCard
        book={book}
        chapter={chapter}
        translationId={translationId}
        translationAbbrev={primaryTranslationAbbrev}
      />
      {(hasRepetition || showConnectors) && (
        <LookCloserSection book={book} chapter={chapter} translationId={translationId}>
          {hasRepetition && (
            <RepetitionCard
              repetition={analysis.repetition}
              translationCount={translationCount}
              primaryTranslationAbbrev={primaryTranslationAbbrev}
              book={book}
              chapter={chapter}
              translationId={translationId}
            />
          )}
          {showConnectors && (
            <ConnectorsCard
              connectorRangesByVerse={analysis.connectorRangesByVerse}
              connectorCount={connectorCount}
              book={book}
              chapter={chapter}
            />
          )}
        </LookCloserSection>
      )}
    </DiscoveryDialog>
  );
}
