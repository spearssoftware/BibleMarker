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
  GnosisDictionaryDefinition,
  GnosisEvent,
  GnosisGreekLexiconEntry,
  GnosisGreekWord,
  GnosisHebrewWord,
  GnosisLexiconEntry,
  GnosisMeta,
  GnosisPeopleGroup,
  GnosisPerson,
  GnosisPlace,
  GnosisSearchResult,
  GnosisStrongsEntry,
  GnosisTopic,
  GnosisTopicAspect,
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

// --- Snake-to-camel mappers ---

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapPerson(r: any): GnosisPerson {
  return {
    slug: r.slug,
    uuid: r.uuid,
    name: r.name,
    gender: r.gender ?? null,
    birthYear: r.birth_year ?? null,
    deathYear: r.death_year ?? null,
    birthYearDisplay: r.birth_year_display ?? null,
    deathYearDisplay: r.death_year_display ?? null,
    earliestYearMentioned: r.earliest_year_mentioned ?? null,
    latestYearMentioned: r.latest_year_mentioned ?? null,
    earliestYearMentionedDisplay: r.earliest_year_mentioned_display ?? null,
    latestYearMentionedDisplay: r.latest_year_mentioned_display ?? null,
    birthPlace: r.birth_place ?? null,
    deathPlace: r.death_place ?? null,
    father: r.father ?? null,
    mother: r.mother ?? null,
    siblings: r.siblings ?? [],
    children: r.children ?? [],
    partners: r.partners ?? [],
    verseCount: r.verse_count ?? 0,
    verses: r.verses ?? [],
    firstMention: r.first_mention ?? null,
    nameMeaning: r.name_meaning ?? null,
    peopleGroups: r.people_groups ?? [],
  };
}

function mapPlace(r: any): GnosisPlace {
  return {
    slug: r.slug,
    uuid: r.uuid,
    name: r.name,
    kjvName: r.kjv_name ?? null,
    esvName: r.esv_name ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    coordinateSource: r.coordinate_source ?? null,
    featureType: r.feature_type ?? null,
    featureSubType: r.feature_sub_type ?? null,
    modernName: r.modern_name ?? null,
  };
}

function mapEvent(r: any): GnosisEvent {
  return {
    slug: r.slug,
    uuid: r.uuid,
    title: r.title,
    startYear: r.start_year ?? null,
    startYearDisplay: r.start_year_display ?? null,
    duration: r.duration ?? null,
    sortKey: r.sort_key ?? null,
    participants: r.participants ?? [],
    locations: r.locations ?? [],
    verses: r.verses ?? [],
    parentEvent: r.parent_event ?? null,
    predecessor: r.predecessor ?? null,
  };
}

function mapTopic(r: any): GnosisTopic {
  return {
    slug: r.slug,
    uuid: r.uuid,
    name: r.name,
    aspects: (r.aspects ?? []).map((a: any): GnosisTopicAspect => ({
      label: a.label ?? null,
      source: a.source ?? null,
      verses: a.verses ?? [],
    })),
    seeAlso: r.see_also ?? [],
  };
}

function mapGroup(r: any): GnosisPeopleGroup {
  return {
    slug: r.slug,
    uuid: r.uuid,
    name: r.name,
    members: r.members ?? [],
  };
}

function mapCrossRef(r: any): GnosisCrossReference {
  return {
    fromVerse: r.from_verse,
    toVerseStart: r.to_verse_start,
    toVerseEnd: r.to_verse_end ?? null,
    votes: r.votes ?? 0,
  };
}

function mapStrongs(r: any): GnosisStrongsEntry {
  return {
    number: r.number,
    uuid: r.uuid,
    language: r.language,
    lemma: r.lemma ?? null,
    transliteration: r.transliteration ?? null,
    pronunciation: r.pronunciation ?? null,
    definition: r.definition ?? null,
    kjvUsage: r.kjv_usage ?? null,
  };
}

function mapDictionary(r: any): GnosisDictionaryEntry {
  return {
    slug: r.slug,
    uuid: r.uuid,
    name: r.name,
    definitions: (r.definitions ?? []).map((d: any): GnosisDictionaryDefinition => ({
      source: d.source,
      text: d.text,
    })),
    scriptureRefs: r.scripture_refs ?? [],
  };
}

function mapHebrewWord(r: any): GnosisHebrewWord {
  return {
    wordId: r.word_id,
    position: r.position,
    text: r.text,
    lemmaRaw: r.lemma_raw,
    strongsNumber: r.strongs_number ?? null,
    morph: r.morph,
  };
}

function mapGreekWord(r: any): GnosisGreekWord {
  return {
    wordId: r.word_id,
    position: r.position,
    text: r.text,
    lemma: r.lemma,
    strongsNumber: r.strongs_number ?? null,
    morph: r.morph,
  };
}

function mapLexicon(r: any): GnosisLexiconEntry {
  return {
    lexicalId: r.lexical_id,
    uuid: r.uuid,
    hebrew: r.hebrew,
    transliteration: r.transliteration ?? null,
    partOfSpeech: r.part_of_speech ?? null,
    gloss: r.gloss ?? null,
    strongsNumber: r.strongs_number ?? null,
    twotNumber: r.twot_number ?? null,
  };
}

function mapGreekLexicon(r: any): GnosisGreekLexiconEntry {
  return {
    strongsNumber: r.strongs_number,
    uuid: r.uuid,
    greek: r.greek,
    transliteration: r.transliteration ?? null,
    partOfSpeech: r.part_of_speech ?? null,
    shortGloss: r.short_gloss ?? null,
    longGloss: r.long_gloss ?? null,
    gkNumber: r.gk_number ?? null,
  };
}

function mapSearchResult(r: any): GnosisSearchResult {
  return {
    slug: r.slug,
    name: r.name,
    entityType: r.entity_type,
    uuid: r.uuid,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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

  async getChapterEntities(book: string, chapter: number): Promise<ChapterEntities> {
    return this.cachedFetch(`chapter:${book}:${chapter}`, CACHE_TTL.chapter, async () => {
      const resp = await this.fetch<{ data: { book: string; chapter: number; people: string[]; places: string[]; events: string[]; topics: string[] } }>(
        `/chapters/${book}/${chapter}`
      );
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
      const resp = await this.fetch<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }>('/people', params);
      return { data: resp.data.map(mapPerson), meta: resp.meta };
    });
  }

  async getPerson(slug: string): Promise<GnosisPerson> {
    return this.cachedFetch(`person:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown }>(`/people/${slug}`);
      return mapPerson(resp.data);
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
      const resp = await this.fetch<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }>('/places', params);
      return { data: resp.data.map(mapPlace), meta: resp.meta };
    });
  }

  async getPlace(slug: string): Promise<GnosisPlace> {
    return this.cachedFetch(`place:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown }>(`/places/${slug}`);
      return mapPlace(resp.data);
    });
  }

  // --- Events ---

  async searchEvents(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisEvent>> {
    const params: Record<string, string> = { ...this.paginationParams(opts) };
    if (query) params.q = query;

    const cacheKey = `events:search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }>('/events', params);
      return { data: resp.data.map(mapEvent), meta: resp.meta };
    });
  }

  async getEvent(slug: string): Promise<GnosisEvent> {
    return this.cachedFetch(`event:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown }>(`/events/${slug}`);
      return mapEvent(resp.data);
    });
  }

  // --- Topics ---

  async searchTopics(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisTopic>> {
    const params: Record<string, string> = { ...this.paginationParams(opts) };
    if (query) params.q = query;

    const cacheKey = `topics:search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }>('/topics', params);
      return { data: resp.data.map(mapTopic), meta: resp.meta };
    });
  }

  async getTopic(slug: string): Promise<GnosisTopic> {
    return this.cachedFetch(`topic:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown }>(`/topics/${slug}`);
      return mapTopic(resp.data);
    });
  }

  // --- Groups ---

  async searchGroups(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisPeopleGroup>> {
    const params: Record<string, string> = { ...this.paginationParams(opts) };
    if (query) params.q = query;

    const cacheKey = `groups:search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }>('/groups', params);
      return { data: resp.data.map(mapGroup), meta: resp.meta };
    });
  }

  async getGroup(slug: string): Promise<GnosisPeopleGroup> {
    return this.cachedFetch(`group:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown }>(`/groups/${slug}`);
      return mapGroup(resp.data);
    });
  }

  // --- Verse-level ---

  async getVerseEntities(osisRef: string): Promise<VerseEntities> {
    return this.cachedFetch(`verse:${osisRef}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: { osis_ref: string; people: string[]; places: string[]; events: string[]; topics: string[] } }>(
        `/verses/${osisRef}`
      );
      const d = resp.data;
      return { osisRef: d.osis_ref, people: d.people, places: d.places, events: d.events, topics: d.topics };
    });
  }

  async getCrossReferences(osisRef: string): Promise<PaginatedResponse<GnosisCrossReference>> {
    return this.cachedFetch(`crossref:${osisRef}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }>(
        `/verses/${osisRef}/cross-references`
      );
      return { data: resp.data.map(mapCrossRef), meta: resp.meta };
    });
  }

  // --- Language ---

  async getHebrewWords(osisRef: string): Promise<GnosisHebrewWord[]> {
    return this.cachedFetch(`hebrew:${osisRef}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown[] }>(`/hebrew/${osisRef}`);
      return resp.data.map(mapHebrewWord);
    });
  }

  async getGreekWords(osisRef: string): Promise<GnosisGreekWord[]> {
    return this.cachedFetch(`greek:${osisRef}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown[] }>(`/greek/${osisRef}`);
      return resp.data.map(mapGreekWord);
    });
  }

  async getLexiconEntry(lexicalId: string): Promise<GnosisLexiconEntry> {
    return this.cachedFetch(`lexicon:${lexicalId}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown }>(`/lexicon/${lexicalId}`);
      return mapLexicon(resp.data);
    });
  }

  async getGreekLexiconEntry(strongsNumber: string): Promise<GnosisGreekLexiconEntry> {
    return this.cachedFetch(`greeklex:${strongsNumber}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown }>(`/greek-lexicon/${strongsNumber}`);
      return mapGreekLexicon(resp.data);
    });
  }

  // --- Strong's & Dictionary ---

  async getStrongsEntry(number: string): Promise<GnosisStrongsEntry> {
    return this.cachedFetch(`strongs:${number}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown }>(`/strongs/${number}`);
      return mapStrongs(resp.data);
    });
  }

  async searchDictionary(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisDictionaryEntry>> {
    const params: Record<string, string> = { ...this.paginationParams(opts) };
    if (query) params.q = query;

    const cacheKey = `dict:search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }>('/dictionary', params);
      return { data: resp.data.map(mapDictionary), meta: resp.meta };
    });
  }

  async getDictionaryEntry(slug: string): Promise<GnosisDictionaryEntry> {
    return this.cachedFetch(`dict:${slug}`, CACHE_TTL.entity, async () => {
      const resp = await this.fetch<{ data: unknown }>(`/dictionary/${slug}`);
      return mapDictionary(resp.data);
    });
  }

  // --- Search ---

  async search(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisSearchResult>> {
    const params: Record<string, string> = { q: query, ...this.paginationParams(opts) };

    const cacheKey = `search:${JSON.stringify(params)}`;
    return this.cachedFetch(cacheKey, CACHE_TTL.list, async () => {
      const resp = await this.fetch<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }>('/search', params);
      return { data: resp.data.map(mapSearchResult), meta: resp.meta };
    });
  }

  // --- Meta ---

  async getMeta(): Promise<GnosisMeta> {
    return this.cachedFetch('meta', CACHE_TTL.meta, async () => {
      const resp = await this.fetch<{ data: { version: string | null; build_date: string | null; counts: Record<string, number> } }>('/meta');
      return { version: resp.data.version, buildDate: resp.data.build_date, counts: resp.data.counts };
    });
  }
}
