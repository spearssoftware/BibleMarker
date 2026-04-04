import { useState, useEffect, useCallback, useRef } from 'react';
import { getGnosisProvider, isGnosisAvailable, getGnosisMode, initGnosis } from '@/lib/gnosis';
import type { GnosisDataProvider } from '@/lib/gnosis';
import type { ChapterEntities, PaginatedResponse, PaginationOpts } from '@/types';

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

export function useChapterEntities(book: string | undefined, chapter: number | undefined): {
  entities: ChapterEntities | null;
  isLoading: boolean;
  error: string | null;
} {
  const [entities, setEntities] = useState<ChapterEntities | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!book || chapter === undefined) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const provider = await ensureProvider();
        const result = await provider.getChapterEntities(book, chapter);
        if (!cancelled) setEntities(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load chapter entities');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [book, chapter]);

  return { entities, isLoading, error };
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
  fetcherRef.current = fetcher;

  const refetch = useCallback(() => setFetchCount((c) => c + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const provider = await ensureProvider();
        const result = await fetcherRef.current(provider);
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data');
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
  searcherRef.current = searcher;

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }

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
        if (!cancelled) setError(e instanceof Error ? e.message : 'Search failed');
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
