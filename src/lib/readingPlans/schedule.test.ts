import { describe, expect, it } from 'vitest';
import { BIBLE_BOOKS, KJV_VERSE_COUNTS } from '@/types/bible';
import type { ReadingPlanScope } from '@/types/readingPlan';
import { isValidScope, selectionChapters, selectionName } from './chapters';
import { generateSchedule, splitByVerses } from './schedule';

const verses = (bookId: string, chapter: number) => KJV_VERSE_COUNTS[bookId][chapter - 1];

describe('KJV_VERSE_COUNTS', () => {
  it('has a positive count for every chapter of all 66 books', () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
    for (const book of BIBLE_BOOKS) {
      expect(KJV_VERSE_COUNTS[book.id], book.id).toHaveLength(book.chapters);
      expect(KJV_VERSE_COUNTS[book.id].every((n) => n > 0), book.id).toBe(true);
    }
  });
});

describe('selection', () => {
  it('names each selection', () => {
    expect(selectionName({ kind: 'bible' })).toBe('Whole Bible');
    expect(selectionName({ kind: 'ot' })).toBe('Old Testament');
    expect(selectionName({ kind: 'nt' })).toBe('New Testament');
    expect(selectionName({ kind: 'book', bookId: 'John' })).toBe('John');
  });

  it('validates scopes', () => {
    expect(isValidScope({ kind: 'nt' })).toBe(true);
    expect(isValidScope({ kind: 'book', bookId: 'John' })).toBe(true);
    expect(isValidScope({ kind: 'book', bookId: 'Nope' })).toBe(false);
    expect(isValidScope({ kind: 'book' })).toBe(false);
    expect(isValidScope({ kind: 'chronological' })).toBe(false);
    expect(isValidScope(null)).toBe(false);
    expect(isValidScope('bible')).toBe(false);
  });

  it('lists 1,189 chapters for the Bible, split across the testaments', () => {
    expect(selectionChapters({ kind: 'bible' })).toHaveLength(1189);
    expect(selectionChapters({ kind: 'ot' })).toHaveLength(929);
    expect(selectionChapters({ kind: 'nt' })).toHaveLength(260);
  });
});

describe('generateSchedule', () => {
  it('gives John in 21 days one chapter a day, John 1 to John 21', () => {
    const schedule = generateSchedule({ kind: 'book', bookId: 'John' }, 21);
    expect(schedule).toHaveLength(21);
    schedule.forEach((day, i) => {
      expect(day.day).toBe(i + 1);
      expect(day.chapters).toEqual([{ bookId: 'John', chapter: i + 1 }]);
    });
  });

  const scopes: ReadingPlanScope[] = [
    { kind: 'bible' },
    { kind: 'ot' },
    { kind: 'nt' },
    { kind: 'book', bookId: 'Ps' },
    { kind: 'book', bookId: 'John' },
    { kind: 'book', bookId: 'Obad' },
  ];

  it.each(scopes)('covers every chapter once, in order, with no empty day: %j', (scope) => {
    const all = selectionChapters(scope);
    for (const days of [1, 2, 7, 30, all.length].filter((n) => n <= all.length)) {
      const schedule = generateSchedule(scope, days);
      expect(schedule).toHaveLength(days);
      expect(schedule.every((d) => d.chapters.length > 0)).toBe(true);
      expect(schedule.flatMap((d) => d.chapters)).toEqual(all);
    }
  });

  it('covers 1,189 chapters and 31,102 verses for the Bible in 365 days', () => {
    const chapters = generateSchedule({ kind: 'bible' }, 365).flatMap((d) => d.chapters);
    expect(chapters).toHaveLength(1189);
    expect(chapters.reduce((sum, c) => sum + verses(c.bookId, c.chapter), 0)).toBe(31102);
  });

  it('plans a one-chapter book in one day only', () => {
    const scope: ReadingPlanScope = { kind: 'book', bookId: 'Obad' };
    expect(generateSchedule(scope, 1)[0].chapters).toEqual([{ bookId: 'Obad', chapter: 1 }]);
    expect(() => generateSchedule(scope, 2)).toThrow(RangeError);
  });

  it('rejects day counts outside 1..chapters', () => {
    const john: ReadingPlanScope = { kind: 'book', bookId: 'John' };
    expect(() => generateSchedule(john, 0)).toThrow(RangeError);
    expect(() => generateSchedule(john, 22)).toThrow(RangeError);
    expect(() => generateSchedule(john, 2.5)).toThrow(RangeError);
    expect(() => generateSchedule(john, Number.NaN)).toThrow(RangeError);
    expect(() => generateSchedule({ kind: 'book', bookId: 'Nope' }, 1)).toThrow(RangeError);
  });

  it('returns the same schedule on repeated calls', () => {
    const scope: ReadingPlanScope = { kind: 'nt' };
    expect(generateSchedule(scope, 90)).toBe(generateSchedule(scope, 90));
  });

  describe('balancing rule', () => {
    it('splits chapters of 10, 10 and 30 verses as [1-2],[3] in 2 days and one each in 3', () => {
      expect(splitByVerses([10, 10, 30], 2)).toEqual([2, 3]);
      expect(splitByVerses([10, 10, 30], 3)).toEqual([1, 2, 3]);
    });

    it('lets the earlier chapter win a tie', () => {
      // Total 40, 2 days: ending at chapter 1 gives |10 * 2 - 40| = 20 and at chapter 2
      // gives |30 * 2 - 40| = 20.
      expect(splitByVerses([10, 20, 10], 2)).toEqual([1, 3]);
    });

    it('leaves a chapter for every remaining day', () => {
      expect(splitByVerses([100, 1, 1], 3)).toEqual([1, 2, 3]);
      expect(splitByVerses([1, 1, 100], 2)).toEqual([2, 3]);
    });

    it('takes the whole selection on a single day', () => {
      expect(splitByVerses([5, 5, 5], 1)).toEqual([3]);
    });
  });
});
