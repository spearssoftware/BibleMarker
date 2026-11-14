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
const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));

import type { ReadingPlan, ReadingPlanDay } from '@/types';
import { PlanDetail } from '../PlanDetail';
import { SAVE_ERROR } from '../planActions';
import { ConfirmDialogHost } from '@/components/shared';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useToastStore } from '@/stores/toastStore';

const plan: ReadingPlan = {
  id: 'p1',
  scope: { kind: 'book', bookId: 'John' },
  days: 21,
  startDate: '2026-11-10',
  scheduleVersion: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const dayRow = (day: number): ReadingPlanDay => ({
  id: `p1:${day}`,
  planId: 'p1',
  day,
  completedAt: new Date(0),
  updatedAt: new Date(0),
});

const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

function renderDetail(onBack = vi.fn(), onNavigate = vi.fn()) {
  render(
    <>
      <PlanDetail planId="p1" onBack={onBack} onNavigate={onNavigate} />
      <ConfirmDialogHost />
    </>
  );
  return { onBack, onNavigate };
}

beforeEach(() => {
  vi.clearAllMocks();
  useReadingPlanStore.setState({ plans: [plan], dayRows: [], loaded: true });
  useBibleStore.setState({ currentBook: 'Gen', currentChapter: 1 });
  useToastStore.setState({ toasts: [] });
});
afterEach(cleanup);

describe('PlanDetail', () => {
  it('lists every day with its reading', () => {
    renderDetail();
    expect(screen.getAllByRole('checkbox')).toHaveLength(21);
    expect(box('Day 1: John 1')).toBeTruthy();
    expect(box('Day 21: John 21')).toBeTruthy();
  });

  it('checks and unchecks a day', async () => {
    renderDetail();
    expect(box('Day 2: John 2').checked).toBe(false);

    fireEvent.click(box('Day 2: John 2'));
    await waitFor(() => expect(box('Day 2: John 2').checked).toBe(true));
    expect(db.saveReadingPlanDay).toHaveBeenCalledTimes(1);
    expect(useReadingPlanStore.getState().dayRows.map((r) => r.id)).toEqual(['p1:2']);

    fireEvent.click(box('Day 2: John 2'));
    await waitFor(() => expect(box('Day 2: John 2').checked).toBe(false));
    expect(db.deleteReadingPlanDay).toHaveBeenCalledWith('p1:2');
  });

  it('writes and counts a day once when the box is tapped twice', async () => {
    renderDetail();
    fireEvent.click(box('Day 2: John 2'));
    fireEvent.click(box('Day 2: John 2'));
    await waitFor(() => expect(box('Day 2: John 2').checked).toBe(true));
    expect(db.saveReadingPlanDay).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('leaves the box as it was and shows the toast when saving fails', async () => {
    db.saveReadingPlanDay.mockRejectedValueOnce(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderDetail();

    fireEvent.click(box('Day 2: John 2'));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([SAVE_ERROR])
    );
    expect(box('Day 2: John 2').checked).toBe(false);
  });

  it('goes to a reading\'s first chapter', () => {
    const { onNavigate } = renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'John 5' }));
    expect(useBibleStore.getState().currentBook).toBe('John');
    expect(useBibleStore.getState().currentChapter).toBe(5);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('scrolls only the list to the first incomplete day, keeping the header outside it', () => {
    useReadingPlanStore.setState({ dayRows: [dayRow(1), dayRow(2), dayRow(3)] });
    const offsetTop = vi
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return Number(this.dataset.day ?? 0) * 100;
      });
    renderDetail();
    const scrollers = document.querySelectorAll('.overflow-y-auto');
    expect(scrollers).toHaveLength(1);
    const scroller = scrollers[0] as HTMLElement;
    expect(scroller.scrollTop).toBe(400);
    expect(scroller.contains(screen.getByRole('button', { name: 'Back' }))).toBe(false);
    expect(scroller.contains(screen.getByRole('button', { name: 'Delete plan' }))).toBe(false);
    offsetTop.mockRestore();
  });

  it('does not scroll when day 1 is the first incomplete day', () => {
    const offsetTop = vi
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return Number(this.dataset.day ?? 0) * 100;
      });
    renderDetail();
    const scroller = document.querySelector('.overflow-y-auto') as HTMLElement;
    expect(scroller.scrollTop).toBe(0);
    offsetTop.mockRestore();
  });

  it('deletes the plan after Delete and goes back', async () => {
    const { onBack } = renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }));
    expect(await screen.findByText('Delete this plan?')).toBeTruthy();
    expect(screen.getByText('Your marks and notes in the text are not affected.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(db.deleteReadingPlan).toHaveBeenCalledWith('p1');
    expect(useReadingPlanStore.getState().plans).toEqual([]);
  });

  it('keeps the plan on Cancel', async () => {
    const { onBack } = renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByText('Delete this plan?')).toBeNull());
    expect(onBack).not.toHaveBeenCalled();
    expect(db.deleteReadingPlan).not.toHaveBeenCalled();
    expect(useReadingPlanStore.getState().plans).toHaveLength(1);
  });

  it('goes back when the plan is gone', () => {
    useReadingPlanStore.setState({ plans: [] });
    const { onBack } = renderDetail();
    expect(onBack).toHaveBeenCalled();
  });
});
