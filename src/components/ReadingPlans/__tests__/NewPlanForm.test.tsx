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

import { NewPlanForm } from '../NewPlanForm';
import { chaptersPerDayLabel } from '../chaptersPerDay';
import { SAVE_ERROR } from '../planActions';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useToastStore } from '@/stores/toastStore';

const chooseBook = (id: string) => {
  fireEvent.click(screen.getByRole('radio', { name: 'One book' }));
  fireEvent.change(screen.getByLabelText('Book'), { target: { value: id } });
};
const typeDays = (value: string) =>
  fireEvent.change(screen.getByLabelText('How many days'), { target: { value } });
const startButton = () => screen.getByRole('button', { name: 'Start plan' }) as HTMLButtonElement;
const chipLabels = () =>
  Array.from(screen.queryByRole('group', { name: 'Suggested days' })?.querySelectorAll('button') ?? []).map(
    (b) => b.textContent
  );

beforeEach(() => {
  vi.clearAllMocks();
  useReadingPlanStore.setState({ plans: [], dayRows: [], loaded: true });
  useBibleStore.setState({ currentBook: 'Gen' });
  useToastStore.setState({ toasts: [] });
});
afterEach(cleanup);

describe('chaptersPerDayLabel', () => {
  it('says "1 chapter a day" for exactly one', () => {
    expect(chaptersPerDayLabel(21, 21)).toBe('1 chapter a day');
  });

  it('rounds to one decimal place and drops a trailing .0', () => {
    expect(chaptersPerDayLabel(1189, 365)).toBe('About 3.3 chapters a day');
    expect(chaptersPerDayLabel(21, 7)).toBe('About 3 chapters a day');
    expect(chaptersPerDayLabel(21, 1)).toBe('About 21 chapters a day');
  });
});

describe('NewPlanForm', () => {
  it('validates the day count for John: 30 is refused, 21 is accepted', () => {
    render(<NewPlanForm onCancel={vi.fn()} onCreated={vi.fn()} />);
    chooseBook('John');

    typeDays('30');
    expect(screen.getByText('Choose between 1 and 21 days.')).toBeTruthy();
    expect(startButton().disabled).toBe(true);

    typeDays('21');
    expect(screen.queryByText('Choose between 1 and 21 days.')).toBeNull();
    expect(startButton().disabled).toBe(false);
  });

  it('shows no error before anything is typed and rejects decimals and zero', () => {
    render(<NewPlanForm onCancel={vi.fn()} onCreated={vi.fn()} />);
    chooseBook('John');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(startButton().disabled).toBe(true);

    typeDays('2.5');
    expect(startButton().disabled).toBe(true);
    typeDays('0');
    expect(startButton().disabled).toBe(true);
  });

  it('offers chips by selection and only values the selection allows', () => {
    render(<NewPlanForm onCancel={vi.fn()} onCreated={vi.fn()} />);
    expect(chipLabels()).toEqual(['90', '180', '365']);

    chooseBook('John');
    expect(chipLabels()).toEqual(['7', '14']);

    chooseBook('Obad');
    expect(screen.queryByRole('group', { name: 'Suggested days' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'New Testament' }));
    expect(chipLabels()).toEqual(['30', '90', '180']);
  });

  it('fills the day count from a chip', () => {
    render(<NewPlanForm onCancel={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '90' }));
    expect((screen.getByLabelText('How many days') as HTMLInputElement).value).toBe('90');
    expect(screen.getByRole('button', { name: '90' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the chapters-a-day preview only when the value is valid', () => {
    render(<NewPlanForm onCancel={vi.fn()} onCreated={vi.fn()} />);
    chooseBook('John');
    expect(screen.queryByText(/chapters? a day/)).toBeNull();
    typeDays('30');
    expect(screen.queryByText(/chapters? a day/)).toBeNull();
    typeDays('21');
    expect(screen.getByText('1 chapter a day')).toBeTruthy();
    typeDays('7');
    expect(screen.getByText('About 3 chapters a day')).toBeTruthy();
  });

  it('defaults the book to the one being read', () => {
    useBibleStore.setState({ currentBook: 'Ps' });
    render(<NewPlanForm onCancel={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'One book' }));
    expect((screen.getByLabelText('Book') as HTMLSelectElement).value).toBe('Ps');
  });

  it('creates the plan and reports it', async () => {
    const onCreated = vi.fn();
    render(<NewPlanForm onCancel={vi.fn()} onCreated={onCreated} />);
    chooseBook('John');
    typeDays('21');
    fireEvent.click(startButton());

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const [plan] = useReadingPlanStore.getState().plans;
    expect(plan.scope).toEqual({ kind: 'book', bookId: 'John' });
    expect(plan.days).toBe(21);
  });

  it('saves once when Start plan is submitted twice in the same tick', async () => {
    const onCreated = vi.fn();
    render(<NewPlanForm onCancel={vi.fn()} onCreated={onCreated} />);
    chooseBook('John');
    typeDays('21');
    const form = startButton().closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(db.saveReadingPlan).toHaveBeenCalledTimes(1);
  });

  it('gives the day chips a 44px touch target', () => {
    render(<NewPlanForm onCancel={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole('button', { name: '90' }).className).toContain('min-h-[44px]');
  });

  it('keeps the form and shows the toast when saving fails', async () => {
    db.saveReadingPlan.mockRejectedValueOnce(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onCreated = vi.fn();
    render(<NewPlanForm onCancel={vi.fn()} onCreated={onCreated} />);
    chooseBook('John');
    typeDays('21');
    fireEvent.click(startButton());

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([SAVE_ERROR])
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect((screen.getByLabelText('How many days') as HTMLInputElement).value).toBe('21');
    expect(useReadingPlanStore.getState().plans).toEqual([]);
    expect(startButton().disabled).toBe(false);
  });

  it('calls onCancel', () => {
    const onCancel = vi.fn();
    render(<NewPlanForm onCancel={onCancel} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
