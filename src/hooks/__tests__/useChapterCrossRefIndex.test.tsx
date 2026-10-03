/**
 * @vitest-environment jsdom
 *
 * useChapterCrossRefIndex: `minVotes` has to participate in the shared
 * `useCachedChapterQuery` cache key (via the new `keySuffix` param) so a
 * remote threshold change actually refetches instead of serving a stale
 * result cached under the plain `book.chapter` key — and the two existing
 * `useCachedChapterQuery` callers (`useChapterEntities`,
 * `useChapterEntityVerseIndex`) must keep producing their original,
 * suffix-free keys.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChapterCrossRefIndex, useChapterEntities, useChapterEntityVerseIndex } from '../useGnosis';
import { LRUCache } from '@/lib/gnosis/cache';
import type { ChapterCrossRefIndex } from '@/types';

const { getChapterCrossRefIndexMock, getChapterEntitiesMock, getChapterEntityVerseIndexMock, mockProvider } = vi.hoisted(
  () => {
    const getChapterCrossRefIndexMock = vi.fn();
    const getChapterEntitiesMock = vi.fn();
    const getChapterEntityVerseIndexMock = vi.fn();
    const mockProvider: {
      getChapterCrossRefIndex?: typeof getChapterCrossRefIndexMock;
      getChapterEntities?: typeof getChapterEntitiesMock;
      getChapterEntityVerseIndex?: typeof getChapterEntityVerseIndexMock;
    } = {
      getChapterCrossRefIndex: getChapterCrossRefIndexMock,
      getChapterEntities: getChapterEntitiesMock,
      getChapterEntityVerseIndex: getChapterEntityVerseIndexMock,
    };
    return { getChapterCrossRefIndexMock, getChapterEntitiesMock, getChapterEntityVerseIndexMock, mockProvider };
  }
);

vi.mock('@/lib/gnosis', () => ({
  getGnosisProvider: () => mockProvider,
  isGnosisAvailable: () => true,
  getGnosisMode: () => 'local' as const,
  initGnosis: vi.fn(async () => {}),
}));

function makeIndex(book: string, chapter: number, votes: number): ChapterCrossRefIndex {
  return { book, chapter, crossRefs: [{ verse: 1, targetRef: 'Gen.1.1', targetEndRef: null, votes }] };
}

describe('useChapterCrossRefIndex', () => {
  beforeEach(() => {
    getChapterCrossRefIndexMock.mockReset();
    getChapterEntitiesMock.mockReset();
    getChapterEntityVerseIndexMock.mockReset();
    mockProvider.getChapterCrossRefIndex = getChapterCrossRefIndexMock;
    mockProvider.getChapterEntities = getChapterEntitiesMock;
    mockProvider.getChapterEntityVerseIndex = getChapterEntityVerseIndexMock;
  });

  it('folds minVotes into the cache key: changing it refetches instead of serving the stale value', async () => {
    getChapterCrossRefIndexMock.mockImplementation(async (b: string, c: number, minVotes: number) =>
      makeIndex(b, c, minVotes)
    );

    const { result, rerender } = renderHook(
      ({ minVotes }: { minVotes: number }) => useChapterCrossRefIndex('CrossRefKeyTest', 1, minVotes),
      { initialProps: { minVotes: 20 } }
    );
    await waitFor(() => expect(result.current.index).toEqual(makeIndex('CrossRefKeyTest', 1, 20)));
    expect(getChapterCrossRefIndexMock).toHaveBeenCalledWith('CrossRefKeyTest', 1, 20);

    rerender({ minVotes: 50 });
    await waitFor(() => expect(result.current.index).toEqual(makeIndex('CrossRefKeyTest', 1, 50)));
    expect(getChapterCrossRefIndexMock).toHaveBeenCalledWith('CrossRefKeyTest', 1, 50);
    expect(getChapterCrossRefIndexMock).toHaveBeenCalledTimes(2);
  });

  it('resolves to index: null and never queries when the provider lacks the method', async () => {
    delete mockProvider.getChapterCrossRefIndex;

    const { result } = renderHook(() => useChapterCrossRefIndex('NoCapability', 1, 20));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.index).toBeNull();
    expect(result.current.error).toBeNull();
    expect(getChapterCrossRefIndexMock).not.toHaveBeenCalled();
  });

  it('never calls the provider when enabled is false', async () => {
    const { result } = renderHook(() => useChapterCrossRefIndex('DisabledTest', 1, 20, false));

    expect(result.current).toEqual({ index: null, isLoading: false, error: null });

    await act(async () => {
      await Promise.resolve();
    });
    expect(getChapterCrossRefIndexMock).not.toHaveBeenCalled();
  });

  describe('existing useCachedChapterQuery callers keep their unsuffixed keys', () => {
    let setSpy: ReturnType<typeof vi.spyOn>;

    function cachedKeys(): string[] {
      return setSpy.mock.calls.map((call: unknown[]) => call[0] as string);
    }

    beforeEach(() => {
      setSpy = vi.spyOn(LRUCache.prototype, 'set');
    });

    afterEach(() => {
      setSpy.mockRestore();
    });

    it('useChapterEntities still caches under plain `book.chapter`', async () => {
      getChapterEntitiesMock.mockResolvedValueOnce({
        book: 'KeyUnchangedEntities',
        chapter: 3,
        people: [],
        places: [],
        events: [],
        topics: [],
      });

      const { result } = renderHook(() => useChapterEntities('KeyUnchangedEntities', 3));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(cachedKeys()).toContain('KeyUnchangedEntities.3');
    });

    it('useChapterEntityVerseIndex still caches under plain `book.chapter`', async () => {
      getChapterEntityVerseIndexMock.mockResolvedValueOnce({
        book: 'KeyUnchangedVerseIndex',
        chapter: 5,
        peopleVerses: [],
        placesVerses: [],
      });

      const { result } = renderHook(() => useChapterEntityVerseIndex('KeyUnchangedVerseIndex', 5));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(cachedKeys()).toContain('KeyUnchangedVerseIndex.5');
    });

    it('useChapterCrossRefIndex caches under a `:minVotes`-suffixed key', async () => {
      getChapterCrossRefIndexMock.mockResolvedValueOnce(makeIndex('KeySuffixed', 2, 20));

      const { result } = renderHook(() => useChapterCrossRefIndex('KeySuffixed', 2, 20));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(cachedKeys()).toContain('KeySuffixed.2:20');
    });
  });
});
