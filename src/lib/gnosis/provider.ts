import type {
  ChapterEntities,
  ChapterEntityVerseIndex,
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

export interface GnosisDataProvider {
  readonly mode: 'api' | 'local';
  isAvailable(): boolean;

  // Chapter
  getBookChapterYears(book: string): Promise<Map<number, { year: number; yearDisplay: string }>>;
  getChapterEntities(book: string, chapter: number): Promise<ChapterEntities>;
  getChapterYear(book: string, chapter: number): Promise<{ year: number; yearDisplay: string } | null>;
  /**
   * Which verses in a chapter name at least one person / place. Optional: only
   * the local SQLite provider implements it — the API client has no chapter-level
   * per-verse route, and N x `getVerseEntities` over HTTP is not an honest
   * fallback. Callers must treat a missing method as "no per-verse data".
   */
  getChapterEntityVerseIndex?(book: string, chapter: number): Promise<ChapterEntityVerseIndex>;

  // People
  searchPeople(query: string, opts?: PaginationOpts & { gender?: string }): Promise<PaginatedResponse<GnosisPerson>>;
  getPerson(slug: string): Promise<GnosisPerson>;

  // Places
  searchPlaces(query: string, opts?: PaginationOpts & { hasCoordinates?: boolean; featureType?: string }): Promise<PaginatedResponse<GnosisPlace>>;
  getPlace(slug: string): Promise<GnosisPlace>;

  // Events
  searchEvents(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisEvent>>;
  getEvent(slug: string): Promise<GnosisEvent>;

  // Topics
  searchTopics(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisTopic>>;
  getTopic(slug: string): Promise<GnosisTopic>;

  // Groups
  searchGroups(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisPeopleGroup>>;
  getGroup(slug: string): Promise<GnosisPeopleGroup>;

  // Verse-level
  getVerseEntities(osisRef: string): Promise<VerseEntities>;
  getCrossReferences(osisRef: string): Promise<PaginatedResponse<GnosisCrossReference>>;

  // Language
  getLexiconEntry(lexicalId: string): Promise<GnosisLexiconEntry>;
  getGreekLexiconEntry(strongsNumber: string): Promise<GnosisGreekLexiconEntry>;

  // Strong's & Dictionary
  getStrongsEntry(number: string): Promise<GnosisStrongsEntry>;
  searchDictionary(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisDictionaryEntry>>;
  getDictionaryEntry(slug: string): Promise<GnosisDictionaryEntry>;

  // Search
  search(query: string, opts?: PaginationOpts): Promise<PaginatedResponse<GnosisSearchResult>>;

  // Meta
  getMeta(): Promise<GnosisMeta>;
}
