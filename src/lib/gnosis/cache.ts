/** In-memory LRU cache for gnosis API responses */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const MAX_ENTRIES = 500;

/** TTL values in milliseconds */
export const CACHE_TTL = {
  /** Individual entity lookups (2 hours — gnosis data is static) */
  entity: 2 * 60 * 60 * 1000,
  /** List/search results (30 minutes) */
  list: 30 * 60 * 1000,
  /** Chapter entities (24 hours — static reference data) */
  chapter: 24 * 60 * 60 * 1000,
  /** Meta endpoint (24 hours) */
  meta: 24 * 60 * 60 * 1000,
} as const;

export class LRUCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= MAX_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { data, expiresAt: Date.now() + ttl });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
