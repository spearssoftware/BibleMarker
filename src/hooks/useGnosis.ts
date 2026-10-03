import { useState, useEffect, useCallback, useRef } from 'react';
import { getGnosisProvider, isGnosisAvailable, getGnosisMode, initGnosis } from '@/lib/gnosis';
import type { GnosisDataProvider } from '@/lib/gnosis';
import { LRUCache, CACHE_TTL } from '@/lib/gnosis/cache';
import type {
  ChapterCrossRefIndex,
  ChapterEntities,
  ChapterEntityVerseIndex,
  ChapterEvent,
  ChapterPerson,
  ChapterPlace,
  EntitySpread,
  PaginatedResponse,
  PaginationOpts,
} from '@/types';

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

/** In-flight queries per cache, keyed like the cache, so concurrent mounts share one query. */
const inFlight = new WeakMap<LRUCache, Map<string, Promise<unknown>>>();

function fetchOnce<T>(cache: LRUCache, key: string, run: () => Promise<T>): Promise<T> {
  let pending = inFlight.get(cache);
  if (!pending) {
    pending = new Map();
    inFlight.set(cache, pending);
  }
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const promise = run()
    .then(result => {
      cache.set(key, result, CACHE_TTL.chapter);
      return result;
    })
    .finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

/**
 * Shared state machine behind `useChapterEntities` and
 * `useChapterEntityVerseIndex`: render-time cache-key sync (serves a cache
 * hit synchronously during render, same pattern as `useGnosisSearch`'s
 * prevQuery check below, rather than setState-in-effect — avoids the
 * set-state-in-effect lint and an extra render), `isLoading` semantics (reset
 * on a cache-key change too, so an in-flight previous-key fetch's cancelled
 * `finally` can't leave it stuck `true` after navigating to a cached chapter),
 * and the cancelled-guard fetch effect. Concurrent mounts of the same key
 * share one in-flight query (`fetchOnce`), which also fills the cache.
 * `fetcher` is read through a ref so a fresh closure identity each render
 * doesn't retrigger the effect (same
 * pattern as `useGnosisEntity`'s `fetcherRef` below) — only `book`/`chapter`/
 * `enabled`/`keySuffix` identity changes should restart the fetch.
 *
 * `keySuffix` extends the cache key beyond `book.chapter` for callers whose
 * result also depends on another parameter (e.g. a votes threshold) — a
 * change to that parameter must produce a different cache key and re-run the
 * fetch effect, not silently serve a stale result cached under the same key.
 * Existing callers pass nothing, so their keys are unchanged.
 */
function useCachedChapterQuery<T>(
  book: string | undefined,
  chapter: number | undefined,
  enabled: boolean,
  cache: LRUCache,
  fetcher: (book: string, chapter: number) => Promise<T>,
  keySuffix = ''
): {
  data: T | null;
  isLoading: boolean;
  error: string | null;
} {
  const cacheKey = enabled && book && chapter !== undefined ? `${book}.${chapter}${keySuffix}` : undefined;
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
    const key = `${book}.${chapter}${keySuffix}`;
    if (cache.get<T>(key) !== undefined) return; // already served synchronously above

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchOnce(cache, key, () => fetcherRef.current(book, chapter));
        if (!cancelled) setData(result);
      } catch (e) {
        console.error('[Gnosis] Chapter query error:', e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [book, chapter, enabled, cache, keySuffix]);

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

/** Repeat mounts for the same chapter shouldn't re-query SQLite. */
const chapterPeopleCache = new LRUCache();
const chapterPlacesCache = new LRUCache();
const chapterEventsCache = new LRUCache();
const chapterYearCache = new LRUCache();
const peopleSpreadCache = new LRUCache();

/**
 * People named in a chapter. Same optional-capability guard as
 * `useChapterEntityVerseIndex`: a provider lacking `getChapterPeople`
 * resolves to `null`.
 */
export function useChapterPeople(
  book: string | undefined,
  chapter: number | undefined,
  enabled = true
): { people: ChapterPerson[] | null; isLoading: boolean; error: string | null } {
  const { data, isLoading, error } = useCachedChapterQuery(
    book,
    chapter,
    enabled,
    chapterPeopleCache,
    async (b, c) => {
      const provider = await ensureProvider();
      if (!provider.getChapterPeople) return null;
      return provider.getChapterPeople(b, c);
    }
  );
  return { people: data, isLoading, error };
}

/** Places with coordinates named in a chapter; `null` when the provider can't say. */
export function useChapterPlaces(
  book: string | undefined,
  chapter: number | undefined,
  enabled = true
): { places: ChapterPlace[] | null; isLoading: boolean; error: string | null } {
  const { data, isLoading, error } = useCachedChapterQuery(
    book,
    chapter,
    enabled,
    chapterPlacesCache,
    async (b, c) => {
      const provider = await ensureProvider();
      if (!provider.getChapterPlaces) return null;
      return provider.getChapterPlaces(b, c);
    }
  );
  return { places: data, isLoading, error };
}

/** Events tied to a chapter; `null` when the provider can't say. */
export function useChapterEvents(
  book: string | undefined,
  chapter: number | undefined,
  enabled = true
): { events: ChapterEvent[] | null; isLoading: boolean; error: string | null } {
  const { data, isLoading, error } = useCachedChapterQuery(
    book,
    chapter,
    enabled,
    chapterEventsCache,
    async (b, c) => {
      const provider = await ensureProvider();
      if (!provider.getChapterEvents) return null;
      return provider.getChapterEvents(b, c);
    }
  );
  return { events: data, isLoading, error };
}

/**
 * The chapter's year, from the existing `getChapterYear` (`null` in API mode,
 * which has no per-chapter year route).
 */
export function useChapterYear(
  book: string | undefined,
  chapter: number | undefined,
  enabled = true
): { year: { year: number; yearDisplay: string } | null; isLoading: boolean; error: string | null } {
  const { data, isLoading, error } = useCachedChapterQuery(
    book,
    chapter,
    enabled,
    chapterYearCache,
    async (b, c) => {
      const provider = await ensureProvider();
      return provider.getChapterYear(b, c);
    }
  );
  return { year: data, isLoading, error };
}

/**
 * First appearance and books for the given people. The slugs are folded into
 * the cache key (via `keySuffix`) so a different set refetches. Resolves to
 * `null` when the provider lacks `getPeopleSpread`.
 */
export function usePeopleSpread(
  book: string | undefined,
  chapter: number | undefined,
  slugs: string[],
  enabled = true
): { spread: EntitySpread[] | null; isLoading: boolean; error: string | null } {
  const { data, isLoading, error } = useCachedChapterQuery(
    book,
    chapter,
    enabled && slugs.length > 0,
    peopleSpreadCache,
    async () => {
      const provider = await ensureProvider();
      if (!provider.getPeopleSpread) return null;
      return provider.getPeopleSpread(slugs);
    },
    `:${[...slugs].sort().join(',')}`
  );
  return { spread: data, isLoading, error };
}

/** Repeat mounts for the same chapter+threshold shouldn't re-query SQLite. */
const chapterCrossRefIndexCache = new LRUCache();

/**
 * Cross-references from verses in this chapter to older passages, gated on
 * `minVotes`. Thin wrapper over `useCachedChapterQuery`, with `minVotes`
 * folded into the cache key (via `keySuffix`) so a remote threshold change
 * actually refetches instead of serving a stale result cached under the plain
 * `book.chapter` key. Same optional-capability guard as
 * `useChapterEntityVerseIndex`: a provider lacking `getChapterCrossRefIndex`
 * resolves to `null` without ever issuing a query.
 */
export function useChapterCrossRefIndex(
  book: string | undefined,
  chapter: number | undefined,
  minVotes: number,
  enabled = true
): {
  index: ChapterCrossRefIndex | null;
  isLoading: boolean;
  error: string | null;
} {
  const { data, isLoading, error } = useCachedChapterQuery(
    book,
    chapter,
    enabled,
    chapterCrossRefIndexCache,
    async (b, c) => {
      const provider = await ensureProvider();
      if (!provider.getChapterCrossRefIndex) return null;
      return provider.getChapterCrossRefIndex(b, c, minVotes);
    },
    `:${minVotes}`
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
