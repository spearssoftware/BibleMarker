import { describe, it, expect } from 'vitest';
import type { ReadingPlan, ReadingPlanDay } from '@/types/readingPlan';
import { chapterPlanEntries } from './chapterPlans';

const TODAY = '2026-11-13';

const plan = (overrides: Partial<ReadingPlan> = {}): ReadingPlan => ({
  id: 'p1',
  scope: { kind: 'book', bookId: 'John' },
  days: 21,
  startDate: TODAY,
  scheduleVersion: 1,
  createdAt: new Date(1000),
  updatedAt: new Date(1000),
  ...overrides,
});

const row = (planId: string, day: number): ReadingPlanDay => ({
  id: `${planId}:${day}`,
  planId,
  day,
  completedAt: new Date(0),
  updatedAt: new Date(0),
});

const entries = (
  plans: ReadingPlan[],
  dayRows: ReadingPlanDay[],
  book: string,
  chapter: number,
  justCompleted: Record<string, number> = {}
) => chapterPlanEntries({ plans, dayRows, book, chapter, today: TODAY, justCompleted });

describe('chapterPlanEntries', () => {
  it('shows the current day on its chapter', () => {
    const [entry] = entries([plan()], [], 'John', 1);
    expect(entry).toMatchObject({ kind: 'current', planId: 'p1', name: 'John in 21 days', day: 1, nextInDay: null });
  });

  it('shows nothing for a chapter outside the current day', () => {
    expect(entries([plan()], [], 'John', 2)).toEqual([]);
    expect(entries([plan()], [], 'Gen', 1)).toEqual([]);
  });

  it('offers the next chapter of a multi-chapter day', () => {
    const haggai = plan({ scope: { kind: 'book', bookId: 'Hag' }, days: 1 });
    const [first] = entries([haggai], [], 'Hag', 1);
    expect(first).toMatchObject({ kind: 'current', nextInDay: { bookId: 'Hag', chapter: 2 } });
    const [last] = entries([haggai], [], 'Hag', 2);
    expect(last).toMatchObject({ kind: 'current', nextInDay: null });
  });

  it('keeps a just-completed day and points at the new first incomplete day', () => {
    const [entry] = entries([plan()], [row('p1', 1)], 'John', 1, { p1: 1 });
    expect(entry).toMatchObject({ kind: 'completed', day: 1 });
    expect(entry.kind === 'completed' && entry.next?.day).toBe(2);
  });

  it('has no next day when the completed day was the last', () => {
    const haggai = plan({ scope: { kind: 'book', bookId: 'Hag' }, days: 1 });
    const [entry] = entries([haggai], [row('p1', 1)], 'Hag', 2, { p1: 1 });
    expect(entry).toMatchObject({ kind: 'completed', next: null });
  });

  it('falls back to the current day when the completed day was unmarked elsewhere', () => {
    const [entry] = entries([plan()], [], 'John', 1, { p1: 1 });
    expect(entry).toMatchObject({ kind: 'current', day: 1 });
  });

  it('ignores a just-completed day that does not include this chapter', () => {
    expect(entries([plan()], [row('p1', 1)], 'John', 5, { p1: 1 })).toEqual([]);
  });

  it('lists two plans in list order, newest first', () => {
    const older = plan({ id: 'old', createdAt: new Date(1000) });
    const newer = plan({ id: 'new', createdAt: new Date(2000), days: 7 });
    const result = entries([older, newer], [], 'John', 1);
    expect(result.map((e) => e.planId)).toEqual(['new', 'old']);
  });

  it('skips a finished plan', () => {
    const haggai = plan({ scope: { kind: 'book', bookId: 'Hag' }, days: 1 });
    expect(entries([haggai], [row('p1', 1)], 'Hag', 1)).toEqual([]);
  });

  it('skips an unsupported plan', () => {
    expect(entries([plan({ scheduleVersion: 2 })], [], 'John', 1)).toEqual([]);
    expect(entries([plan({ scope: { kind: 'book', bookId: 'Nope' } })], [], 'John', 1)).toEqual([]);
  });
});
