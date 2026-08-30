/**
 * @vitest-environment jsdom
 *
 * useChapterEchoIndex: `minVotes` has to participate in the shared
 * `useCachedChapterQuery` cache key (via the new `keySuffix` param) so a
 * remote threshold change actually refetches instead of serving a stale
 * result cached under the plain `book.chapter` key — and the two existing
 * `useCachedChapterQuery` callers (`useChapterEntities`,
 * `useChapterEntityVerseIndex`) must keep producing their original,
 * suffix-free keys.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChapterEchoIndex, useChapterEntities, useChapterEntityVerseIndex } from '../useGnosis';
import { LRUCache } from '@/lib/gnosis/cache';
import type { ChapterEchoIndex } from '@/types';

const { getChapterEchoIndexMock, getChapterEntitiesMock, getChapterEntityVerseIndexMock, mockProvider } = vi.hoisted(
  () => {
    const getChapterEchoIndexMock = vi.fn();
    const getChapterEntitiesMock = vi.fn();
    const getChapterEntityVerseIndexMock = vi.fn();
    const mockProvider: {
      getChapterEchoIndex?: typeof getChapterEchoIndexMock;
      getChapterEntities?: typeof getChapterEntitiesMock;
      getChapterEntityVerseIndex?: typeof getChapterEntityVerseIndexMock;
    } = {
      getChapterEchoIndex: getChapterEchoIndexMock,
      getChapterEntities: getChapterEntitiesMock,
      getChapterEntityVerseIndex: getChapterEntityVerseIndexMock,
    };
    return { getChapterEchoIndexMock, getChapterEntitiesMock, getChapterEntityVerseIndexMock, mockProvider };
  }
);

vi.mock('@/lib/gnosis', () => ({
  getGnosisProvider: () => mockProvider,
  isGnosisAvailable: () => true,
  getGnosisMode: () => 'local' as const,
  initGnosis: vi.fn(async () => {}),
}));

function makeIndex(book: string, chapter: number, votes: number): ChapterEchoIndex {
  return { book, chapter, echoes: [{ verse: 1, targetRef: 'Gen.1.1', targetEndRef: null, votes }] };
}

describe('useChapterEchoIndex', () => {
  beforeEach(() => {
    getChapterEchoIndexMock.mockReset();
    getChapterEntitiesMock.mockReset();
    getChapterEntityVerseIndexMock.mockReset();
    mockProvider.getChapterEchoIndex = getChapterEchoIndexMock;
    mockProvider.getChapterEntities = getChapterEntitiesMock;
    mockProvider.getChapterEntityVerseIndex = getChapterEntityVerseIndexMock;
  });

  it('folds minVotes into the cache key: changing it refetches instead of serving the stale value', async () => {
    getChapterEchoIndexMock.mockImplementation(async (b: string, c: number, minVotes: number) =>
      makeIndex(b, c, minVotes)
    );

    const { result, rerender } = renderHook(
      ({ minVotes }: { minVotes: number }) => useChapterEchoIndex('EchoKeyTest', 1, minVotes),
      { initialProps: { minVotes: 20 } }
    );
    await waitFor(() => expect(result.current.index).toEqual(makeIndex('EchoKeyTest', 1, 20)));
    expect(getChapterEchoIndexMock).toHaveBeenCalledWith('EchoKeyTest', 1, 20);

    rerender({ minVotes: 50 });
    await waitFor(() => expect(result.current.index).toEqual(makeIndex('EchoKeyTest', 1, 50)));
    expect(getChapterEchoIndexMock).toHaveBeenCalledWith('EchoKeyTest', 1, 50);
    expect(getChapterEchoIndexMock).toHaveBeenCalledTimes(2);
  });

  it('resolves to index: null and never queries when the provider lacks the method', async () => {
    delete mockProvider.getChapterEchoIndex;

    const { result } = renderHook(() => useChapterEchoIndex('NoCapability', 1, 20));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.index).toBeNull();
    expect(result.current.error).toBeNull();
    expect(getChapterEchoIndexMock).not.toHaveBeenCalled();
  });

  it('never calls the provider when enabled is false', async () => {
    const { result } = renderHook(() => useChapterEchoIndex('DisabledTest', 1, 20, false));

    expect(result.current).toEqual({ index: null, isLoading: false, error: null });

    await act(async () => {
      await Promise.resolve();
    });
    expect(getChapterEchoIndexMock).not.toHaveBeenCalled();
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

    it('useChapterEchoIndex caches under a `:minVotes`-suffixed key', async () => {
      getChapterEchoIndexMock.mockResolvedValueOnce(makeIndex('KeySuffixed', 2, 20));

      const { result } = renderHook(() => useChapterEchoIndex('KeySuffixed', 2, 20));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(cachedKeys()).toContain('KeySuffixed.2:20');
    });
  });
});
