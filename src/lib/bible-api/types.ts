/**
 * Bible API Types
 * 
 * Common types for Bible API providers (Biblia, ESV API, etc.)
 */

import type { VerseRef } from '@/types';

/** Supported Bible API providers */
export type BibleApiProvider = 'biblia' | 'esv' | 'getbible' | 'biblegateway';

/** API configuration for a provider */
export interface ApiConfig {
  provider: BibleApiProvider;
  apiKey?: string;
  /** BibleGateway: account username */
  username?: string;
  /** BibleGateway: account password */
  password?: string;
  baseUrl?: string;
  enabled: boolean;
}

/** Available translation from an API */
export interface ApiTranslation {
  id: string;              // API-specific ID (e.g., "eng-ESV", "NASB")
  name: string;            // Display name (e.g., "English Standard Version")
  abbreviation: string;    // Short name (e.g., "ESV", "NASB")
  language: string;        // Language code (e.g., "en")
  provider: BibleApiProvider;
  description?: string;
  copyright?: string;
}

/** Response from fetching a chapter */
export interface ChapterResponse {
  book: string;
  chapter: number;
  verses: VerseResponse[];
  copyright?: string;
}

/** Response for a single verse */
export interface VerseResponse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  html?: string;
}

/** Search result from Bible API */
export interface SearchResult {
  ref: VerseRef;
  text: string;
  preview: string;         // Text with search term highlighted
  translation: string;
}

/** Bible API provider interface */
export interface BibleApiClient {
  /** Provider identifier */
  readonly provider: BibleApiProvider;
  
  /** Check if the API is configured and ready */
  isConfigured(): boolean;
  
  /** Configure the API with credentials */
  configure(config: ApiConfig): void;
  
  /** Get list of available translations */
  getTranslations(): Promise<ApiTranslation[]>;
  
  /** Fetch a chapter */
  getChapter(translationId: string, book: string, chapter: number): Promise<ChapterResponse>;
  
  /** Fetch a single verse */
  getVerse(translationId: string, ref: VerseRef): Promise<VerseResponse>;
  
  /** Fetch a range of verses */
  getVerseRange(translationId: string, startRef: VerseRef, endRef: VerseRef): Promise<VerseResponse[]>;
  
  /** Search for text (if supported) */
  search?(translationId: string, query: string, limit?: number): Promise<SearchResult[]>;
}

/** Error from Bible API */
export class BibleApiError extends Error {
  constructor(
    message: string,
    public provider: BibleApiProvider,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'BibleApiError';
  }
}
