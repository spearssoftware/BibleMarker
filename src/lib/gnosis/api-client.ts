/**
 * Gnosis REST API Client
 *
 * Implements GnosisDataProvider by calling the gnosis-api at api.gnosistools.com.
 * Follows the same patterns as EsvClient in src/lib/bible-api/esv.ts.
 */

import type { GnosisDataProvider } from './provider';
import { LRUCache, CACHE_TTL } from './cache';
import { isOnline, retryWithBackoff } from '@/lib/offline';
import type {
  ChapterEntities,
  GnosisCrossReference,
  GnosisDictionaryEntry,
  GnosisEvent,
  GnosisGreekLexiconEntry,
  GnosisLexiconEntry,
  GnosisMeta,
  GnosisPeopleGroup,
  GnosisPerson,
  GnosisPlace,
  GnosisSearchResult,
  GnosisStrongsEntry,
  GnosisTopic,
  PaginatedResponse,
  PaginationOpts,
  VerseEntities,
} from '@/types';

const GNOSIS_BASE_URL = 'https://api.gnosistools.com/v1';

export class GnosisApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'GnosisApiError';
  }
}

export class GnosisApiClient implements GnosisDataProvider {
  readonly mode = 'api' as const;
  private apiKey: string | null = null;
  private baseUrl = GNOSIS_BASE_URL;
  private cache = new LRUCache();

  configure(apiKey: string, baseUrl?: string): void {
    this.apiKey = apiKey.trim() || null;
    if (baseUrl) this.baseUrl = baseUrl;
    this.cache.clear();
  }

  isAvailable(): boolean {
    return !!this.apiKey && isOnline();
  }

  private async fetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.apiKey) {
      throw new GnosisApiError('Gnosis API key not configured', 401);
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      headers: { 'X-API-Key': this.apiKey },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new GnosisApiError('Gnosis API rate limit exceeded. Please try again later.', 429);
      }
      throw new GnosisApiError(`Gnosis API error: ${response.statusText}`, response.status);
    }

    return response.json();
  }

  private async cachedFetch<T>(cacheKey: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get<T>(cacheKey);
    if (cached !== undefined) return cached;

    const data = await retryWithBackoff(fetcher, { maxRetries: 2, initialDelay: 1000 });
    this.cache.set(cacheKey, data, ttl);
    return data;
  }

  private paginationParams(opts?: PaginationOpts): Record<string, string> {
    const params: Record<string, string> = {};
    if (opts?.limit !== undefined) params.limit = String(opts.limit);
    if (opts?.offset !== undefined) params.offset = String(opts.offset);
    return params;
  }

  // --- Chapter ---

  async getBookChapterYears(_book: string): Promise<Map<number, { year: number; yearDisplay: string }>> {
    return new Map(); // Not available via API yet
  }

  async getChapterYear(_book: string, _chapter: number): Promise<{ year: number; yearDisplay: string } | null> {
    return null; // Not available via API yet
  }

  async getChapterEntities(book: string, chapter: number): Promise<ChapterEntities> {
    return this.cachedFetch(`chapter:${book}:${chapter}`, CACHE_TTL.chapter, async () => {
      const resp = await this.fetch<{ data: ChapterEntities }>(`/chapters/${book}/${chapter}`);
      return resp.data;
    });
  }

  // --- People ---

  async searchPeople(query: string, opts?: PaginationOpts & { gender?: string }): Promise<PaginatedResponse<GnosisPerson>> {
    const params: Record<string, string> = { ...this.paginationParams(opts) };
    if (query) params.q = query;
    if (opts?.gender) params.gender = opts.gender;

    const cacheKey = `people:search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: GnosisPerson[]; meta: { total: number; limit: number; offset: number } }>('/people', params);
      return { data: resp.data, meta: resp.meta };
    });
  }

  async getPerson(slug: string): Promise<GnosisPerson> {
    return this.cachedFetch(`person:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: GnosisPerson }>(`/people/${slug}`);
      return resp.data;
    });
  }

  // --- Places ---

  async searchPlaces(query: string, opts?: PaginationOpts & { hasCoordinates?: boolean; featureType?: string }): Promise<PaginatedResponse<GnosisPlace>> {
    const params: Record<string, string> = { ...this.paginationParams(opts) };
    if (query) params.q = query;
    if (opts?.hasCoordinates !== undefined) params.has_coordinates = String(opts.hasCoordinates);
    if (opts?.featureType) params.feature_type = opts.featureType;

    const cacheKey = `places:search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: GnosisPlace[]; meta: { total: number; limit: number; offset: number } }>('/places', params);
      return { data: resp.data, meta: resp.meta };
    });
  }

  async getPlace(slug: string): Promise<GnosisPlace> {
    return this.cachedFetch(`place:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: GnosisPlace }>(`/places/${slug}`);
      return resp.data;
    });
  }

  // --- Events ---

  async searchEvents(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisEvent>> {
    const params: Record<string, string> = { ...this.paginationParams(opts) };
    if (query) params.q = query;

    const cacheKey = `events:search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: GnosisEvent[]; meta: { total: number; limit: number; offset: number } }>('/events', params);
      return { data: resp.data, meta: resp.meta };
    });
  }

  async getEvent(slug: string): Promise<GnosisEvent> {
    return this.cachedFetch(`event:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: GnosisEvent }>(`/events/${slug}`);
      return resp.data;
    });
  }

  // --- Topics ---

  async searchTopics(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisTopic>> {
    const params: Record<string, string> = { ...this.paginationParams(opts) };
    if (query) params.q = query;

    const cacheKey = `topics:search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: GnosisTopic[]; meta: { total: number; limit: number; offset: number } }>('/topics', params);
      return { data: resp.data, meta: resp.meta };
    });
  }

  async getTopic(slug: string): Promise<GnosisTopic> {
    return this.cachedFetch(`topic:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: GnosisTopic }>(`/topics/${slug}`);
      return resp.data;
    });
  }

  // --- Groups ---

  async searchGroups(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisPeopleGroup>> {
    const params: Record<string, string> = { ...this.paginationParams(opts) };
    if (query) params.q = query;

    const cacheKey = `groups:search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: GnosisPeopleGroup[]; meta: { total: number; limit: number; offset: number } }>('/groups', params);
      return { data: resp.data, meta: resp.meta };
    });
  }

  async getGroup(slug: string): Promise<GnosisPeopleGroup> {
    return this.cachedFetch(`group:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: GnosisPeopleGroup }>(`/groups/${slug}`);
      return resp.data;
    });
  }

  // --- Verse-level ---

  async getVerseEntities(osisRef: string): Promise<VerseEntities> {
    return this.cachedFetch(`verse:${osisRef}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: VerseEntities }>(`/verses/${osisRef}`);
      return resp.data;
    });
  }

  async getCrossReferences(osisRef: string): Promise<PaginatedResponse<GnosisCrossReference>> {
    return this.cachedFetch(`crossref:${osisRef}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: GnosisCrossReference[]; meta: { total: number; limit: number; offset: number } }>(
        `/verses/${osisRef}/cross-references`
      );
      return { data: resp.data, meta: resp.meta };
    });
  }

  // --- Language ---

  async getLexiconEntry(lexicalId: string): Promise<GnosisLexiconEntry> {
    return this.cachedFetch(`lexicon:${lexicalId}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: GnosisLexiconEntry }>(`/lexicon/${lexicalId}`);
      return resp.data;
    });
  }

  async getGreekLexiconEntry(strongsNumber: string): Promise<GnosisGreekLexiconEntry> {
    return this.cachedFetch(`greeklex:${strongsNumber}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: GnosisGreekLexiconEntry }>(`/greek-lexicon/${strongsNumber}`);
      return resp.data;
    });
  }

  // --- Strong's & Dictionary ---

  async getStrongsEntry(number: string): Promise<GnosisStrongsEntry> {
    return this.cachedFetch(`strongs:${number}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: GnosisStrongsEntry }>(`/strongs/${number}`);
      return resp.data;
    });
  }

  async searchDictionary(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisDictionaryEntry>> {
    const params: Record<string, string> = { ...this.paginationParams(opts) };
    if (query) params.q = query;

    const cacheKey = `dict:search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: GnosisDictionaryEntry[]; meta: { total: number; limit: number; offset: number } }>('/dictionary', params);
      return { data: resp.data, meta: resp.meta };
    });
  }

  async getDictionaryEntry(slug: string): Promise<GnosisDictionaryEntry> {
    return this.cachedFetch(`dict:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: GnosisDictionaryEntry }>(`/dictionary/${slug}`);
      return resp.data;
    });
  }

  // --- Search ---

  async search(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisSearchResult>> {
    const params: Record<string, string> = { q: query, ...this.paginationParams(opts) };

    const cacheKey = `search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: GnosisSearchResult[]; meta: { total: number; limit: number; offset: number } }>('/search', params);
      return { data: resp.data, meta: resp.meta };
    });
  }

  // --- Meta ---

  async getMeta(): Promise<GnosisMeta> {
    return this.cachedFetch('meta', CACHE_TTL.meta, async () => {
      const resp = await this.fetch<{ data: GnosisMeta }>('/meta');
      return resp.data;
    });
  }
}
