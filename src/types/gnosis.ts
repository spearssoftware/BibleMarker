/** Gnosis knowledge graph entity types */

// --- Pagination ---

export interface PaginationOpts {
  limit?: number;
  offset?: number;
}

export interface PaginatedMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

export interface SingleResponse<T> {
  data: T;
}

// --- Core Entities ---

export interface GnosisPerson {
  slug: string;
  uuid: string;
  name: string;
  gender: string | null;
  birthYear: number | null;
  deathYear: number | null;
  birthYearDisplay: string | null;
  deathYearDisplay: string | null;
  earliestYearMentioned: number | null;
  latestYearMentioned: number | null;
  earliestYearMentionedDisplay: string | null;
  latestYearMentionedDisplay: string | null;
  birthPlace: string | null;
  deathPlace: string | null;
  father: string | null;
  mother: string | null;
  siblings: string[];
  children: string[];
  partners: string[];
  verseCount: number;
  verses: string[];
  firstMention: string | null;
  nameMeaning: string | null;
  peopleGroups: string[];
}

export interface GnosisPlace {
  slug: string;
  uuid: string;
  name: string;
  kjvName: string | null;
  esvName: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinateSource: string | null;
  featureType: string | null;
  featureSubType: string | null;
  modernName: string | null;
}

export interface GnosisEvent {
  slug: string;
  uuid: string;
  title: string;
  startYear: number | null;
  endYear: number | null;
  startYearDisplay: string | null;
  duration: string | null;
  sortKey: number | null;
  participants: string[];
  locations: string[];
  verses: string[];
  parentEvent: string | null;
  predecessor: string | null;
}

export interface GnosisTopic {
  slug: string;
  uuid: string;
  name: string;
  aspects: GnosisTopicAspect[];
  seeAlso: string[];
}

export interface GnosisTopicAspect {
  label: string | null;
  source: string | null;
  verses: string[];
}

export interface GnosisPeopleGroup {
  slug: string;
  uuid: string;
  name: string;
  members: string[];
}

// --- Verse-level ---

export interface VerseEntities {
  osisRef: string;
  people: string[];
  places: string[];
  events: string[];
  topics: string[];
}

export interface ChapterEntities {
  book: string;
  chapter: number;
  people: string[];
  places: string[];
  events: string[];
  topics: string[];
}

export interface GnosisCrossReference {
  fromVerse: string;
  toVerseStart: string;
  toVerseEnd: string | null;
  votes: number;
}

// --- Language / Lexicon ---

export interface GnosisStrongsEntry {
  number: string;
  uuid: string;
  language: string;
  lemma: string | null;
  transliteration: string | null;
  pronunciation: string | null;
  definition: string | null;
  kjvUsage: string | null;
}

export interface GnosisDictionaryDefinition {
  source: string;
  text: string;
}

export interface GnosisDictionaryEntry {
  slug: string;
  uuid: string;
  name: string;
  definitions: GnosisDictionaryDefinition[];
  scriptureRefs: string[];
}


export interface GnosisLexiconEntry {
  lexicalId: string;
  uuid: string;
  hebrew: string;
  transliteration: string | null;
  partOfSpeech: string | null;
  gloss: string | null;
  strongsNumber: string | null;
  twotNumber: string | null;
}

export interface GnosisGreekLexiconEntry {
  strongsNumber: string;
  uuid: string;
  greek: string;
  transliteration: string | null;
  partOfSpeech: string | null;
  shortGloss: string | null;
  longGloss: string | null;
  gkNumber: string | null;
}

// --- Search ---

export interface GnosisSearchResult {
  slug: string;
  name: string;
  entityType: string;
  uuid: string;
}

// --- Meta ---

export interface GnosisMeta {
  version: string | null;
  buildDate: string | null;
  counts: Record<string, number>;
}

// --- Config ---

export type GnosisMode = 'api' | 'local' | 'auto';

export interface GnosisConfig {
  mode: GnosisMode;
  apiKey?: string;
}
