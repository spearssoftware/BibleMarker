/**
 * @vitest-environment jsdom
 *
 * useChapterEntityVerseIndex: mirrors useChapterEntities.test.tsx — same
 * stuck-isLoading regression coverage — plus the capability check that makes
 * this hook resolve to `index: null` without ever querying a provider that
 * lacks `getChapterEntityVerseIndex` (the API-backed provider's shape).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChapterEntityVerseIndex } from '../useGnosis';
import type { ChapterEntityVerseIndex } from '@/types';

const { getChapterEntityVerseIndexMock, mockProvider } = vi.hoisted(() => {
  const getChapterEntityVerseIndexMock = vi.fn();
  const mockProvider: { getChapterEntityVerseIndex?: typeof getChapterEntityVerseIndexMock } = {
    getChapterEntityVerseIndex: getChapterEntityVerseIndexMock,
  };
  return { getChapterEntityVerseIndexMock, mockProvider };
});

vi.mock('@/lib/gnosis', () => ({
  getGnosisProvider: () => mockProvider,
  isGnosisAvailable: () => true,
  getGnosisMode: () => 'local' as const,
  initGnosis: vi.fn(async () => {}),
}));

function makeIndex(book: string, chapter: number): ChapterEntityVerseIndex {
  return { book, chapter, peopleVerses: [1], placesVerses: [] };
}

describe('useChapterEntityVerseIndex', () => {
  beforeEach(() => {
    getChapterEntityVerseIndexMock.mockReset();
    mockProvider.getChapterEntityVerseIndex = getChapterEntityVerseIndexMock;
  });

  it('leaves isLoading false on a cache hit reached while a previous chapter fetch is still in flight', async () => {
    getChapterEntityVerseIndexMock.mockResolvedValueOnce(makeIndex('CacheTest', 2));
    const { result, rerender } = renderHook(
      ({ chapter }: { chapter: number }) => useChapterEntityVerseIndex('CacheTest', chapter),
      { initialProps: { chapter: 2 } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.index).toEqual(makeIndex('CacheTest', 2));

    // Navigate to chapter 1, whose fetch never resolves during this test —
    // an in-flight fetch, same as a slow query the user navigates away from.
    let resolveChapter1: (v: ChapterEntityVerseIndex) => void = () => {};
    getChapterEntityVerseIndexMock.mockImplementationOnce(
      () => new Promise<ChapterEntityVerseIndex>((resolve) => { resolveChapter1 = resolve; })
    );
    rerender({ chapter: 1 });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    // Navigate straight to chapter 2 again (already cached) before chapter 1
    // resolves — isLoading must not get stuck true (see useChapterEntities.test.tsx).
    rerender({ chapter: 2 });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.index).toEqual(makeIndex('CacheTest', 2));
    expect(result.current.error).toBeNull();

    resolveChapter1(makeIndex('CacheTest', 1));
  });

  it('never calls the provider when enabled is false', async () => {
    const { result } = renderHook(() => useChapterEntityVerseIndex('DisabledTest', 1, false));

    expect(result.current).toEqual({ index: null, isLoading: false, error: null });

    await act(async () => {
      await Promise.resolve();
    });
    expect(getChapterEntityVerseIndexMock).not.toHaveBeenCalled();
  });

  it('resolves to index: null and never queries when the provider lacks the method', async () => {
    delete mockProvider.getChapterEntityVerseIndex;

    const { result } = renderHook(() => useChapterEntityVerseIndex('NoCapability', 1));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.index).toBeNull();
    expect(result.current.error).toBeNull();
    expect(getChapterEntityVerseIndexMock).not.toHaveBeenCalled();
  });
});
