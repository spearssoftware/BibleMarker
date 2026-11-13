/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

const db = vi.hoisted(() => {
  const plans = new Map<string, unknown>();
  const days = new Map<string, unknown>();
  return {
    plans,
    days,
    getAllReadingPlans: vi.fn(async () => [...plans.values()]),
    getAllReadingPlanDays: vi.fn(async () => [...days.values()]),
    saveReadingPlan: vi.fn(async (plan: { id: string }) => {
      plans.set(plan.id, plan);
      return plan.id;
    }),
    saveReadingPlanDay: vi.fn(async (row: { id: string }) => {
      days.set(row.id, row);
      return row.id;
    }),
    deleteReadingPlanDay: vi.fn(async (id: string) => {
      days.delete(id);
    }),
    deleteReadingPlan: vi.fn(async (id: string) => {
      plans.delete(id);
      for (const [key, row] of days) if ((row as { planId: string }).planId === id) days.delete(key);
    }),
  };
});
vi.mock('@/lib/database', () => db);

import type { ReadingPlan } from '@/types';
import { ReadingPlansPanel } from '../ReadingPlansPanel';
import { ConfirmDialogHost } from '@/components/shared';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import { useBibleStore } from '@/stores/bibleStore';
import { addDays, todayLocal } from '@/lib/readingPlans';

const makePlan = (id: string, overrides: Partial<ReadingPlan> = {}): ReadingPlan => ({
  id,
  scope: { kind: 'book', bookId: 'John' },
  days: 21,
  startDate: todayLocal(),
  scheduleVersion: 1,
  createdAt: new Date(1000),
  updatedAt: new Date(1000),
  ...overrides,
});

const panel = (onNavigate = vi.fn()) => (
  <>
    <ReadingPlansPanel onNavigate={onNavigate} />
    <ConfirmDialogHost />
  </>
);

async function mountPanel(onNavigate = vi.fn()) {
  const view = render(panel(onNavigate));
  await act(async () => {});
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.plans.clear();
  db.days.clear();
  useReadingPlanStore.setState({ plans: [], dayRows: [], loaded: false });
  useBibleStore.setState({ currentBook: 'Gen', currentChapter: 1 });
});
afterEach(cleanup);

describe('ReadingPlansPanel', () => {
  it('shows the empty state with a New plan button', async () => {
    await mountPanel();
    expect(screen.getByText('No reading plans yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New plan' })).toBeTruthy();
  });

  it('renders nothing before the plans have loaded', () => {
    render(panel());
    expect(screen.queryByText('No reading plans yet.')).toBeNull();
  });

  it('starts a plan end to end and lists it', async () => {
    await mountPanel();
    fireEvent.click(screen.getByRole('button', { name: 'New plan' }));
    fireEvent.click(screen.getByRole('radio', { name: 'One book' }));
    fireEvent.change(screen.getByLabelText('Book'), { target: { value: 'John' } });
    const days = screen.getByLabelText('How many days');
    const start = screen.getByRole('button', { name: 'Start plan' }) as HTMLButtonElement;

    fireEvent.change(days, { target: { value: '30' } });
    expect(screen.getByText('Choose between 1 and 21 days.')).toBeTruthy();
    expect(start.disabled).toBe(true);

    fireEvent.change(days, { target: { value: '21' } });
    expect(start.disabled).toBe(false);
    fireEvent.click(start);

    expect(await screen.findByText('John in 21 days')).toBeTruthy();
    expect(screen.getByText('Day 1 of 21')).toBeTruthy();
    expect(screen.getByText('John 1')).toBeTruthy();
    expect(screen.queryByText('No reading plans yet.')).toBeNull();
  });

  it('returns to the list on Cancel', async () => {
    await mountPanel();
    fireEvent.click(screen.getByRole('button', { name: 'New plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('No reading plans yet.')).toBeTruthy();
  });

  it('lists unfinished plans first, newest first within each group', async () => {
    db.plans.set('old', makePlan('old', { createdAt: new Date(1000), days: 21 }));
    db.plans.set('new', makePlan('new', { createdAt: new Date(3000), days: 14 }));
    db.plans.set('done', makePlan('done', { createdAt: new Date(5000), days: 1, scope: { kind: 'book', bookId: 'Obad' } }));
    db.days.set('done:1', { id: 'done:1', planId: 'done', day: 1, completedAt: new Date(0), updatedAt: new Date(0) });
    await mountPanel();

    const names = screen
      .getAllByText(/ in \d+ days?$/)
      .map((el) => el.textContent);
    expect(names).toEqual(['John in 14 days', 'John in 21 days', 'Obadiah in 1 day']);
  });

  it('shows a plan three days behind and Shift my dates clears it', async () => {
    db.plans.set('p1', makePlan('p1', { startDate: addDays(todayLocal(), -3) }));
    await mountPanel();

    expect(screen.getByText('3 days behind')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Shift my dates' }));

    await waitFor(() => expect(screen.queryByText(/behind/)).toBeNull());
    expect(db.saveReadingPlanDay).not.toHaveBeenCalled();
    expect(db.days.size).toBe(0);
  });

  it('keeps a checked day after the panel is closed and reopened, and unchecking removes it', async () => {
    db.plans.set('p1', makePlan('p1'));
    const first = await mountPanel();
    fireEvent.click(screen.getByRole('button', { name: 'John in 21 days' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Day 2: John 2' }));
    await waitFor(() => expect(db.days.has('p1:2')).toBe(true));
    first.unmount();

    useReadingPlanStore.setState({ plans: [], dayRows: [], loaded: false });
    await mountPanel();
    fireEvent.click(screen.getByRole('button', { name: 'John in 21 days' }));
    const box = screen.getByRole('checkbox', { name: 'Day 2: John 2' }) as HTMLInputElement;
    expect(box.checked).toBe(true);

    fireEvent.click(box);
    await waitFor(() => expect(box.checked).toBe(false));
    expect(db.days.has('p1:2')).toBe(false);
  });

  it('opens a plan and returns to the list with Back', async () => {
    db.plans.set('p1', makePlan('p1'));
    await mountPanel();
    fireEvent.click(screen.getByRole('button', { name: 'John in 21 days' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(21);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'New plan' })).toBeTruthy();
  });

  it('deletes a plan after Delete and keeps it on Cancel', async () => {
    db.plans.set('p1', makePlan('p1'));
    await mountPanel();
    fireEvent.click(screen.getByRole('button', { name: 'John in 21 days' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Delete this plan?')).toBeNull());
    expect(db.plans.has('p1')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('No reading plans yet.')).toBeTruthy();
    expect(db.plans.has('p1')).toBe(false);
  });

  it('goes to the first chapter of the day and tells the host', async () => {
    db.plans.set('p1', makePlan('p1'));
    const onNavigate = vi.fn();
    await mountPanel(onNavigate);

    fireEvent.click(screen.getByRole('button', { name: 'Read' }));

    expect(useBibleStore.getState().currentBook).toBe('John');
    expect(useBibleStore.getState().currentChapter).toBe(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
