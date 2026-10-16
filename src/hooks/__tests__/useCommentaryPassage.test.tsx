/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCommentaryPassage } from '../useCommentaryPassage';
import { __resetCrossRefPassageCache } from '../useCrossRefPassages';
import { fetchChapter } from '@/lib/bible-api';
import type { Chapter } from '@/types';

vi.mock('@/lib/bible-api', () => ({ fetchChapter: vi.fn() }));
vi.mock('@/stores/activeChapterStore', () => ({
  useActiveChapterStore: () => null,
}));

const mockFetch = vi.mocked(fetchChapter);

function chapterOf(book: string, chapter: number, texts: Record<number, string>): Chapter {
  return {
    book,
    chapter,
    verses: Object.entries(texts).map(([v, text]) => ({ ref: { book, chapter, verse: Number(v) }, text })),
  } as unknown as Chapter;
}

describe('useCommentaryPassage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetCrossRefPassageCache();
  });

  it('stays idle and fetches nothing without an osisRef', () => {
    const { result } = renderHook(() => useCommentaryPassage(null, 'sword-NASB'));
    expect(result.current.status).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('loads a verse range', async () => {
    mockFetch.mockResolvedValue(chapterOf('Acts', 16, { 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' }));
    const { result } = renderHook(() => useCommentaryPassage('Acts.16.10-Acts.16.11', 'sword-NASB'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.verses.map(v => v.verse)).toEqual([10, 11]);
    expect(result.current.passage?.book).toBe('Acts');
  });

  it('reports missing when none of the verses come back', async () => {
    mockFetch.mockResolvedValue(chapterOf('Acts', 16, { 1: 'one' }));
    const { result } = renderHook(() => useCommentaryPassage('Acts.16.10', 'sword-NASB'));
    await waitFor(() => expect(result.current.status).toBe('missing'));
  });

  it('reports an error when the fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCommentaryPassage('Acts.16.10', 'esv'));
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('discards a stale result after the reference changes', async () => {
    let resolveFirst: (c: Chapter) => void = () => {};
    mockFetch.mockImplementationOnce(() => new Promise<Chapter>(r => { resolveFirst = r; }));
    mockFetch.mockResolvedValueOnce(chapterOf('John', 3, { 16: 'for God so loved' }));
    const { result, rerender } = renderHook(({ ref }) => useCommentaryPassage(ref, 'sword-NASB'), {
      initialProps: { ref: 'Acts.16.10' as string | null },
    });
    rerender({ ref: 'John.3.16' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      resolveFirst(chapterOf('Acts', 16, { 10: 'stale text' }));
    });
    expect(result.current.verses.map(v => v.text)).toEqual(['for God so loved']);
  });
});
