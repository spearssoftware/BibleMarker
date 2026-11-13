import { describe, expect, it } from 'vitest';
import type { ReadingPlan, ReadingPlanDay } from '@/types/readingPlan';
import { planName, readingLabel } from './labels';
import { completedDays, isSupportedPlan, planProgress, readingPlanDayId, sortPlans } from './progress';
import { generateSchedule } from './schedule';

const plan = (overrides: Partial<ReadingPlan> = {}): ReadingPlan => ({
  id: 'p1',
  scope: { kind: 'book', bookId: 'John' },
  days: 21,
  startDate: '2026-11-10',
  scheduleVersion: 1,
  createdAt: new Date('2026-11-10T09:00:00Z'),
  updatedAt: new Date('2026-11-10T09:00:00Z'),
  ...overrides,
});

const row = (planId: string, day: number): ReadingPlanDay => ({
  id: readingPlanDayId(planId, day),
  planId,
  day,
  completedAt: new Date('2026-11-11T09:00:00Z'),
  updatedAt: new Date('2026-11-11T09:00:00Z'),
});

describe('labels', () => {
  const john = generateSchedule({ kind: 'book', bookId: 'John' }, 10);

  it('labels one chapter, a range in one book, and a range across books', () => {
    expect(readingLabel({ day: 1, chapters: [{ bookId: 'John', chapter: 5 }] })).toBe('John 5');
    expect(readingLabel(john[2])).toBe('John 5–6');
    expect(
      readingLabel({
        day: 1,
        chapters: [
          { bookId: 'Gen', chapter: 50 },
          { bookId: 'Exod', chapter: 1 },
          { bookId: 'Exod', chapter: 2 },
        ],
      })
    ).toBe('Genesis 50 – Exodus 2');
  });

  it('names plans, including one day and a malformed scope', () => {
    expect(planName(plan({ days: 21 }))).toBe('John in 21 days');
    expect(planName(plan({ scope: { kind: 'bible' }, days: 365 }))).toBe('Whole Bible in 365 days');
    expect(planName(plan({ scope: { kind: 'nt' }, days: 1 }))).toBe('New Testament in 1 day');
    const malformed = plan({ scope: { kind: 'chronological' } as unknown as ReadingPlan['scope'], days: 7 });
    expect(planName(malformed)).toBe('Reading plan in 7 days');
  });
});

describe('isSupportedPlan', () => {
  it('rejects a newer schedule version, a bad scope, bad days and a bad date', () => {
    expect(isSupportedPlan(plan())).toBe(true);
    expect(isSupportedPlan(plan({ scheduleVersion: 2 }))).toBe(false);
    expect(isSupportedPlan(plan({ scope: { kind: 'x' } as unknown as ReadingPlan['scope'] }))).toBe(false);
    expect(isSupportedPlan(plan({ days: 22 }))).toBe(false);
    expect(isSupportedPlan(plan({ days: 0 }))).toBe(false);
    expect(isSupportedPlan(plan({ startDate: 'soon' }))).toBe(false);
  });
});

describe('completedDays', () => {
  it('ignores rows of other plans and days beyond the plan', () => {
    const rows = [row('p1', 1), row('p1', 22), row('p1', 0), row('other', 2), row('p1', 3)];
    expect([...completedDays(plan(), rows)].sort((a, b) => a - b)).toEqual([1, 3]);
  });
});

describe('planProgress', () => {
  it('points at the first incomplete day, whatever order days were completed in', () => {
    const progress = planProgress(plan(), [row('p1', 1), row('p1', 3)], '2026-11-10');
    expect(progress).toMatchObject({ status: 'active', day: 2, totalDays: 21, daysBehind: 0 });
    if (progress.status === 'active') expect(readingLabel(progress.reading)).toBe('John 2');
  });

  it('reports how far behind the first incomplete day is', () => {
    const progress = planProgress(plan({ startDate: '2026-11-10' }), [], '2026-11-13');
    expect(progress).toMatchObject({ status: 'active', day: 1, daysBehind: 3 });
  });

  it('is finished when every day is complete', () => {
    const rows = Array.from({ length: 21 }, (_, i) => row('p1', i + 1));
    expect(planProgress(plan(), rows, '2026-11-13')).toEqual({ status: 'finished' });
  });

  it('is unsupported for a plan from a newer version', () => {
    expect(planProgress(plan({ scheduleVersion: 2 }), [], '2026-11-13')).toEqual({ status: 'unsupported' });
  });

  it('is not behind when the start date is in the future', () => {
    expect(planProgress(plan({ startDate: '2026-12-01' }), [], '2026-11-13')).toMatchObject({
      day: 1,
      daysBehind: 0,
    });
  });
});

describe('sortPlans', () => {
  it('lists unfinished plans first, newest first within each group, tolerating string dates', () => {
    const old = plan({ id: 'old', days: 1, createdAt: new Date('2026-01-01T00:00:00Z') });
    const done = plan({ id: 'done', days: 1, createdAt: new Date('2026-06-01T00:00:00Z') });
    const mid = plan({ id: 'mid', createdAt: new Date('2026-03-01T00:00:00Z') });
    const recent = plan({
      id: 'recent',
      createdAt: '2026-09-01T00:00:00.000Z' as unknown as Date,
    });
    const sorted = sortPlans([old, done, mid, recent], [row('done', 1), row('old', 1)]);
    expect(sorted.map((p) => p.id)).toEqual(['recent', 'mid', 'done', 'old']);
  });
});
