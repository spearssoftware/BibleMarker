/**
 * Worth noticing — verifiable facts about a chapter, picked from Gnosis data.
 *
 * Pure logic for `WorthNoticingCard`: which chapters count as heavily
 * cross-referenced, and which (up to 4) facts to show for one chapter. Each
 * fact kind depends only on its own inputs, so a missing input (`null`) drops
 * that kind and leaves the rest.
 */

import { BIBLE_BOOKS, getVerseCount, parseOsisRef } from '@/types';
import type { ChapterCrossRefCount, ChapterPerson, EntitySpread, PlaceSpread } from '@/types';
import { capitalize } from '@/lib/textUtils';
import { DEITY_SLUGS, FORETOLD_SLUGS, isForetoldIn, isInChapter, namedInBooks } from './setting';

const MAX_FACTS = 4;
const REACH_MIN_BOOKS = 10;

export type WorthNoticingKind = 'first-mention' | 'only-here' | 'heavily-linked' | 'reach';

export interface WorthNoticingFact {
  kind: WorthNoticingKind;
  text: string;
  /** Kind + lowercased name, or slug for reach (never the text). */
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
  /** Spread of the chapter's places; supplies their names. */
  placesSpread: PlaceSpread[] | null;
  /** Spread by lowercased name (in `slug`) across all people and places sharing it. */
  nameSpread: EntitySpread[] | null;
  heavilyLinked: ReadonlySet<string> | null;
}

interface Candidate {
  /** Person slug. */
  slug: string;
  name: string;
  /** First verse in this chapter naming the entity. */
  verse: number;
  spread: EntitySpread;
  /** People only: distinct books the person is named in. */
  namedBooks: number;
}

/** A name named in the chapter, by a person or a place; the claims about it are decided on `nameSpread`. */
interface NameCandidate {
  name: string;
  verse: number;
  spread: EntitySpread;
  isPlace: boolean;
}

const byVerseThenName = (a: { verse: number; name: string }, b: { verse: number; name: string }): number => a.verse - b.verse || a.name.localeCompare(b.name);

const verseOf = (osisRef: string): number => parseOsisRef(osisRef)?.verse ?? 0;

function isOnlyHere(spread: EntitySpread, book: string, chapter: number): boolean {
  return (
    spread.books.length === 1 &&
    spread.books[0] === book &&
    isInChapter(spread.firstRef, book, chapter) &&
    isInChapter(spread.lastRef, book, chapter)
  );
}

/**
 * Up to 4 facts for the chapter, in fixed kind priority: first mention of a
 * place, a name used only here, a heavily cross-referenced chapter, a person
 * named across 10+ books (only in the chapter where this book first names
 * them). Within a kind: first verse here, then name.
 * First mention and only here are claims about a name, decided across every
 * person and place sharing it (`nameSpread`), so a shared name yields one fact
 * or none. A name appears in at most one fact — one used only here is listed
 * under "only here", not "first mention".
 */
export function selectWorthNoticing({
  book,
  chapter,
  people,
  peopleSpread,
  places,
  placesSpread,
  nameSpread,
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
      namedBooks: namedInBooks(spread.slug, spread.books).length,
    });
  }

  const chapterPlaces = new Set(places ?? []);
  const namedHere: { name: string; verse: number; isPlace: boolean }[] = [
    ...(placesSpread ?? [])
      .filter(spread => chapterPlaces.has(spread.slug))
      .map(spread => ({ name: spread.name, verse: verseOf(spread.firstRef), isPlace: true })),
    ...personCandidates
      .filter(c => !FORETOLD_SLUGS.has(c.slug))
      .map(c => ({ name: c.name, verse: c.verse, isPlace: false })),
  ];

  // One candidate per name, whoever bears it: a name shared by a person and a
  // place, or by two people, is a single claim.
  const spreadByName = new Map((nameSpread ?? []).map(spread => [spread.slug, spread]));
  const nameCandidates = new Map<string, NameCandidate>();
  for (const { name, verse, isPlace } of namedHere) {
    const key = name.toLowerCase();
    const spread = spreadByName.get(key);
    if (!spread) continue;
    const existing = nameCandidates.get(key);
    if (!existing) {
      nameCandidates.set(key, { name, verse, spread, isPlace });
      continue;
    }
    existing.isPlace ||= isPlace;
    existing.verse = Math.min(existing.verse, verse);
  }

  const all = [...nameCandidates.entries()];
  const onlyHere = all
    .filter(([, c]) => isOnlyHere(c.spread, book, chapter))
    .sort(([, a], [, b]) => byVerseThenName(a, b));
  const onlyHereKeys = new Set(onlyHere.map(([key]) => key));
  const firstMentions = all
    .filter(([key, c]) => c.isPlace && isInChapter(c.spread.firstRef, book, chapter) && !onlyHereKeys.has(key))
    .sort(([, a], [, b]) => byVerseThenName(a, b));
  // One reach claim per name: with two people sharing a name, keep the wider spread.
  const reachByName = new Map<string, Candidate>();
  for (const c of personCandidates) {
    if (isForetoldIn(c.slug, book) || c.namedBooks < REACH_MIN_BOOKS) continue;
    // Once per book, where the book first names them: otherwise it repeats down every chapter of John.
    if (!isInChapter(c.spread.firstRefByBook[book] ?? '', book, chapter)) continue;
    const key = c.name.toLowerCase();
    const existing = reachByName.get(key);
    if (!existing || c.namedBooks > existing.namedBooks) reachByName.set(key, c);
  }
  const reach = [...reachByName.values()].sort(byVerseThenName);

  const facts: WorthNoticingFact[] = [
    ...firstMentions.map(([key, c]) => ({
      kind: 'first-mention' as const,
      text: capitalize(`${c.name} is named for the first time here.`),
      key: `first-mention:${key}`,
    })),
    ...onlyHere.map(([key, c]) => ({
      kind: 'only-here' as const,
      text: capitalize(`This is the only chapter that names ${c.name}.`),
      key: `only-here:${key}`,
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
