/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getOrCreateListForKeyword } = vi.hoisted(() => ({
  getOrCreateListForKeyword: vi.fn(),
}));

vi.mock('@/stores/listStore', () => ({
  useListStore: { getState: () => ({ getOrCreateListForKeyword }) },
}));
vi.mock('@/stores/studyStore', () => ({
  useStudyStore: { getState: () => ({ activeStudyId: 'study-1' }) },
}));
const { openPanel } = vi.hoisted(() => ({ openPanel: vi.fn() }));
vi.mock('@/stores/panelStore', () => ({
  usePanelStore: { getState: () => ({ openPanel }) },
}));

import { getKeywordTapHandler } from '../keywordTap';
import { useAppModeStore } from '@/stores/appModeStore';

const verseRef = { book: 'John', chapter: 9, verse: 1 };

describe('getKeywordTapHandler', () => {
  const opened = vi.fn();

  beforeEach(() => {
    getOrCreateListForKeyword.mockReset();
    useAppModeStore.setState({ mode: 'study' });
    openPanel.mockReset();
    getOrCreateListForKeyword.mockResolvedValue({ id: 'list-1' });
    window.addEventListener('openObservationTools', opened);
  });

  afterEach(() => {
    window.removeEventListener('openObservationTools', opened);
    opened.mockReset();
  });

  it('opens the mark in Key Words with inductive tools off, creating no list and opening no Observe panel', async () => {
    getKeywordTapHandler(false)('preset-1', verseRef);

    expect(openPanel).toHaveBeenCalledWith('keywords', { keywordInitialPresetId: 'preset-1' });
    await Promise.resolve();
    expect(getOrCreateListForKeyword).not.toHaveBeenCalled();
    expect(opened).not.toHaveBeenCalled();
  });

  it('opens the keyword list with inductive tools on', async () => {
    getKeywordTapHandler(true)('preset-1', verseRef);

    await vi.waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
    expect(getOrCreateListForKeyword).toHaveBeenCalledWith('preset-1', 'study-1', 'John');
    const event = opened.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ tab: 'lists', listId: 'list-1', verseRef });
    expect(openPanel).not.toHaveBeenCalled();
  });
});
