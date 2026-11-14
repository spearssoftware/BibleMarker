/**
 * @vitest-environment jsdom
 *
 * With two translations side by side, a reading plan's strip and end action
 * appear once, across the full width, inside the verse content element and
 * apart from the verse rows the position hooks measure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, within } from '@testing-library/react';
import { MultiTranslationView } from '../MultiTranslationView';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { useAppModeStore } from '@/stores/appModeStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import { todayLocal } from '@/lib/readingPlans';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/bible-api', () => ({
  getAllTranslations: vi.fn().mockResolvedValue([
    { id: 'kjv', name: 'King James', abbreviation: 'KJV', language: 'en', provider: 'sword' },
    { id: 'asv', name: 'American Standard', abbreviation: 'ASV', language: 'en', provider: 'sword' },
  ]),
  fetchChapter: vi.fn(async (_translationId: string, book: string, chapter: number) => ({
    book,
    chapter,
    verses: [1, 2].map((verse) => ({ ref: { book, chapter, verse }, text: `Verse ${verse}` })),
  })),
}));
vi.mock('@/lib/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/database')>()),
  getChapterAnnotations: vi.fn().mockResolvedValue([]),
  getChapterHeadings: vi.fn().mockResolvedValue([]),
  getChapterTitle: vi.fn().mockResolvedValue(null),
  getChapterNotes: vi.fn().mockResolvedValue([]),
}));

const view = (id: string) => ({ id, name: id, translationIds: ['kjv', 'asv'], createdAt: new Date(), updatedAt: new Date() });

beforeEach(() => {
  useAppModeStore.setState({ mode: 'read' });
  useBibleStore.setState({ currentBook: 'John', currentChapter: 1 });
  useMultiTranslationStore.setState({ activeView: view('v') as never, loadActiveView: vi.fn() });
  useReadingPlanStore.setState({
    plans: [
      {
        id: 'p1',
        scope: { kind: 'book', bookId: 'John' },
        days: 21,
        startDate: todayLocal(),
        scheduleVersion: 1,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ],
    dayRows: [],
    loaded: true,
  });
});

afterEach(cleanup);

describe('MultiTranslationView reading plans', () => {
  it('shows one strip and one end action for two translations, outside the verse rows', async () => {
    const { container } = render(<MultiTranslationView />);
    const markButton = await screen.findByRole('button', { name: 'Mark day 1 complete' });

    const strips = screen.getAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'John in 21 days · Day 1 · John 1');
    expect(strips).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Mark day 1 complete' })).toHaveLength(1);

    const scroller = container.querySelector('.custom-scrollbar') as HTMLElement;
    const content = scroller.querySelector(':scope > div.px-6.py-4') as HTMLElement;
    expect(content.contains(strips[0])).toBe(true);
    expect(content.contains(markButton)).toBe(true);
    // The strip is the first thing in the content, the actions come after the last verse.
    expect(content.firstElementChild?.contains(strips[0])).toBe(true);
    expect(content.firstElementChild?.hasAttribute('data-verse')).toBe(false);
    expect(content.firstElementChild?.classList.contains('grid')).toBe(false);

    const rows = scroller.querySelectorAll('.grid[data-verse]');
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row.contains(strips[0])).toBe(false);
      expect(within(row as HTMLElement).queryByRole('button', { name: 'Mark day 1 complete' })).toBeNull();
    });
    for (const el of [strips[0], markButton]) {
      expect(el.closest('[data-verse], .grid')).toBeNull();
    }
  });

  it('shows nothing on a chapter that no plan is on', async () => {
    useBibleStore.setState({ currentBook: 'Gen', currentChapter: 1 });
    const { container } = render(<MultiTranslationView />);
    await screen.findAllByText('Verse 1');

    expect(container.querySelector('[data-reader-plan-strip]')).toBeNull();
    expect(screen.queryByRole('button', { name: /Mark day/ })).toBeNull();
  });
});
