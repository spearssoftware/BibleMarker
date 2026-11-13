import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReadingPlan, ReadingPlanDay } from '@/types';

const db = vi.hoisted(() => ({
  getAllReadingPlans: vi.fn(async (): Promise<unknown[]> => []),
  getAllReadingPlanDays: vi.fn(async (): Promise<unknown[]> => []),
  saveReadingPlan: vi.fn(async (_plan: unknown) => 'id'),
  saveReadingPlanDay: vi.fn(async (_row: unknown) => 'id'),
  deleteReadingPlanDay: vi.fn(async (_id: string) => {}),
  deleteReadingPlan: vi.fn(async (_id: string) => {}),
}));

vi.mock('@/lib/database', () => db);

import { useReadingPlanStore } from '../readingPlanStore';
import { planProgress } from '@/lib/readingPlans';

const JOHN = { kind: 'book', bookId: 'John' } as const;

const plan = (overrides: Partial<ReadingPlan> = {}): ReadingPlan => ({
  id: 'p1',
  scope: JOHN,
  days: 21,
  startDate: '2026-11-10',
  scheduleVersion: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

const row = (planId: string, day: number): ReadingPlanDay => ({
  id: `${planId}:${day}`,
  planId,
  day,
  completedAt: new Date(0),
  updatedAt: new Date(0),
});

const state = () => useReadingPlanStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useReadingPlanStore.setState({ plans: [], dayRows: [], loaded: false });
});

describe('loadPlans', () => {
  it('loads plans and day rows and marks the store loaded', async () => {
    db.getAllReadingPlans.mockResolvedValueOnce([plan()]);
    db.getAllReadingPlanDays.mockResolvedValueOnce([row('p1', 1)]);

    await state().loadPlans();

    expect(state().plans).toHaveLength(1);
    expect(state().dayRows).toHaveLength(1);
    expect(state().loaded).toBe(true);
  });
});

describe('createPlan', () => {
  it('saves a version 1 plan starting on the given date', async () => {
    const created = await state().createPlan(JOHN, 21, '2026-11-13');

    expect(created).toMatchObject({ scope: JOHN, days: 21, startDate: '2026-11-13', scheduleVersion: 1 });
    expect(db.saveReadingPlan).toHaveBeenCalledWith(created);
    expect(state().plans).toEqual([created]);
  });

  it('refuses a day count the selection cannot support without writing anything', async () => {
    await expect(state().createPlan(JOHN, 22)).rejects.toThrow(RangeError);
    await expect(state().createPlan(JOHN, 0)).rejects.toThrow(RangeError);

    expect(db.saveReadingPlan).not.toHaveBeenCalled();
    expect(state().plans).toEqual([]);
  });

  it('allows the same selection twice', async () => {
    const first = await state().createPlan(JOHN, 21);
    const second = await state().createPlan(JOHN, 21);

    expect(first.id).not.toBe(second.id);
    expect(state().plans).toHaveLength(2);
  });
});

describe('completeDay and uncompleteDay', () => {
  beforeEach(() => {
    useReadingPlanStore.setState({ plans: [plan()] });
  });

  it('writes a row with the computed id and leaves the plan row alone', async () => {
    await state().completeDay('p1', 3);

    expect(db.saveReadingPlanDay).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1:3', planId: 'p1', day: 3 }));
    expect(db.saveReadingPlan).not.toHaveBeenCalled();
    expect(state().dayRows.map((r) => r.id)).toEqual(['p1:3']);
  });

  it('is idempotent', async () => {
    await state().completeDay('p1', 3);
    await state().completeDay('p1', 3);

    expect(db.saveReadingPlanDay).toHaveBeenCalledTimes(1);
    expect(state().dayRows).toHaveLength(1);
  });

  it('refuses a day outside the plan or a plan that is not loaded', async () => {
    await expect(state().completeDay('p1', 22)).rejects.toThrow(RangeError);
    await expect(state().completeDay('p1', 0)).rejects.toThrow(RangeError);
    await expect(state().completeDay('nope', 1)).rejects.toThrow(RangeError);

    expect(db.saveReadingPlanDay).not.toHaveBeenCalled();
  });

  it('unmarks by deleting the row', async () => {
    useReadingPlanStore.setState({ dayRows: [row('p1', 1), row('p1', 2)] });

    await state().uncompleteDay('p1', 1);

    expect(db.deleteReadingPlanDay).toHaveBeenCalledWith('p1:1');
    expect(state().dayRows.map((r) => r.id)).toEqual(['p1:2']);
    expect(db.saveReadingPlan).not.toHaveBeenCalled();
  });

  it('leaves state unchanged when the save fails', async () => {
    db.saveReadingPlanDay.mockRejectedValueOnce(new Error('disk full'));

    await expect(state().completeDay('p1', 1)).rejects.toThrow('disk full');
    expect(state().dayRows).toEqual([]);

    useReadingPlanStore.setState({ dayRows: [row('p1', 1)] });
    db.deleteReadingPlanDay.mockRejectedValueOnce(new Error('disk full'));

    await expect(state().uncompleteDay('p1', 1)).rejects.toThrow('disk full');
    expect(state().dayRows).toHaveLength(1);
  });
});

describe('shiftDates', () => {
  it('moves only the start date so the first incomplete day is due today', async () => {
    const behind = plan({ startDate: '2026-11-10' });
    useReadingPlanStore.setState({ plans: [behind], dayRows: [row('p1', 1)] });

    await state().shiftDates('p1', '2026-11-13');

    // Day 2 was due 2026-11-11; it is now due 2026-11-13.
    expect(db.saveReadingPlan).toHaveBeenCalledTimes(1);
    expect(state().plans[0]).toMatchObject({ id: 'p1', startDate: '2026-11-12', scope: JOHN, days: 21 });
    expect(db.saveReadingPlanDay).not.toHaveBeenCalled();
    expect(db.deleteReadingPlanDay).not.toHaveBeenCalled();
    expect(state().dayRows).toHaveLength(1);
    expect(planProgress(state().plans[0], state().dayRows, '2026-11-13')).toMatchObject({ day: 2, daysBehind: 0 });
  });

  it('does nothing when the plan is not behind', async () => {
    useReadingPlanStore.setState({ plans: [plan({ startDate: '2026-11-13' })] });

    await state().shiftDates('p1', '2026-11-13');

    expect(db.saveReadingPlan).not.toHaveBeenCalled();
  });

  it('does nothing for a finished plan or an unknown plan', async () => {
    useReadingPlanStore.setState({
      plans: [plan({ days: 1 })],
      dayRows: [row('p1', 1)],
    });

    await state().shiftDates('p1', '2026-12-01');
    await state().shiftDates('missing', '2026-12-01');

    expect(db.saveReadingPlan).not.toHaveBeenCalled();
  });

  it('leaves state unchanged when the save fails', async () => {
    useReadingPlanStore.setState({ plans: [plan()] });
    db.saveReadingPlan.mockRejectedValueOnce(new Error('disk full'));

    await expect(state().shiftDates('p1', '2026-11-13')).rejects.toThrow('disk full');
    expect(state().plans[0].startDate).toBe('2026-11-10');
  });
});

describe('deletePlan', () => {
  it('cascades through the database and drops that plan\'s rows from state only', async () => {
    useReadingPlanStore.setState({
      plans: [plan(), plan({ id: 'p2' })],
      dayRows: [row('p1', 1), row('p1', 2), row('p2', 1)],
    });

    await state().deletePlan('p1');

    expect(db.deleteReadingPlan).toHaveBeenCalledWith('p1');
    expect(state().plans.map((p) => p.id)).toEqual(['p2']);
    expect(state().dayRows.map((r) => r.id)).toEqual(['p2:1']);
  });

  it('leaves state unchanged when the delete fails before anything was written', async () => {
    useReadingPlanStore.setState({ plans: [plan()], dayRows: [row('p1', 1)] });
    db.deleteReadingPlan.mockRejectedValueOnce(new Error('disk full'));
    db.getAllReadingPlans.mockResolvedValueOnce([plan()]);
    db.getAllReadingPlanDays.mockResolvedValueOnce([row('p1', 1)]);

    await expect(state().deletePlan('p1')).rejects.toThrow('disk full');
    expect(state().plans).toHaveLength(1);
    expect(state().dayRows).toHaveLength(1);
  });

  it('reloads from the database when the delete fails partway, then rethrows', async () => {
    useReadingPlanStore.setState({
      plans: [plan()],
      dayRows: [row('p1', 1), row('p1', 2)],
      loaded: true,
    });
    db.deleteReadingPlan.mockRejectedValueOnce(new Error('disk full'));
    // One day row was deleted before the failure.
    db.getAllReadingPlans.mockResolvedValueOnce([plan()]);
    db.getAllReadingPlanDays.mockResolvedValueOnce([row('p1', 2)]);

    await expect(state().deletePlan('p1')).rejects.toThrow('disk full');
    expect(state().plans.map((p) => p.id)).toEqual(['p1']);
    expect(state().dayRows.map((r) => r.id)).toEqual(['p1:2']);
  });

  it('rethrows the delete error even when the reload fails too', async () => {
    useReadingPlanStore.setState({ plans: [plan()], dayRows: [row('p1', 1)] });
    db.deleteReadingPlan.mockRejectedValueOnce(new Error('disk full'));
    db.getAllReadingPlans.mockRejectedValueOnce(new Error('still broken'));

    await expect(state().deletePlan('p1')).rejects.toThrow('disk full');
    expect(state().plans).toHaveLength(1);
  });
});

describe('selectors over stored data', () => {
  it('tolerate orphan rows, a version 2 plan and a malformed scope', () => {
    const newer = plan({ id: 'v2', scheduleVersion: 2 });
    const malformed = plan({ id: 'bad', scope: { kind: 'x' } as unknown as ReadingPlan['scope'] });
    useReadingPlanStore.setState({
      plans: [plan(), newer, malformed],
      dayRows: [row('gone', 1), row('p1', 99)],
    });
    const { plans, dayRows } = state();

    expect(planProgress(plans[0], dayRows, '2026-11-13')).toMatchObject({ status: 'active', day: 1 });
    expect(planProgress(plans[1], dayRows, '2026-11-13')).toEqual({ status: 'unsupported' });
    expect(planProgress(plans[2], dayRows, '2026-11-13')).toEqual({ status: 'unsupported' });
  });
});
