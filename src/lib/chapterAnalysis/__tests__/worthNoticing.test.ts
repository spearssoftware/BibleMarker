import { describe, it, expect } from 'vitest';
import { BIBLE_BOOKS, getVerseCount } from '@/types';
import type { ChapterPerson, EntitySpread, PlaceSpread } from '@/types';
import { heavilyLinkedChapters, selectWorthNoticing } from '../worthNoticing';
import type { WorthNoticingInput } from '../worthNoticing';

describe('heavilyLinkedChapters', () => {
  const totalChapters = BIBLE_BOOKS.reduce((n, b) => n + b.chapters, 0);

  const allChapters = (countFor: (book: string, chapter: number) => number) =>
    BIBLE_BOOKS.flatMap(b =>
      Array.from({ length: b.chapters }, (_, i) => ({ book: b.id, chapter: i + 1, count: countFor(b.id, i + 1) }))
    );

  it('qualifies nothing when the cutoff density is zero (most chapters have no links)', () => {
    expect(totalChapters).toBe(1189);
    const set = heavilyLinkedChapters([
      { book: 'Ps', chapter: 119, count: 176 },
      { book: 'Ruth', chapter: 1, count: 22 },
    ]);
    expect(set.size).toBe(0);
  });

  it('includes every chapter when all tie at the cutoff', () => {
    expect(heavilyLinkedChapters(allChapters((b, c) => getVerseCount(b, c))).size).toBe(totalChapters);
  });

  it('keeps the top 5% by density: nearest-rank leaves 59 above the cutoff, ties at it included', () => {
    // Ps 1-60 have density 5, everything else density 1: the cutoff (rank 1130 of 1189) is 5.
    const set = heavilyLinkedChapters(allChapters((b, c) => getVerseCount(b, c) * (b === 'Ps' && c <= 60 ? 5 : 1)));
    expect(set.size).toBe(60);
    expect(set.has('Ps.1')).toBe(true);
    expect(set.has('Ps.61')).toBe(false);
    expect(set.has('Gen.1')).toBe(false);
  });

  it('measures density, not raw count', () => {
    // Ps.117 (2 verses, 4 refs) has density 2 and makes the cut; Ps.119 (176 verses, 200 refs) has the larger count but density ~1.1 and does not.
    const set = heavilyLinkedChapters(
      allChapters((b, c) => {
        if (b === 'Ps' && c === 117) return 4;
        if (b === 'Ps' && c === 119) return 200;
        return getVerseCount(b, c) * (b === 'Ps' && c <= 59 ? 5 : 1);
      })
    );
    expect(set.has('Ps.117')).toBe(true);
    expect(set.has('Ps.119')).toBe(false);
  });

  it('qualifies nothing when there are no counts', () => {
    expect(heavilyLinkedChapters([]).size).toBe(0);
  });
});

describe('selectWorthNoticing', () => {
  const person = (slug: string, name: string, verses: number[]): ChapterPerson => ({ slug, name, verses });
  const spread = (slug: string, firstRef: string, lastRef: string, books: string[], firstNtRef: string | null = null): EntitySpread => ({
    slug,
    firstRef,
    firstNtRef,
    lastRef,
    books,
  });
  const placeSpread = (slug: string, name: string, firstRef: string, lastRef: string, books: string[]): PlaceSpread => ({
    ...spread(slug, firstRef, lastRef, books),
    name,
  });
  /** Spread of a (lowercased) name across every person and place bearing it. */
  const nameOf = (name: string, firstRef: string, lastRef: string, books: string[]): EntitySpread =>
    spread(name.toLowerCase(), firstRef, lastRef, books);
  const manyBooks = (n: number) => BIBLE_BOOKS.slice(0, n).map(b => b.id);

  const base: WorthNoticingInput = {
    book: 'Gen',
    chapter: 12,
    people: [],
    peopleSpread: [],
    places: [],
    placesSpread: [],
    nameSpread: [],
    heavilyLinked: new Set(),
  };
  const select = (overrides: Partial<WorthNoticingInput>) => selectWorthNoticing({ ...base, ...overrides });

  it('returns nothing when there are no inputs', () => {
    expect(select({})).toEqual([]);
    expect(select({ people: null, peopleSpread: null, places: null, placesSpread: null, nameSpread: null, heavilyLinked: null })).toEqual([]);
  });

  it('reports a place first named in this chapter', () => {
    const facts = select({
      places: ['bethel'],
      placesSpread: [placeSpread('bethel', 'Bethel', 'Gen.12.8', 'Judg.20.31', ['Gen', 'Judg'])],
      nameSpread: [nameOf('Bethel', 'Gen.12.8', 'Judg.20.31', ['Gen', 'Judg'])],
    });
    expect(facts).toEqual([{ kind: 'first-mention', text: 'Bethel is named for the first time here.', key: 'first-mention:bethel' }]);
  });

  it('does not report a first mention from an earlier chapter', () => {
    expect(
      select({
        places: ['bethel'],
        placesSpread: [placeSpread('bethel', 'Bethel', 'Gen.11.8', 'Judg.20.31', ['Gen', 'Judg'])],
        nameSpread: [nameOf('Bethel', 'Gen.11.8', 'Judg.20.31', ['Gen', 'Judg'])],
      })
    ).toEqual([]);
  });

  it('lists a place named only here under only-here, not first mention', () => {
    const facts = select({
      places: ['salem'],
      placesSpread: [placeSpread('salem', 'Salem', 'Gen.12.9', 'Gen.12.9', ['Gen'])],
      nameSpread: [nameOf('Salem', 'Gen.12.9', 'Gen.12.9', ['Gen'])],
    });
    expect(facts).toEqual([{ kind: 'only-here', text: 'This is the only chapter that names Salem.', key: 'only-here:salem' }]);
  });

  it('requires first and last mention in this chapter for only-here', () => {
    expect(
      select({
        places: ['salem'],
        placesSpread: [placeSpread('salem', 'Salem', 'Gen.12.9', 'Gen.13.1', ['Gen'])],
        nameSpread: [nameOf('Salem', 'Gen.12.9', 'Gen.13.1', ['Gen'])],
      }).map(f => f.kind)
    ).toEqual(['first-mention']);
  });

  it('reports a person named only here, but never deity or foretold people', () => {
    const facts = select({
      people: [person('melchizedek', 'Melchizedek', [18]), person('god', 'God', [1]), person('jesus-son-of-joseph', 'Jesus', [3])],
      peopleSpread: [
        spread('melchizedek', 'Gen.12.18', 'Gen.12.18', ['Gen']),
        spread('god', 'Gen.12.1', 'Gen.12.20', ['Gen']),
        spread('jesus-son-of-joseph', 'Gen.12.3', 'Gen.12.3', ['Gen']),
      ],
      nameSpread: [
        nameOf('Melchizedek', 'Gen.12.18', 'Gen.12.18', ['Gen']),
        nameOf('God', 'Gen.12.1', 'Gen.12.20', ['Gen']),
        nameOf('Jesus', 'Gen.12.3', 'Gen.12.3', ['Gen']),
      ],
    });
    expect(facts.map(f => f.key)).toEqual(['only-here:melchizedek']);
  });

  it('reports a heavily cross-referenced chapter', () => {
    expect(select({ heavilyLinked: new Set(['Gen.12']) })).toEqual([
      { kind: 'heavily-linked', text: 'This chapter is one of the most cross-referenced in Scripture.', key: 'heavily-linked' },
    ]);
    expect(select({ heavilyLinked: new Set(['Gen.13']) })).toEqual([]);
  });

  it('reports a person named across 10 or more books, but not 9', () => {
    const facts = select({
      people: [person('abraham', 'Abraham', [1]), person('lot', 'Lot', [4])],
      peopleSpread: [spread('abraham', 'Gen.11.26', 'Rev.1.1', manyBooks(15)), spread('lot', 'Gen.11.27', 'Rev.1.1', manyBooks(9))],
    });
    expect(facts).toEqual([{ kind: 'reach', text: 'Abraham is named in 15 books of the Bible.', key: 'reach:abraham' }]);
  });

  it('skips Jesus reach in an OT chapter, and counts only NT books for him in an NT chapter', () => {
    const jesus = spread('jesus-son-of-joseph', 'Gen.49.10', 'Rev.22.21', [...manyBooks(5), 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', 'Heb'], 'Matt.1.1');
    expect(
      select({ people: [person('jesus-son-of-joseph', 'Jesus', [1])], peopleSpread: [jesus] })
    ).toEqual([]);

    const facts = select({
      book: 'Heb',
      chapter: 1,
      people: [person('jesus-son-of-joseph', 'Jesus', [1])],
      peopleSpread: [{ ...jesus, books: [...jesus.books, ...['1Pet', '2Pet', '1John', 'Jude']] }],
    });
    expect(facts).toEqual([{ kind: 'reach', text: 'Jesus is named in 11 books of the Bible.', key: 'reach:jesus-son-of-joseph' }]);
  });

  it('orders by kind priority, then first verse here, then name, and caps at 4', () => {
    const facts = select({
      people: [person('abraham', 'Abraham', [1]), person('sarah', 'Sarah', [5])],
      peopleSpread: [spread('abraham', 'Gen.11.26', 'Rev.1.1', manyBooks(15)), spread('sarah', 'Gen.11.29', 'Rev.1.1', manyBooks(12))],
      places: ['ai', 'bethel', 'shechem', 'zoar'],
      placesSpread: [
        placeSpread('zoar', 'Zoar', 'Gen.12.8', 'Gen.19.30', ['Gen']),
        placeSpread('bethel', 'Bethel', 'Gen.12.8', 'Judg.20.31', ['Gen', 'Judg']),
        placeSpread('ai', 'Ai', 'Gen.12.8', 'Josh.8.1', ['Gen', 'Josh']),
        placeSpread('shechem', 'Shechem', 'Gen.12.6', 'Josh.24.1', ['Gen', 'Josh']),
      ],
      nameSpread: [
        nameOf('Zoar', 'Gen.12.8', 'Gen.19.30', ['Gen']),
        nameOf('Bethel', 'Gen.12.8', 'Judg.20.31', ['Gen', 'Judg']),
        nameOf('Ai', 'Gen.12.8', 'Josh.8.1', ['Gen', 'Josh']),
        nameOf('Shechem', 'Gen.12.6', 'Josh.24.1', ['Gen', 'Josh']),
      ],
      heavilyLinked: new Set(['Gen.12']),
    });
    expect(facts.map(f => f.key)).toEqual([
      'first-mention:shechem',
      'first-mention:ai',
      'first-mention:bethel',
      'first-mention:zoar',
    ]);
  });

  it('puts only-here, heavily-linked and reach after first mentions', () => {
    const facts = select({
      people: [person('abraham', 'Abraham', [1])],
      peopleSpread: [spread('abraham', 'Gen.11.26', 'Rev.1.1', manyBooks(15))],
      places: ['bethel', 'salem'],
      placesSpread: [
        placeSpread('bethel', 'Bethel', 'Gen.12.8', 'Judg.20.31', ['Gen', 'Judg']),
        placeSpread('salem', 'Salem', 'Gen.12.9', 'Gen.12.9', ['Gen']),
      ],
      nameSpread: [
        nameOf('Bethel', 'Gen.12.8', 'Judg.20.31', ['Gen', 'Judg']),
        nameOf('Salem', 'Gen.12.9', 'Gen.12.9', ['Gen']),
      ],
      heavilyLinked: new Set(['Gen.12']),
    });
    expect(facts.map(f => f.kind)).toEqual(['first-mention', 'only-here', 'heavily-linked', 'reach']);
  });

  it('capitalizes a lowercase place name at the start of a sentence and keys on the lowercased name', () => {
    const facts = select({
      places: ['vale-of-siddim'],
      placesSpread: [placeSpread('vale-of-siddim', 'vale of Siddim', 'Gen.12.1', 'Gen.14.3', ['Gen'])],
      nameSpread: [nameOf('vale of Siddim', 'Gen.12.1', 'Gen.14.3', ['Gen'])],
    });
    expect(facts).toEqual([
      { kind: 'first-mention', text: 'Vale of Siddim is named for the first time here.', key: 'first-mention:vale of siddim' },
    ]);
  });

  it('emits one fact for a name shared by two places in the chapter', () => {
    const facts = select({
      places: ['vale-of-siddim', 'vale-of-siddim-2'],
      placesSpread: [
        placeSpread('vale-of-siddim', 'vale of Siddim', 'Gen.12.1', 'Gen.14.3', ['Gen']),
        placeSpread('vale-of-siddim-2', 'vale of Siddim', 'Gen.12.2', 'Gen.14.8', ['Gen']),
      ],
      nameSpread: [nameOf('vale of Siddim', 'Gen.12.1', 'Gen.14.8', ['Gen'])],
    });
    expect(facts.map(f => f.key)).toEqual(['first-mention:vale of siddim']);
  });

  describe('shared names', () => {
    it('does not say a person is named only here when a place of that name is elsewhere', () => {
      const facts = select({
        book: 'Acts',
        chapter: 4,
        people: [person('john', 'John', [6])],
        peopleSpread: [spread('john', 'Acts.4.6', 'Acts.4.6', ['Acts'])],
        nameSpread: [nameOf('John', 'Matt.3.1', 'Rev.22.8', ['Matt', 'Acts', 'Rev'])],
      });
      expect(facts).toEqual([]);
    });

    it('does not call a place first named here when a person of that name comes earlier', () => {
      const facts = select({
        book: 'Gen',
        chapter: 14,
        places: ['elam'],
        placesSpread: [placeSpread('elam', 'Elam', 'Gen.14.1', 'Gen.14.9', ['Gen'])],
        nameSpread: [nameOf('Elam', 'Gen.10.22', 'Ezra.10.26', ['Gen', 'Ezra'])],
      });
      expect(facts).toEqual([]);
    });

    it('does not call a place named only here when a person of that name appears elsewhere', () => {
      const facts = select({
        book: 'Gen',
        chapter: 14,
        places: ['ham'],
        placesSpread: [placeSpread('ham', 'Ham', 'Gen.14.5', 'Gen.14.5', ['Gen'])],
        nameSpread: [nameOf('Ham', 'Gen.5.32', 'Ps.106.22', ['Gen', 'Ps'])],
      });
      expect(facts).toEqual([]);
    });

    it('does not call a person named only here when another person shares the name', () => {
      const facts = select({
        people: [person('simon-1', 'Simon', [3])],
        peopleSpread: [spread('simon-1', 'Gen.12.3', 'Gen.12.3', ['Gen'])],
        nameSpread: [nameOf('Simon', 'Gen.12.3', 'Acts.10.32', ['Gen', 'Acts'])],
      });
      expect(facts).toEqual([]);
    });

    it('emits a single only-here fact when a person and a place share a name that appears only here', () => {
      const facts = select({
        people: [person('enoch', 'Enoch', [4])],
        peopleSpread: [spread('enoch', 'Gen.12.4', 'Gen.12.4', ['Gen'])],
        places: ['enoch-city'],
        placesSpread: [placeSpread('enoch-city', 'Enoch', 'Gen.12.6', 'Gen.12.6', ['Gen'])],
        nameSpread: [nameOf('Enoch', 'Gen.12.4', 'Gen.12.6', ['Gen'])],
      });
      expect(facts).toEqual([{ kind: 'only-here', text: 'This is the only chapter that names Enoch.', key: 'only-here:enoch' }]);
    });

    it('drops a name with no name spread rather than guessing', () => {
      expect(
        select({
          places: ['bethel'],
          placesSpread: [placeSpread('bethel', 'Bethel', 'Gen.12.8', 'Judg.20.31', ['Gen', 'Judg'])],
          nameSpread: [],
        })
      ).toEqual([]);
    });
  });

  it('ignores spread rows for places not in the chapter and people not in the chapter', () => {
    expect(
      select({
        places: [],
        placesSpread: [placeSpread('bethel', 'Bethel', 'Gen.12.8', 'Judg.20.31', ['Gen', 'Judg'])],
        nameSpread: [nameOf('Bethel', 'Gen.12.8', 'Judg.20.31', ['Gen', 'Judg'])],
        people: [],
        peopleSpread: [spread('abraham', 'Gen.11.26', 'Rev.1.1', manyBooks(15))],
      })
    ).toEqual([]);
  });

  it('keeps other kinds when one input is missing', () => {
    const facts = select({
      peopleSpread: null,
      placesSpread: null,
      heavilyLinked: new Set(['Gen.12']),
    });
    expect(facts.map(f => f.kind)).toEqual(['heavily-linked']);
  });
});
