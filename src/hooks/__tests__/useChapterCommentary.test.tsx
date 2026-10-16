/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChapterCommentary, __resetChapterCommentaryCache } from '../useChapterCommentary';
import { getChapterCommentary } from '@/lib/commentary';
import type { CommentaryBlock } from '@/lib/commentary';

vi.mock('@/lib/commentary', () => ({ getChapterCommentary: vi.fn() }));

const mockLoad = vi.mocked(getChapterCommentary);

const block = (chapter: number): CommentaryBlock => ({
  id: 'whole-chapter:0:0',
  commentaryId: 'mhcc',
  kind: 'whole-chapter',
  book: 'John',
  chapter,
  startVerse: null,
  endVerse: null,
  title: null,
  paragraphs: [[{ text: `Chapter ${chapter}` }]],
});

describe('useChapterCommentary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetChapterCommentaryCache();
  });

  it('loads blocks and serves a revisited chapter from the cache', async () => {
    mockLoad.mockImplementation(async (_book, chapter) => [block(chapter)]);
    const { result, rerender } = renderHook(({ chapter }) => useChapterCommentary('John', chapter), {
      initialProps: { chapter: 3 },
    });
    await waitFor(() => expect(result.current.blocks).toEqual([block(3)]));

    rerender({ chapter: 4 });
    expect(result.current.blocks).toEqual([]);
    await waitFor(() => expect(result.current.blocks).toEqual([block(4)]));

    rerender({ chapter: 3 });
    expect(result.current.blocks).toEqual([block(3)]);
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight load between concurrent mounts', async () => {
    mockLoad.mockResolvedValue([block(3)]);
    const a = renderHook(() => useChapterCommentary('John', 3));
    const b = renderHook(() => useChapterCommentary('John', 3));
    await waitFor(() => expect(a.result.current.blocks).toHaveLength(1));
    await waitFor(() => expect(b.result.current.blocks).toHaveLength(1));
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('reports and logs a load failure with no blocks', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLoad.mockRejectedValue(new Error('install failed'));
    const { result } = renderHook(() => useChapterCommentary('John', 3));
    await waitFor(() => expect(result.current.error).toBe('install failed'));
    expect(result.current.blocks).toEqual([]);
    expect(error).toHaveBeenCalledWith('[Commentary] Failed to load chapter commentary:', expect.any(Error));
    error.mockRestore();
  });
});
