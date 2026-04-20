import type {
  ChapterEntities,
  GnosisCrossReference,
  GnosisDictionaryEntry,
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
  getHebrewWords(osisRef: string): Promise<GnosisHebrewWord[]>;
  getGreekWords(osisRef: string): Promise<GnosisGreekWord[]>;
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
