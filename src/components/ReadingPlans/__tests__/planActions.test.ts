import { describe, it, expect, vi, beforeEach } from 'vitest';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));

const store = vi.hoisted(() => ({
  createPlan: vi.fn(async () => ({})),
  completeDay: vi.fn(async () => {}),
  uncompleteDay: vi.fn(async () => {}),
}));
vi.mock('@/stores/readingPlanStore', () => ({
  useReadingPlanStore: { getState: () => store },
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('@/stores/toastStore', () => ({ toast: { error: toastError } }));

import { markDayComplete, startPlan, unmarkDay } from '../planActions';

describe('planActions telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('counts a started plan after the save succeeds', async () => {
    expect(await startPlan({ kind: 'bible' }, 365)).toBe(true);
    expect(track).toHaveBeenCalledExactlyOnceWith('plan_started');
  });

  it('does not count a plan that failed to save', async () => {
    store.createPlan.mockRejectedValueOnce(new Error('disk full'));
    expect(await startPlan({ kind: 'bible' }, 365)).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });

  it('counts a completed day after the save succeeds', async () => {
    expect(await markDayComplete('p1', 1)).toBe(true);
    expect(track).toHaveBeenCalledExactlyOnceWith('plan_day_completed');
  });

  it('does not count a day that failed to save', async () => {
    store.completeDay.mockRejectedValueOnce(new Error('disk full'));
    expect(await markDayComplete('p1', 1)).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });

  it('never counts unmarking a day', async () => {
    await unmarkDay('p1', 1);
    expect(track).not.toHaveBeenCalled();
  });
});
