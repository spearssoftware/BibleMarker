/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const markDayComplete = vi.hoisted(() => vi.fn());
vi.mock('@/components/ReadingPlans/planActions', () => ({ markDayComplete }));

import { useReaderPlans } from '../useReaderPlans';
import { useBibleStore } from '@/stores/bibleStore';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import { todayLocal } from '@/lib/readingPlans';
import type { ReadingPlan, ReadingPlanDay } from '@/types';

const john: ReadingPlan = {
  id: 'p1',
  scope: { kind: 'book', bookId: 'John' },
  days: 21,
  startDate: todayLocal(),
  scheduleVersion: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const row: ReadingPlanDay = {
  id: 'p1:1',
  planId: 'p1',
  day: 1,
  completedAt: new Date(0),
  updatedAt: new Date(0),
};

function goTo(book: string, chapter: number) {
  act(() => useBibleStore.setState({ currentBook: book, currentChapter: chapter }));
}

/** Reading the store like the app does: a successful mark adds the day row. */
function markSucceeds() {
  markDayComplete.mockImplementation(async () => {
    useReadingPlanStore.setState({ dayRows: [row] });
    return true;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useBibleStore.setState({ currentBook: 'John', currentChapter: 1 });
  useReadingPlanStore.setState({ plans: [john], dayRows: [], loaded: true });
});

describe('useReaderPlans', () => {
  it('reports the plan whose current day contains the chapter', () => {
    const { result } = renderHook(() => useReaderPlans('John', 1));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({ kind: 'current', day: 1 });
  });

  it('turns the entry into a completed one after a successful mark', async () => {
    markSucceeds();
    const { result } = renderHook(() => useReaderPlans('John', 1));
    await act(async () => { await result.current.complete('p1', 1); });
    expect(markDayComplete).toHaveBeenCalledWith('p1', 1);
    expect(result.current.entries[0]).toMatchObject({ kind: 'completed', day: 1 });
  });

  it('never renders an empty list between the store write and the confirmation', async () => {
    markSucceeds();
    const lengths: number[] = [];
    const { result } = renderHook(() => {
      const value = useReaderPlans('John', 1);
      lengths.push(value.entries.length);
      return value;
    });
    await act(async () => { await result.current.complete('p1', 1); });
    expect(lengths.every((n) => n === 1)).toBe(true);
  });

  it('keeps the entry as completed when the day is ticked elsewhere', () => {
    const { result } = renderHook(() => useReaderPlans('John', 1));
    expect(result.current.entries[0].kind).toBe('current');
    act(() => useReadingPlanStore.setState({ dayRows: [row] }));
    expect(result.current.entries[0]).toMatchObject({ kind: 'completed', day: 1 });
  });

  it('stays current after a failed mark', async () => {
    markDayComplete.mockResolvedValue(false);
    const { result } = renderHook(() => useReaderPlans('John', 1));
    await act(async () => { await result.current.complete('p1', 1); });
    expect(result.current.entries[0]).toMatchObject({ kind: 'current' });
  });

  it('marks the plan pending while saving', async () => {
    let finish: (ok: boolean) => void = () => {};
    markDayComplete.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useReaderPlans('John', 1));
    let done: Promise<void> = Promise.resolve();
    act(() => { done = result.current.complete('p1', 1); });
    expect(result.current.pending.has('p1')).toBe(true);
    await act(async () => { finish(false); await done; });
    expect(result.current.pending.has('p1')).toBe(false);
  });

  it('forgets a completed day after leaving the chapter, including A to B to A', async () => {
    markSucceeds();
    const { result, rerender } = renderHook(
      ({ chapter }) => useReaderPlans('John', chapter),
      { initialProps: { chapter: 1 } }
    );
    await act(async () => { await result.current.complete('p1', 1); });
    expect(result.current.entries[0].kind).toBe('completed');

    goTo('John', 2);
    rerender({ chapter: 2 });
    goTo('John', 1);
    rerender({ chapter: 1 });
    // The day is complete in the store, so chapter 1 is no longer anyone's current day.
    await waitFor(() => expect(result.current.entries).toEqual([]));
  });

  it('drops a mark that finishes saving after the reader has moved on', async () => {
    let finish: (ok: boolean) => void = () => {};
    markDayComplete.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook(
      ({ chapter }) => useReaderPlans('John', chapter),
      { initialProps: { chapter: 1 } }
    );
    let done: Promise<void> = Promise.resolve();
    act(() => { done = result.current.complete('p1', 1); });
    goTo('John', 2);
    rerender({ chapter: 2 });
    useReadingPlanStore.setState({ dayRows: [row] });
    await act(async () => { finish(true); await done; });
    goTo('John', 1);
    rerender({ chapter: 1 });
    expect(result.current.entries).toEqual([]);
  });
});
