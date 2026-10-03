/**
 * SettingSection — orients the reader in the chapter's world.
 *
 * Book intro (full on chapter 1, otherwise a collapsed `About <Book>` row),
 * genre lines, then Gnosis-backed pieces: chapter line, mini map, era strip
 * and event list. The intro and genre lines are local and never wait; every
 * Gnosis piece is hidden while loading, on error, or when the provider
 * returns nothing.
 */

import { useEffect, useState } from 'react';
import { useChapterEntities, useChapterEvents, useChapterPlaces, useChapterYear } from '@/hooks/useGnosis';
import {
  DEITY_SLUGS,
  GENRE_LABEL,
  buildChapterLine,
  genreFor,
  introFor,
  isPrimeval,
  orientationFor,
  questionFor,
} from '@/lib/chapterAnalysis';
import { getBookById } from '@/types';
import { ChapterMap } from './ChapterMap';
import { ChapterMapModal } from './ChapterMapModal';
import { DiscoveryCard } from './DiscoveryCard';
import { EraStrip } from './EraStrip';
import { EventList } from './EventList';
import { trackChip } from './discoveryTelemetry';

export const SETTING_ANCHOR_ID = 'discovery-setting';
export const SETTING_MAP_ANCHOR_ID = 'discovery-setting-map';

interface SettingSectionProps {
  book: string;
  chapter: number;
  translationId: string;
}

export function SettingSection({ book, chapter, translationId }: SettingSectionProps) {
  const [introOpen, setIntroOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const scope = { book, chapter, translationId };

  const { entities, isLoading: entitiesLoading, error: entitiesError } = useChapterEntities(book, chapter);
  const { events, isLoading: eventsLoading, error: eventsError } = useChapterEvents(book, chapter);
  const { year, isLoading: yearLoading, error: yearError } = useChapterYear(book, chapter);
  const { places, isLoading: placesLoading, error: placesError } = useChapterPlaces(book, chapter);

  const readyEntities = entitiesLoading || entitiesError ? null : entities;
  const readyEvents = eventsLoading || eventsError ? null : events;
  const readyYear = yearLoading || yearError ? null : year;
  const readyPlaces = placesLoading || placesError ? null : places;

  useEffect(() => {
    trackChip('discovery_chip_shown', 'setting', { book, chapter, translationId });
  }, [book, chapter, translationId]);

  const hasMap = !!readyPlaces && readyPlaces.length > 0;
  useEffect(() => {
    if (hasMap) trackChip('discovery_chip_shown', 'setting_map', { book, chapter, translationId });
  }, [hasMap, book, chapter, translationId]);

  const bookName = getBookById(book)?.name ?? book;
  const genre = genreFor(book);
  const intro = introFor(book);
  const orientation = orientationFor(book);
  const question = questionFor(book, chapter);

  const chapterLine = buildChapterLine({
    yearDisplay: readyYear?.yearDisplay,
    peopleCount: readyEntities ? readyEntities.people.filter(slug => !DEITY_SLUGS.has(slug)).length : 0,
    placeCount: readyEntities ? readyEntities.places.length : 0,
    firstEventTitle: readyEvents?.[0]?.title,
    primeval: isPrimeval(book, chapter),
  });

  const handleIntroToggle = () => {
    if (!introOpen) trackChip('discovery_chip_tapped', 'setting', scope);
    setIntroOpen(!introOpen);
  };

  return (
    <DiscoveryCard id={SETTING_ANCHOR_ID} title={genre ? `${bookName} — ${GENRE_LABEL[genre]}` : bookName}>
      {intro && chapter === 1 && <p className="text-sm text-scripture-text">{intro}</p>}
      {intro && chapter !== 1 && (
        <div>
          <button
            type="button"
            aria-expanded={introOpen}
            onClick={handleIntroToggle}
            className="text-sm text-scripture-accent hover:text-scripture-accent/70"
          >
            {`About ${bookName}`}
          </button>
          {introOpen && <p className="mt-1 text-sm text-scripture-text">{intro}</p>}
        </div>
      )}
      {orientation && <p className="text-sm text-scripture-text">{orientation}</p>}
      {question && <p className="text-sm text-scripture-muted italic">{question}</p>}
      {chapterLine && <p className="text-sm text-scripture-text">{chapterLine}</p>}
      {hasMap && (
        <>
          <div id={SETTING_MAP_ANCHOR_ID} className="scroll-mt-4">
            <ChapterMap
              places={readyPlaces}
              book={book}
              chapter={chapter}
              onMarkerTap={() => trackChip('discovery_chip_tapped', 'setting_map', scope)}
              onOpenFullMap={() => {
                trackChip('discovery_chip_tapped', 'setting_map', scope);
                setMapOpen(true);
              }}
            />
          </div>
          <ChapterMapModal isOpen={mapOpen} onClose={() => setMapOpen(false)} places={readyPlaces} />
        </>
      )}
      <EraStrip book={book} chapter={chapter} translationId={translationId} year={readyYear?.year ?? null} />
      {readyEvents && <EventList events={readyEvents} book={book} chapter={chapter} translationId={translationId} />}
    </DiscoveryCard>
  );
}
