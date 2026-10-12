/**
 * WorthNoticingCard — up to 4 verifiable facts about this chapter.
 *
 * Facts come from `selectWorthNoticing` (first mention of a place, named only
 * here, heavily cross-referenced, a person named across many books). Each
 * kind depends only on its own inputs: an unsupported or failed query drops
 * that kind, not the card. Hidden while any input it needs is still loading,
 * and when no fact qualifies. A plain list — nothing to tap.
 */

import { useEffect, useMemo } from 'react';
import {
  useChapterEntities,
  useChapterPeople,
  useGnosisCapabilities,
  useHeavilyLinkedChapters,
  usePeopleSpread,
  usePlacesSpread,
} from '@/hooks/useGnosis';
import { DEITY_SLUGS, selectWorthNoticing } from '@/lib/chapterAnalysis';
import { useDiscoveryConfig } from '@/lib/discovery-config';
import { DiscoveryCard } from './DiscoveryCard';
import { trackChip } from './discoveryTelemetry';

interface WorthNoticingCardProps {
  book: string;
  chapter: number;
  translationId: string;
}

export function WorthNoticingCard({ book, chapter, translationId }: WorthNoticingCardProps) {
  const { crossRefMinVotes } = useDiscoveryConfig();
  const capabilities = useGnosisCapabilities();

  const { people, isLoading: peopleLoading, error: peopleError } = useChapterPeople(book, chapter);
  const { entities, isLoading: entitiesLoading, error: entitiesError } = useChapterEntities(book, chapter);

  // Same slugs as Who's here, so the people spread query is shared.
  const personSlugs = useMemo(() => (people ?? []).filter(p => !DEITY_SLUGS.has(p.slug)).map(p => p.slug), [people]);
  const placeSlugs = useMemo(() => entities?.places ?? [], [entities]);

  const { spread: peopleSpread, isLoading: peopleSpreadLoading, error: peopleSpreadError } = usePeopleSpread(
    book,
    chapter,
    personSlugs,
    personSlugs.length > 0
  );
  const { spread: placesSpread, isLoading: placesSpreadLoading, error: placesSpreadError } = usePlacesSpread(
    book,
    chapter,
    placeSlugs,
    placeSlugs.length > 0
  );
  const { chapters: heavilyLinked, isLoading: heavilyLinkedLoading, error: heavilyLinkedError } =
    useHeavilyLinkedChapters(crossRefMinVotes, capabilities.crossRefCounts);

  // `null` spreads mean "no slugs", "no such method" or "not loaded yet"; only the last is still pending.
  const peopleSpreadPending =
    personSlugs.length > 0 && capabilities.peopleSpread && peopleSpread === null && !peopleSpreadError;
  const placesSpreadPending =
    placeSlugs.length > 0 && capabilities.placesSpread && placesSpread === null && !placesSpreadError;
  const heavilyLinkedPending = capabilities.crossRefCounts && heavilyLinked === null && !heavilyLinkedError;
  const pending =
    peopleLoading ||
    entitiesLoading ||
    peopleSpreadLoading ||
    placesSpreadLoading ||
    heavilyLinkedLoading ||
    peopleSpreadPending ||
    placesSpreadPending ||
    heavilyLinkedPending ||
    (people === null && !peopleError) ||
    (entities === null && !entitiesError);

  const facts = useMemo(
    () =>
      pending
        ? []
        : selectWorthNoticing({ book, chapter, people, peopleSpread, places: entities?.places ?? null, placesSpread, heavilyLinked }),
    [pending, book, chapter, people, peopleSpread, entities, placesSpread, heavilyLinked]
  );

  const visible = facts.length > 0;
  useEffect(() => {
    if (visible) trackChip('discovery_chip_shown', 'worth_noticing', { book, chapter, translationId });
  }, [visible, book, chapter, translationId]);

  if (!visible) return null;

  return (
    <DiscoveryCard title="Worth noticing">
      <ul className="space-y-1">
        {facts.map(fact => (
          <li key={fact.key} className="text-sm text-scripture-text">
            {fact.text}
          </li>
        ))}
      </ul>
    </DiscoveryCard>
  );
}
