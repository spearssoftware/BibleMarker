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

import { getKeywordTapHandler } from '../keywordTap';

const verseRef = { book: 'John', chapter: 9, verse: 1 };

describe('getKeywordTapHandler', () => {
  const opened = vi.fn();

  beforeEach(() => {
    getOrCreateListForKeyword.mockReset();
    getOrCreateListForKeyword.mockResolvedValue({ id: 'list-1' });
    window.addEventListener('openObservationTools', opened);
  });

  afterEach(() => {
    window.removeEventListener('openObservationTools', opened);
    opened.mockReset();
  });

  it('gives no tap handler with inductive tools off, so no list is created and no panel opens', () => {
    expect(getKeywordTapHandler(false)).toBeUndefined();
    expect(getOrCreateListForKeyword).not.toHaveBeenCalled();
    expect(opened).not.toHaveBeenCalled();
  });

  it('opens the keyword list with inductive tools on', async () => {
    const handler = getKeywordTapHandler(true);
    handler?.('preset-1', verseRef);

    await vi.waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
    expect(getOrCreateListForKeyword).toHaveBeenCalledWith('preset-1', 'study-1', 'John');
    const event = opened.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ tab: 'lists', listId: 'list-1', verseRef });
  });
});
