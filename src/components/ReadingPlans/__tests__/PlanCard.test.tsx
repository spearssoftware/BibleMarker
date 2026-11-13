/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({
  getAllReadingPlans: vi.fn(async (): Promise<unknown[]> => []),
  getAllReadingPlanDays: vi.fn(async (): Promise<unknown[]> => []),
  saveReadingPlan: vi.fn(async (_plan: unknown) => 'id'),
  saveReadingPlanDay: vi.fn(async (_row: unknown) => 'id'),
  deleteReadingPlanDay: vi.fn(async (_id: string) => {}),
  deleteReadingPlan: vi.fn(async (_id: string) => {}),
}));
vi.mock('@/lib/database', () => db);

import type { ReadingPlan, ReadingPlanDay } from '@/types';
import { PlanCard } from '../PlanCard';
import { ConfirmDialogHost } from '@/components/shared';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import { useBibleStore } from '@/stores/bibleStore';
import { addDays, planProgress, todayLocal } from '@/lib/readingPlans';

const FIXED_NOW = new Date(2026, 10, 13, 12, 0, 0);

const makePlan = (overrides: Partial<ReadingPlan> = {}): ReadingPlan => ({
  id: 'p1',
  scope: { kind: 'book', bookId: 'John' },
  days: 21,
  startDate: addDays(todayLocal(), -3),
  scheduleVersion: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

const dayRow = (planId: string, day: number): ReadingPlanDay => ({
  id: `${planId}:${day}`,
  planId,
  day,
  completedAt: new Date(0),
  updatedAt: new Date(0),
});

/** Reads the store like the panel does, so a change shows up in the card. */
function Harness({ planId, onNavigate = vi.fn() }: { planId: string; onNavigate?: () => void }) {
  const plan = useReadingPlanStore((s) => s.plans.find((p) => p.id === planId));
  const dayRows = useReadingPlanStore((s) => s.dayRows);
  if (!plan) return <div>gone</div>;
  return (
    <>
      <PlanCard
        plan={plan}
        progress={planProgress(plan, dayRows, todayLocal())}
        onOpen={vi.fn()}
        onNavigate={onNavigate}
      />
      <ConfirmDialogHost />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
  useBibleStore.setState({ currentBook: 'Gen', currentChapter: 1 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PlanCard', () => {
  it('shows the name, day, reading and Read for an active plan', () => {
    const plan = makePlan({ startDate: todayLocal() });
    useReadingPlanStore.setState({ plans: [plan], dayRows: [dayRow('p1', 1)], loaded: true });
    const onNavigate = vi.fn();
    render(<Harness planId="p1" onNavigate={onNavigate} />);

    expect(screen.getByText('John in 21 days')).toBeTruthy();
    expect(screen.getByText('Day 2 of 21')).toBeTruthy();
    expect(screen.getByText('John 2')).toBeTruthy();
    expect(screen.queryByText(/behind/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(useBibleStore.getState().currentChapter).toBe(2);
    expect(useBibleStore.getState().currentBook).toBe('John');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('shows "3 days behind" and Shift my dates removes the line without completing anything', async () => {
    useReadingPlanStore.setState({ plans: [makePlan()], dayRows: [], loaded: true });
    render(<Harness planId="p1" />);

    expect(screen.getByText('3 days behind')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Shift my dates' }));

    await waitFor(() => expect(screen.queryByText(/behind/)).toBeNull());
    expect(screen.queryByRole('button', { name: 'Shift my dates' })).toBeNull();
    expect(screen.getByText('Day 1 of 21')).toBeTruthy();
    expect(db.saveReadingPlanDay).not.toHaveBeenCalled();
    expect(db.deleteReadingPlanDay).not.toHaveBeenCalled();
    expect(useReadingPlanStore.getState().dayRows).toEqual([]);
    expect(useReadingPlanStore.getState().plans[0].startDate).toBe(todayLocal());
  });

  it('says "1 day behind" in the singular', () => {
    useReadingPlanStore.setState({
      plans: [makePlan({ startDate: addDays(todayLocal(), -1) })],
      dayRows: [],
      loaded: true,
    });
    render(<Harness planId="p1" />);
    expect(screen.getByText('1 day behind')).toBeTruthy();
  });

  it('shows Finished with no Read button', () => {
    const plan = makePlan({ days: 1, scope: { kind: 'book', bookId: 'Obad' } });
    useReadingPlanStore.setState({ plans: [plan], dayRows: [dayRow('p1', 1)], loaded: true });
    render(<Harness planId="p1" />);

    expect(screen.getByText('Finished')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Read' })).toBeNull();
  });

  it('lists a plan from a newer version with only Delete plan', () => {
    const plan = makePlan({ scheduleVersion: 99 });
    useReadingPlanStore.setState({ plans: [plan], dayRows: [], loaded: true });
    render(<Harness planId="p1" />);

    expect(screen.getByText('John in 21 days')).toBeTruthy();
    expect(screen.getByText('This plan needs a newer version of BibleMarker.')).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Delete plan']);
  });

  it('deletes a newer-version plan after confirmation', async () => {
    useReadingPlanStore.setState({ plans: [makePlan({ scheduleVersion: 99 })], dayRows: [], loaded: true });
    render(<Harness planId="p1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('gone')).toBeTruthy());
    expect(db.deleteReadingPlan).toHaveBeenCalledWith('p1');
  });
});
