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
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

import type { ReadingPlan } from '@/types';
import { ReaderPlanStrip } from '../ReaderPlanStrip';
import { ReaderPlanEndActions } from '../ReaderPlanEndActions';
import { useReaderPlans } from '@/hooks/useReaderPlans';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useToastStore } from '@/stores/toastStore';
import { todayLocal } from '@/lib/readingPlans';

const makePlan = (overrides: Partial<ReadingPlan> = {}): ReadingPlan => ({
  id: 'p1',
  scope: { kind: 'book', bookId: 'John' },
  days: 21,
  startDate: todayLocal(),
  scheduleVersion: 1,
  createdAt: new Date(1000),
  updatedAt: new Date(1000),
  ...overrides,
});

/** The pieces MultiTranslationView mounts, driven by the open chapter like the reader is. */
function Harness() {
  const book = useBibleStore((s) => s.currentBook);
  const chapter = useBibleStore((s) => s.currentChapter);
  const { entries, complete, pending } = useReaderPlans(book, chapter);
  return (
    <>
      <ReaderPlanStrip entries={entries} />
      <ReaderPlanEndActions entries={entries} onComplete={complete} pending={pending} />
    </>
  );
}

const stripText = (text: string) =>
  screen.queryByText((_, el) => el?.tagName === 'P' && el.textContent === text);

const setPlans = (...plans: ReadingPlan[]) =>
  useReadingPlanStore.setState({ plans, dayRows: [], loaded: true });

beforeEach(() => {
  vi.clearAllMocks();
  useBibleStore.setState({ currentBook: 'John', currentChapter: 1 });
  useToastStore.setState({ toasts: [] });
});
afterEach(cleanup);

describe('reader plan strip and end actions', () => {
  it('shows the strip and completes the day from the end of the chapter', async () => {
    setPlans(makePlan());
    render(<Harness />);

    expect(stripText('John in 21 days · Day 1 · John 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark day 1 complete' }));

    await waitFor(() => expect(screen.getByText('Day 1 complete.')).toBeTruthy());
    expect(screen.getByText('Next: John 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark day 1 complete' })).toBeNull();
    // The strip stays until the reader leaves the chapter.
    expect(stripText('John in 21 days · Day 1 · John 1')).toBeTruthy();
    expect(db.saveReadingPlanDay).toHaveBeenCalledTimes(1);
  });

  it('"Read on" opens the first chapter of the next day', async () => {
    setPlans(makePlan());
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark day 1 complete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Read on' }));

    expect(useBibleStore.getState().currentChapter).toBe(2);
    await waitFor(() => expect(stripText('John in 21 days · Day 2 · John 2')).toBeTruthy());
    expect(screen.queryByText('Day 1 complete.')).toBeNull();
  });

  it('says nothing more after the last day is completed', async () => {
    setPlans(makePlan({ scope: { kind: 'book', bookId: 'Phlm' }, days: 1 }));
    useBibleStore.setState({ currentBook: 'Phlm', currentChapter: 1 });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark day 1 complete' }));

    await waitFor(() => expect(screen.getByText('Day 1 complete.')).toBeTruthy());
    expect(screen.queryByText(/Next:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Read on' })).toBeNull();
  });

  it('offers "Continue to" when the day has a later chapter, and opens it', () => {
    setPlans(makePlan({ scope: { kind: 'book', bookId: 'Hag' }, days: 1 }));
    useBibleStore.setState({ currentBook: 'Hag', currentChapter: 1 });
    render(<Harness />);

    expect(stripText('Haggai in 1 day · Day 1 · Haggai 1–2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mark day/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Haggai 2' }));
    expect(useBibleStore.getState().currentBook).toBe('Hag');
    expect(useBibleStore.getState().currentChapter).toBe(2);
  });

  it('shows nothing on a chapter no plan is on', () => {
    setPlans(makePlan());
    useBibleStore.setState({ currentBook: 'Gen', currentChapter: 1 });
    const { container } = render(<Harness />);

    expect(container.textContent).toBe('');
  });

  it('stacks two plans on the same chapter in list order', () => {
    setPlans(
      makePlan({ id: 'old', createdAt: new Date(1000) }),
      makePlan({ id: 'new', days: 7, createdAt: new Date(2000) })
    );
    render(<Harness />);

    const lines = screen.getAllByText((_, el) => el?.tagName === 'P' && /· Day 1 ·/.test(el.textContent ?? ''));
    expect(lines.map((el) => el.textContent)).toEqual([
      'John in 7 days · Day 1 · John 1–3',
      'John in 21 days · Day 1 · John 1',
    ]);
    expect(screen.getAllByRole('button', { name: /^(Continue to John 2|Mark day 1 complete)$/ })).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'John in 7 days' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'John in 21 days' })).toBeTruthy();
  });

  it('shows the save toast and keeps the button when marking fails', async () => {
    setPlans(makePlan());
    db.saveReadingPlanDay.mockRejectedValueOnce(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark day 1 complete' }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
        "Couldn't save your reading plan. Try again.",
      ])
    );
    expect(screen.getByRole('button', { name: 'Mark day 1 complete' })).toBeTruthy();
    expect(screen.queryByText('Day 1 complete.')).toBeNull();
  });

  it('carries neither data-verse nor the grid class', () => {
    setPlans(makePlan());
    const { container } = render(<Harness />);
    expect(container.querySelector('[data-verse]')).toBeNull();
    expect(container.querySelector('.grid')).toBeNull();
  });
});
