/**
 * @vitest-environment jsdom
 *
 * KeyWordManager simple mode (inductive tools off): list, search, and a
 * word / style / color editor. New marks default to a custom, chapter-scoped
 * preset in the active study; editing keeps the fields simple mode hides.
 */

import type { ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MarkingPreset } from '@/types';
import { createMarkingPreset } from '@/types';

const { db } = vi.hoisted(() => ({ db: { presets: [] as MarkingPreset[] } }));

vi.mock('@/lib/database', () => ({
  getAllMarkingPresets: vi.fn(async () => db.presets.map(p => ({ ...p }))),
  saveMarkingPreset: vi.fn(async (preset: MarkingPreset) => {
    db.presets = [...db.presets.filter(p => p.id !== preset.id), preset];
  }),
  deleteMarkingPreset: vi.fn(async (id: string) => {
    db.presets = db.presets.filter(p => p.id !== id);
  }),
  searchMarkingPresets: vi.fn(async () => []),
  incrementMarkingPresetUsage: vi.fn(async () => {}),
  pruneTrackersForPreset: vi.fn(async () => {}),
  getAllStudies: vi.fn(async () => []),
  saveStudy: vi.fn(async () => {}),
  deleteStudy: vi.fn(async () => {}),
  getAllKeywordExclusions: vi.fn(async () => []),
  saveKeywordExclusion: vi.fn(async () => {}),
  deleteKeywordExclusion: vi.fn(async () => {}),
  deleteKeywordExclusionsByPreset: vi.fn(async () => {}),
  updatePreferences: vi.fn(async () => {}),
}));

import { KeyWordManager } from '../KeyWordManager';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useStudyStore } from '@/stores/studyStore';

function renderManager(props: Partial<ComponentProps<typeof KeyWordManager>> = {}) {
  return render(<KeyWordManager simple {...props} />);
}

const savedPreset = (word: string) => db.presets.find(p => p.word === word);

describe('KeyWordManager simple mode', () => {
  beforeEach(() => {
    db.presets = [];
    useMarkingPresetStore.setState({ presets: [], filterCategory: 'people', searchQuery: '' });
    useBibleStore.setState({ currentBook: 'John', currentChapter: 9 });
    useStudyStore.setState({ activeStudyId: 'study-1' });
  });

  afterEach(() => {
    cleanup();
  });

  it('lists marks by chapter without the Filters bar or the category chip, ignoring a leftover category filter', async () => {
    db.presets = [
      createMarkingPreset({
        word: 'Jesus',
        category: 'custom',
        highlight: { style: 'underline', color: 'blue' },
        scopes: [{ book: 'John', chapter: 9 }],
      }),
    ];
    renderManager();

    expect(await screen.findByText('Jesus')).toBeTruthy();
    expect(screen.getByText('John 9')).toBeTruthy();
    expect(screen.queryByText('Filters')).toBeNull();
    expect(screen.queryByText('Custom')).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Search key words...')).toBeTruthy();
  });

  it('shows only word, marking style and color when creating', async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(await screen.findByRole('button', { name: '+ New' }));

    expect(screen.getByLabelText('Word or Phrase')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Text color' })).toBeTruthy();
    for (const hidden of ['Also Matches', 'Symbol', 'Category', 'Study (Optional)', 'Scope', 'Description', 'Dismissed Matches']) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
    expect(screen.queryByLabelText(/Auto-suggest/)).toBeNull();
    expect(screen.queryByLabelText(/Case sensitive/)).toBeNull();
    expect(screen.queryByTitle('No color')).toBeNull();
  });

  it('saves a new mark as a custom, chapter-scoped, case-insensitive preset in the active study', async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(await screen.findByRole('button', { name: '+ New' }));

    await user.type(screen.getByLabelText('Word or Phrase'), 'Jesus');
    await user.click(screen.getByRole('radio', { name: 'Underline' }));
    await user.click(screen.getByLabelText('blue'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(savedPreset('Jesus')).toBeTruthy());
    const preset = savedPreset('Jesus')!;
    expect(preset.category).toBe('custom');
    expect(preset.scopes).toEqual([{ book: 'John', chapter: 9 }]);
    expect(preset.studyId).toBe('study-1');
    expect(preset.highlight).toEqual({ style: 'underline', color: 'blue' });
    expect(preset.caseSensitive).toBeFalsy();
    expect(preset.symbol).toBeUndefined();
  });

  it('defaults a new mark to highlight', async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(await screen.findByRole('button', { name: '+ New' }));

    expect(screen.getByRole('radio', { name: 'Highlight' }).getAttribute('aria-checked')).toBe('true');
  });

  it('opens straight to a preset and restyles it, keeping the fields simple mode hides', async () => {
    const user = userEvent.setup();
    const preset = createMarkingPreset({
      word: 'Lord',
      variants: [{ text: 'LORD' }],
      symbol: 'triangle',
      category: 'identity',
      highlight: { style: 'highlight', color: 'yellow' },
      scopes: [{ book: 'John' }],
      caseSensitive: true,
    });
    db.presets = [preset];
    renderManager({ initialPresetId: preset.id });

    await waitFor(() => expect((screen.getByLabelText('Word or Phrase') as HTMLInputElement).value).toBe('Lord'));
    await user.click(screen.getByRole('radio', { name: 'Text color' }));
    await user.click(screen.getByLabelText('green'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(savedPreset('Lord')?.highlight).toEqual({ style: 'textColor', color: 'green' }));
    const saved = savedPreset('Lord')!;
    expect(saved.symbol).toBe('triangle');
    expect(saved.category).toBe('identity');
    expect(saved.variants).toEqual([{ text: 'LORD' }]);
    expect(saved.scopes).toEqual([{ book: 'John' }]);
    expect(saved.caseSensitive).toBe(true);
  });

  it('keeps the full editor and Filters bar when not in simple mode', async () => {
    const user = userEvent.setup();
    render(<KeyWordManager />);

    expect(await screen.findByText('Filters')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '+ New' }));
    expect(screen.getByText('Also Matches')).toBeTruthy();
    expect(screen.getByText('Symbol')).toBeTruthy();
  });
});
