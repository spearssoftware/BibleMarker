/**
 * @vitest-environment jsdom
 *
 * useChapterEntities: covers the stuck-isLoading regression (navigating from
 * an in-flight chapter fetch straight to an already-cached chapter must not
 * leave isLoading stuck true) and the `enabled` kill-switch parameter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChapterEntities } from '../useGnosis';
import type { ChapterEntities } from '@/types';

const { getChapterEntitiesMock } = vi.hoisted(() => ({ getChapterEntitiesMock: vi.fn() }));

vi.mock('@/lib/gnosis', () => ({
  getGnosisProvider: () => ({ getChapterEntities: getChapterEntitiesMock }),
  isGnosisAvailable: () => true,
  getGnosisMode: () => 'local' as const,
  initGnosis: vi.fn(async () => {}),
}));

function makeEntities(book: string, chapter: number): ChapterEntities {
  return { book, chapter, people: [`${book}-${chapter}`], places: [], events: [], topics: [] };
}

describe('useChapterEntities', () => {
  beforeEach(() => {
    getChapterEntitiesMock.mockReset();
  });

  it('leaves isLoading false on a cache hit reached while a previous chapter fetch is still in flight', async () => {
    // Prime the cache for chapter 2 with a normal, resolved fetch.
    getChapterEntitiesMock.mockResolvedValueOnce(makeEntities('CacheTest', 2));
    const { result, rerender } = renderHook(
      ({ chapter }: { chapter: number }) => useChapterEntities('CacheTest', chapter),
      { initialProps: { chapter: 2 } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entities).toEqual(makeEntities('CacheTest', 2));

    // Navigate to chapter 1, whose fetch never resolves during this test —
    // an in-flight fetch, same as a slow query the user navigates away from.
    let resolveChapter1: (v: ChapterEntities) => void = () => {};
    getChapterEntitiesMock.mockImplementationOnce(
      () => new Promise<ChapterEntities>((resolve) => { resolveChapter1 = resolve; })
    );
    rerender({ chapter: 1 });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    // Navigate straight to chapter 2 again (already cached) before chapter 1
    // resolves. Before the fix, the render-phase key sync reset
    // entities/error but not isLoading, and the effect early-returns on a
    // cache hit, so the cancelled chapter-1 fetch's `finally` never got a
    // chance to flip isLoading back to false — it stayed stuck `true`.
    rerender({ chapter: 2 });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.entities).toEqual(makeEntities('CacheTest', 2));
    expect(result.current.error).toBeNull();

    // Let the abandoned chapter-1 fetch settle so nothing leaks into other tests.
    resolveChapter1(makeEntities('CacheTest', 1));
  });

  it('never calls the provider when enabled is false', async () => {
    const { result } = renderHook(() => useChapterEntities('DisabledTest', 1, false));

    expect(result.current).toEqual({ entities: null, isLoading: false, error: null });

    await act(async () => {
      await Promise.resolve();
    });
    expect(getChapterEntitiesMock).not.toHaveBeenCalled();
  });
});
