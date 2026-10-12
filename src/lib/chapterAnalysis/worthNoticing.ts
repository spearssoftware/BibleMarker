/**
 * Worth noticing — verifiable facts about a chapter, picked from Gnosis data.
 *
 * Pure logic for `WorthNoticingCard`: which chapters count as heavily
 * cross-referenced, and which (up to 4) facts to show for one chapter. Each
 * fact kind depends only on its own inputs, so a missing input (`null`) drops
 * that kind and leaves the rest.
 */

import { BIBLE_BOOKS, getBookById, getVerseCount, parseOsisRef } from '@/types';
import type { ChapterCrossRefCount, ChapterPerson, EntitySpread, PlaceSpread } from '@/types';
import { DEITY_SLUGS, FORETOLD_SLUGS, isForetoldIn, isInChapter } from './setting';

const MAX_FACTS = 4;
const REACH_MIN_BOOKS = 10;

export type WorthNoticingKind = 'first-mention' | 'only-here' | 'heavily-linked' | 'reach';

export interface WorthNoticingFact {
  kind: WorthNoticingKind;
  text: string;
  /** Kind + slug (never the text — place names repeat, e.g. `valley-of-shaveh-2`). */
  key: string;
}

/**
 * The chapters ("Book.ch") whose cross-references per verse are in the top
 * `1 - minPercentile` of every chapter in the Bible. Density, not raw count,
 * so a long chapter does not win by length; chapters with no cross-references
 * count as zero. The cutoff is the nearest-rank percentile, ties included; a
 * zero cutoff qualifies nothing.
 */
export function heavilyLinkedChapters(counts: ChapterCrossRefCount[], minPercentile = 0.95): Set<string> {
  const countByChapter = new Map(counts.map(c => [`${c.book}.${c.chapter}`, c.count]));
  const densities: { key: string; density: number }[] = [];
  for (const { id, chapters } of BIBLE_BOOKS) {
    for (let chapter = 1; chapter <= chapters; chapter++) {
      const key = `${id}.${chapter}`;
      const verses = getVerseCount(id, chapter);
      densities.push({ key, density: verses > 0 ? (countByChapter.get(key) ?? 0) / verses : 0 });
    }
  }

  const sorted = densities.map(d => d.density).sort((a, b) => a - b);
  const cutoff = sorted[Math.max(0, Math.ceil(minPercentile * sorted.length) - 1)] ?? 0;
  if (cutoff <= 0) return new Set();
  return new Set(densities.filter(d => d.density >= cutoff).map(d => d.key));
}

export interface WorthNoticingInput {
  book: string;
  chapter: number;
  people: ChapterPerson[] | null;
  peopleSpread: EntitySpread[] | null;
  /** Slugs of the places named in the chapter. */
  places: string[] | null;
  placesSpread: PlaceSpread[] | null;
  heavilyLinked: ReadonlySet<string> | null;
}

interface Candidate {
  slug: string;
  name: string;
  /** First verse in this chapter naming the entity. */
  verse: number;
  spread: EntitySpread;
  /** People only: distinct books the person is named in. */
  namedBooks: number;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const byVerseThenName = (a: Candidate, b: Candidate): number => a.verse - b.verse || a.name.localeCompare(b.name);

const verseOf = (osisRef: string): number => parseOsisRef(osisRef)?.verse ?? 0;

function isOnlyHere(spread: EntitySpread, book: string, chapter: number): boolean {
  return (
    spread.books.length === 1 &&
    spread.books[0] === book &&
    isInChapter(spread.firstRef, book, chapter) &&
    isInChapter(spread.lastRef, book, chapter)
  );
}

/** Books a person is named in; prophecy-tagged people count their New Testament books only (as in Who's here). */
function namedBookCount(slug: string, spread: EntitySpread): number {
  if (!FORETOLD_SLUGS.has(slug)) return spread.books.length;
  return spread.books.filter(id => getBookById(id)?.testament === 'NT').length;
}

/**
 * Up to 4 facts for the chapter, in fixed kind priority: first mention of a
 * place, an entity named only here, a heavily cross-referenced chapter, a
 * person named across 10+ books. Within a kind: first verse here, then name.
 * An entity appears in at most one fact — a place named only here is listed
 * under "only here", not "first mention".
 */
export function selectWorthNoticing({
  book,
  chapter,
  people,
  peopleSpread,
  places,
  placesSpread,
  heavilyLinked,
}: WorthNoticingInput): WorthNoticingFact[] {
  const peopleBySlug = new Map((people ?? []).map(p => [p.slug, p]));
  const personCandidates: Candidate[] = [];
  for (const spread of peopleSpread ?? []) {
    const person = peopleBySlug.get(spread.slug);
    if (!person || DEITY_SLUGS.has(spread.slug)) continue;
    personCandidates.push({
      slug: spread.slug,
      name: person.name,
      verse: person.verses[0] ?? 0,
      spread,
      namedBooks: namedBookCount(spread.slug, spread),
    });
  }

  const chapterPlaces = new Set(places ?? []);
  const placeCandidates: Candidate[] = (placesSpread ?? [])
    .filter(spread => chapterPlaces.has(spread.slug))
    .map(spread => ({ slug: spread.slug, name: spread.name, verse: verseOf(spread.firstRef), spread, namedBooks: 0 }));

  const onlyHerePlaces = placeCandidates.filter(c => isOnlyHere(c.spread, book, chapter));
  const onlyHerePeople = personCandidates.filter(
    c => !FORETOLD_SLUGS.has(c.slug) && isOnlyHere(c.spread, book, chapter)
  );
  const onlyHereSlugs = new Set(onlyHerePlaces.map(c => c.slug));

  const firstMentions = placeCandidates
    .filter(c => isInChapter(c.spread.firstRef, book, chapter) && !onlyHereSlugs.has(c.slug))
    .sort(byVerseThenName);
  const onlyHere = [
    ...onlyHerePlaces.map(c => ({ ...c, entity: 'place' })),
    ...onlyHerePeople.map(c => ({ ...c, entity: 'person' })),
  ].sort(byVerseThenName);
  const reach = personCandidates
    .filter(c => !isForetoldIn(c.slug, book) && c.namedBooks >= REACH_MIN_BOOKS)
    .sort(byVerseThenName);

  const facts: WorthNoticingFact[] = [
    ...firstMentions.map(c => ({
      kind: 'first-mention' as const,
      text: capitalize(`${c.name} is named for the first time here.`),
      key: `first-mention:${c.slug}`,
    })),
    ...onlyHere.map(c => ({
      kind: 'only-here' as const,
      text: capitalize(`This is the only chapter that names ${c.name}.`),
      key: `only-here:${c.entity}:${c.slug}`,
    })),
    ...(heavilyLinked?.has(`${book}.${chapter}`)
      ? [
          {
            kind: 'heavily-linked' as const,
            text: 'This chapter is one of the most cross-referenced in Scripture.',
            key: 'heavily-linked',
          },
        ]
      : []),
    ...reach.map(c => ({
      kind: 'reach' as const,
      text: capitalize(`${c.name} is named in ${c.namedBooks} books of the Bible.`),
      key: `reach:${c.slug}`,
    })),
  ];
  return facts.slice(0, MAX_FACTS);
}
