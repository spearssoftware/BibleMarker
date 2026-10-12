/**
 * WorthNoticingCard — up to 4 verifiable facts about this chapter.
 *
 * Facts come from `selectWorthNoticing` (first mention of a place, a name used
 * only here, heavily cross-referenced, a person named across many books). Each
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
  useNameSpread,
  usePeopleSpread,
  usePlacesSpread,
} from '@/hooks/useGnosis';
import { DEITY_SLUGS, FORETOLD_SLUGS, selectWorthNoticing } from '@/lib/chapterAnalysis';
import { useDiscoveryConfig } from '@/lib/discovery-config';
import { DiscoveryCard } from './DiscoveryCard';
import { trackChip } from '@/lib/discoveryTelemetry';

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
  const namedPeople = useMemo(() => (people ?? []).filter(p => !DEITY_SLUGS.has(p.slug)), [people]);
  const personSlugs = useMemo(() => namedPeople.map(p => p.slug), [namedPeople]);
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
  // First mention and only here are claims about a name, so ask about every person and place bearing it.
  const placesSpreadSettled =
    placeSlugs.length === 0 ||
    (!placesSpreadLoading && (placesSpread !== null || !!placesSpreadError || !capabilities.placesSpread));
  const names = useMemo(() => {
    if (!placesSpreadSettled) return [];
    const placeSet = new Set(placeSlugs);
    const placeNames = (placesSpread ?? []).filter(s => placeSet.has(s.slug)).map(s => s.name);
    // Prophecy-tagged people never get name facts, so don't aggregate their (large) spreads.
    const personNames = namedPeople.filter(p => !FORETOLD_SLUGS.has(p.slug)).map(p => p.name);
    return [...new Set([...placeNames, ...personNames].map(name => name.toLowerCase()))];
  }, [placesSpreadSettled, placesSpread, placeSlugs, namedPeople]);
  const { spread: nameSpread, isLoading: nameSpreadLoading, error: nameSpreadError } = useNameSpread(
    book,
    chapter,
    names,
    names.length > 0
  );
  const { chapters: heavilyLinked, isLoading: heavilyLinkedLoading, error: heavilyLinkedError } =
    useHeavilyLinkedChapters(crossRefMinVotes, capabilities.crossRefCounts);

  // `null` spreads mean "no slugs", "no such method" or "not loaded yet"; only the last is still pending.
  const peopleSpreadPending =
    personSlugs.length > 0 && capabilities.peopleSpread && peopleSpread === null && !peopleSpreadError;
  const placesSpreadPending =
    placeSlugs.length > 0 && capabilities.placesSpread && placesSpread === null && !placesSpreadError;
  const nameSpreadPending = names.length > 0 && capabilities.nameSpread && nameSpread === null && !nameSpreadError;
  const heavilyLinkedPending = capabilities.crossRefCounts && heavilyLinked === null && !heavilyLinkedError;
  const pending =
    !capabilities.ready ||
    peopleLoading ||
    entitiesLoading ||
    peopleSpreadLoading ||
    placesSpreadLoading ||
    nameSpreadLoading ||
    heavilyLinkedLoading ||
    peopleSpreadPending ||
    placesSpreadPending ||
    nameSpreadPending ||
    heavilyLinkedPending ||
    (people === null && !peopleError) ||
    (entities === null && !entitiesError);

  const facts = useMemo(
    () =>
      pending
        ? []
        : selectWorthNoticing({ book, chapter, people, peopleSpread, places: entities?.places ?? null, placesSpread, nameSpread, heavilyLinked }),
    [pending, book, chapter, people, peopleSpread, entities, placesSpread, nameSpread, heavilyLinked]
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
