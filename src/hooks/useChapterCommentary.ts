/**
 * useChapterCommentary — loads one chapter's commentary blocks for the
 * Commentary card.
 *
 * Mirrors `useCachedChapterQuery` in `useGnosis.ts` (cache seeded
 * synchronously, state reset on key change during render, cancelled-guard
 * fetch effect) with its own cache so the two never share logging or keys.
 * Concurrent mounts of the same chapter share one in-flight read.
 */

import { useEffect, useState } from 'react';
import { getChapterCommentary } from '@/lib/commentary';
import type { CommentaryBlock } from '@/lib/commentary';
import { CACHE_TTL, LRUCache } from '@/lib/gnosis/cache';

const cache = new LRUCache();
const inFlight = new Map<string, Promise<CommentaryBlock[]>>();

function loadOnce(book: string, chapter: number, key: string): Promise<CommentaryBlock[]> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = getChapterCommentary(book, chapter)
    .then(blocks => {
      cache.set(key, blocks, CACHE_TTL.chapter);
      return blocks;
    })
    .catch(err => {
      console.error('[Commentary] Failed to load chapter commentary:', err);
      throw err;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export function useChapterCommentary(
  book: string,
  chapter: number
): { blocks: CommentaryBlock[]; isLoading: boolean; error: string | null } {
  const key = `${book}.${chapter}`;
  const [blocks, setBlocks] = useState<CommentaryBlock[] | null>(() => cache.get<CommentaryBlock[]>(key) ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setBlocks(cache.get<CommentaryBlock[]>(key) ?? null);
    setError(null);
    setIsLoading(false);
  }

  useEffect(() => {
    if (cache.get<CommentaryBlock[]>(key) !== undefined) return; // already served synchronously above

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await loadOnce(book, chapter, key);
        if (!cancelled) setBlocks(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [book, chapter, key]);

  return { blocks: blocks ?? [], isLoading, error };
}

/** Test-only escape hatch — clears the module-level cache between tests. */
export function __resetChapterCommentaryCache(): void {
  cache.clear();
  inFlight.clear();
}
