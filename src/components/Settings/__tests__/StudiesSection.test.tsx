/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Study } from '@/types';
import { makeStudy } from '@/lib/__test__/factories';

const { db } = vi.hoisted(() => ({ db: { studies: [] as Study[] } }));

vi.mock('@/lib/database', () => ({
  getAllStudies: vi.fn(async () => db.studies.map(s => ({ ...s }))),
  saveStudy: vi.fn(async (study: Study) => {
    db.studies = db.studies.map(s => (s.id === study.id ? study : s));
  }),
  deleteStudy: vi.fn(async () => {}),
}));
vi.mock('@/lib/observation-pdf', () => ({
  saveStudyObservationPdf: vi.fn(),
  openSavedPdf: vi.fn(),
}));
vi.mock('@/lib/export', () => ({ exportStudyData: vi.fn() }));

import { StudiesSection } from '../StudiesSection';
import { useStudyStore } from '@/stores/studyStore';

function myBibleRow(): HTMLElement {
  return screen.getByText('My Bible').closest('div.p-4') as HTMLElement;
}

describe('StudiesSection', () => {
  beforeEach(() => {
    db.studies = [makeStudy({ id: 'study-1', name: 'Romans' })];
    useStudyStore.setState({ studies: [], activeStudyId: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('lists My Bible first, active when no study is selected, with no Edit, Delete or Export PDF', async () => {
    render(<StudiesSection />);
    await screen.findByText('Romans');

    const rows = screen.getAllByText(/^(My Bible|Romans)$/);
    expect(rows.map(r => r.textContent)).toEqual(['My Bible', 'Romans']);

    const row = within(myBibleRow());
    expect(row.getByText('Marks you make in Read and Discover go here.')).toBeTruthy();
    expect(row.getByText('Active')).toBeTruthy();
    expect(row.queryByRole('button', { name: 'Set My Bible active' })).toBeNull();
    expect(row.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(row.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(row.queryByRole('button', { name: 'Export PDF' })).toBeNull();
  });

  it('has no Clear Active Study button', async () => {
    useStudyStore.setState({ activeStudyId: 'study-1' });
    render(<StudiesSection />);
    await screen.findByText('Romans');

    expect(screen.queryByRole('button', { name: 'Clear Active Study' })).toBeNull();
  });

  it('moves the badge to a real study and back to My Bible', async () => {
    const user = userEvent.setup();
    render(<StudiesSection />);
    await screen.findByText('Romans');

    await user.click(screen.getByRole('button', { name: 'Set Romans active' }));
    await waitFor(() => expect(useStudyStore.getState().activeStudyId).toBe('study-1'));

    const row = within(myBibleRow());
    expect(row.queryByText('Active')).toBeNull();
    await user.click(row.getByRole('button', { name: 'Set My Bible active' }));
    await waitFor(() => expect(useStudyStore.getState().activeStudyId).toBeNull());
    expect(within(myBibleRow()).getByText('Active')).toBeTruthy();
  });

  it('keeps the empty-state text under My Bible when there are no studies', async () => {
    db.studies = [];
    render(<StudiesSection />);

    expect(await screen.findByText('No studies yet. Create one above to get started.')).toBeTruthy();
    expect(screen.getByText('My Bible')).toBeTruthy();
  });
});
