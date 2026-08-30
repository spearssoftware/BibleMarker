import { useState, useEffect, useCallback, useRef } from 'react';
import { getGnosisProvider, isGnosisAvailable, getGnosisMode, initGnosis } from '@/lib/gnosis';
import type { GnosisDataProvider } from '@/lib/gnosis';
import { LRUCache, CACHE_TTL } from '@/lib/gnosis/cache';
import type { ChapterEntities, ChapterEntityVerseIndex, PaginatedResponse, PaginationOpts } from '@/types';

/** Get or lazily initialize the gnosis provider */
async function ensureProvider(): Promise<GnosisDataProvider> {
  if (!isGnosisAvailable()) {
    await initGnosis({ mode: 'local' });
  }
  return getGnosisProvider();
}

export function useGnosis(): {
  provider: GnosisDataProvider | null;
  isAvailable: boolean;
  mode: 'api' | 'local' | null;
} {
  const available = isGnosisAvailable();
  let provider: GnosisDataProvider | null = null;
  try {
    provider = getGnosisProvider();
  } catch {
    // not initialized yet
  }
  return { provider, isAvailable: available, mode: getGnosisMode() };
}

/**
 * Shared state machine behind `useChapterEntities` and
 * `useChapterEntityVerseIndex`: render-time cache-key sync (serves a cache
 * hit synchronously during render, same pattern as `useGnosisSearch`'s
 * prevQuery check below, rather than setState-in-effect — avoids the
 * set-state-in-effect lint and an extra render), `isLoading` semantics (reset
 * on a cache-key change too, so an in-flight previous-key fetch's cancelled
 * `finally` can't leave it stuck `true` after navigating to a cached chapter),
 * and the cancelled-guard fetch effect. `fetcher` is read through a ref so a
 * fresh closure identity each render doesn't retrigger the effect (same
 * pattern as `useGnosisEntity`'s `fetcherRef` below) — only `book`/`chapter`/
 * `enabled` identity changes should restart the fetch.
 */
function useCachedChapterQuery<T>(
  book: string | undefined,
  chapter: number | undefined,
  enabled: boolean,
  cache: LRUCache,
  fetcher: (book: string, chapter: number) => Promise<T>
): {
  data: T | null;
  isLoading: boolean;
  error: string | null;
} {
  const cacheKey = enabled && book && chapter !== undefined ? `${book}.${chapter}` : undefined;
  const [data, setData] = useState<T | null>(() => (cacheKey ? cache.get<T>(cacheKey) ?? null : null));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [prevCacheKey, setPrevCacheKey] = useState(cacheKey);
  if (cacheKey !== prevCacheKey) {
    setPrevCacheKey(cacheKey);
    setData(cacheKey ? cache.get<T>(cacheKey) ?? null : null);
    setError(null);
    setIsLoading(false);
  }

  useEffect(() => {
    if (!enabled || !book || chapter === undefined) return;
    const key = `${book}.${chapter}`;
    if (cache.get<T>(key) !== undefined) return; // already served synchronously above

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetcherRef.current(book, chapter);
        if (!cancelled) {
          setData(result);
          cache.set(key, result, CACHE_TTL.chapter);
        }
      } catch (e) {
        console.error('[Gnosis] Chapter query error:', e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [book, chapter, enabled, cache]);

  if (!enabled) return { data: null, isLoading: false, error: null };
  return { data, isLoading, error };
}

/** Repeat mounts for the same chapter shouldn't re-query SQLite. */
const chapterEntitiesCache = new LRUCache();

export function useChapterEntities(
  book: string | undefined,
  chapter: number | undefined,
  enabled = true
): {
  entities: ChapterEntities | null;
  isLoading: boolean;
  error: string | null;
} {
  const { data, isLoading, error } = useCachedChapterQuery(
    book,
    chapter,
    enabled,
    chapterEntitiesCache,
    async (b, c) => {
      const provider = await ensureProvider();
      return provider.getChapterEntities(b, c);
    }
  );
  return { entities: data, isLoading, error };
}

/** Repeat mounts for the same chapter shouldn't re-query SQLite. */
const chapterEntityVerseIndexCache = new LRUCache();

/**
 * Per-verse person/place membership for a chapter. Thin wrapper over
 * `useCachedChapterQuery`, plus a capability check inside the fetcher: the
 * API-backed provider has no chapter-level per-verse route, so a provider
 * lacking `getChapterEntityVerseIndex` resolves to `null` without ever
 * issuing a query — the shared helper caches that `null` under the same key
 * (TTL-bounded like a real result), so a mode-lacking provider doesn't re-run
 * `ensureProvider` on every mount, and a later mode switch eventually gets
 * re-probed once the TTL lapses.
 */
export function useChapterEntityVerseIndex(
  book: string | undefined,
  chapter: number | undefined,
  enabled = true
): {
  index: ChapterEntityVerseIndex | null;
  isLoading: boolean;
  error: string | null;
} {
  const { data, isLoading, error } = useCachedChapterQuery(
    book,
    chapter,
    enabled,
    chapterEntityVerseIndexCache,
    async (b, c) => {
      const provider = await ensureProvider();
      if (!provider.getChapterEntityVerseIndex) return null;
      return provider.getChapterEntityVerseIndex(b, c);
    }
  );
  return { index: data, isLoading, error };
}

export function useGnosisEntity<T>(
  fetcher: (provider: GnosisDataProvider) => Promise<T>,
  deps: unknown[]
): {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refetch = useCallback(() => setFetchCount((c) => c + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const provider = await ensureProvider();
        const result = await fetcherRef.current(provider);
        if (!cancelled) setData(result);
      } catch (e) {
        console.error('[Gnosis] Entity fetch error:', e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchCount, ...deps]);

  return { data, isLoading, error, refetch };
}

export function useGnosisSearch<T>(
  searcher: (provider: GnosisDataProvider, query: string, opts?: PaginationOpts) => Promise<PaginatedResponse<T>>,
  query: string,
  opts?: PaginationOpts,
  debounceMs = 300
): {
  results: T[];
  total: number;
  isLoading: boolean;
  error: string | null;
} {
  const [results, setResults] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searcherRef = useRef(searcher);
  useEffect(() => {
    searcherRef.current = searcher;
  });

  // Clear results the moment the query is emptied. This matches the old effect's
  // empty-query branch but runs during render (an allowed setState) instead of
  // synchronously inside an effect, so it doesn't trip set-state-in-effect.
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    if (!query.trim()) {
      setResults([]);
      setTotal(0);
    }
  }

  useEffect(() => {
    if (!query.trim()) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const provider = await ensureProvider();
        const resp = await searcherRef.current(provider, query, opts);
        if (!cancelled) {
          setResults(resp.data);
          setTotal(resp.meta.total);
        }
      } catch (e) {
        console.error('[Gnosis] Search error:', e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, opts?.limit, opts?.offset, debounceMs]);

  return { results, total, isLoading, error };
}
