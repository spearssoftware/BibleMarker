/**
 * getBible API Client
 * 
 * Client for the getBible API v2 which provides free access to many
 * Bible translations without requiring API keys.
 * 
 * API Documentation: https://github.com/getbible/v2
 * Main API: https://api.getbible.net/v2/
 * Query API: https://query.getbible.net/v2/
 * 
 * The getBible API is free and open source (GPL-3.0).
 * You can also self-host by cloning the repository and serving the JSON files.
 */

import type {
  BibleApiClient,
  ApiConfig,
  ApiTranslation,
  ChapterResponse,
  VerseResponse,
  BibleApiProvider,
} from './types';
import { BibleApiError } from './types';
import type { VerseRef } from '@/types/bible';
import { getBookById } from '@/types/bible';
import { getCachedTranslations, setCachedTranslations } from '@/lib/database';

// Default to public API, but can be configured for self-hosted instance
const DEFAULT_MAIN_API_URL = 'https://api.getbible.net/v2';
const DEFAULT_QUERY_API_URL = 'https://query.getbible.net/v2';

// Map OSIS book IDs to getBible book names (KJV names work for most translations)
const OSIS_TO_GETBIBLE: Record<string, string> = {
  'Gen': 'Genesis',
  'Exod': 'Exodus',
  'Lev': 'Leviticus',
  'Num': 'Numbers',
  'Deut': 'Deuteronomy',
  'Josh': 'Joshua',
  'Judg': 'Judges',
  'Ruth': 'Ruth',
  '1Sam': '1 Samuel',
  '2Sam': '2 Samuel',
  '1Kgs': '1 Kings',
  '2Kgs': '2 Kings',
  '1Chr': '1 Chronicles',
  '2Chr': '2 Chronicles',
  'Ezra': 'Ezra',
  'Neh': 'Nehemiah',
  'Esth': 'Esther',
  'Job': 'Job',
  'Ps': 'Psalms',
  'Prov': 'Proverbs',
  'Eccl': 'Ecclesiastes',
  'Song': 'Song of Solomon',
  'Isa': 'Isaiah',
  'Jer': 'Jeremiah',
  'Lam': 'Lamentations',
  'Ezek': 'Ezekiel',
  'Dan': 'Daniel',
  'Hos': 'Hosea',
  'Joel': 'Joel',
  'Amos': 'Amos',
  'Obad': 'Obadiah',
  'Jonah': 'Jonah',
  'Mic': 'Micah',
  'Nah': 'Nahum',
  'Hab': 'Habakkuk',
  'Zeph': 'Zephaniah',
  'Hag': 'Haggai',
  'Zech': 'Zechariah',
  'Mal': 'Malachi',
  'Matt': 'Matthew',
  'Mark': 'Mark',
  'Luke': 'Luke',
  'John': 'John',
  'Acts': 'Acts',
  'Rom': 'Romans',
  '1Cor': '1 Corinthians',
  '2Cor': '2 Corinthians',
  'Gal': 'Galatians',
  'Eph': 'Ephesians',
  'Phil': 'Philippians',
  'Col': 'Colossians',
  '1Thess': '1 Thessalonians',
  '2Thess': '2 Thessalonians',
  '1Tim': '1 Timothy',
  '2Tim': '2 Timothy',
  'Titus': 'Titus',
  'Phlm': 'Philemon',
  'Heb': 'Hebrews',
  'Jas': 'James',
  '1Pet': '1 Peter',
  '2Pet': '2 Peter',
  '1John': '1 John',
  '2John': '2 John',
  '3John': '3 John',
  'Jude': 'Jude',
  'Rev': 'Revelation',
};

// Map getBible book numbers to OSIS IDs
const _GETBIBLE_BOOK_NUMBERS: Record<number, string> = {
  1: 'Gen', 2: 'Exod', 3: 'Lev', 4: 'Num', 5: 'Deut',
  6: 'Josh', 7: 'Judg', 8: 'Ruth', 9: '1Sam', 10: '2Sam',
  11: '1Kgs', 12: '2Kgs', 13: '1Chr', 14: '2Chr', 15: 'Ezra',
  16: 'Neh', 17: 'Esth', 18: 'Job', 19: 'Ps', 20: 'Prov',
  21: 'Eccl', 22: 'Song', 23: 'Isa', 24: 'Jer', 25: 'Lam',
  26: 'Ezek', 27: 'Dan', 28: 'Hos', 29: 'Joel', 30: 'Amos',
  31: 'Obad', 32: 'Jonah', 33: 'Mic', 34: 'Nah', 35: 'Hab',
  36: 'Zeph', 37: 'Hag', 38: 'Zech', 39: 'Mal', 40: 'Matt',
  41: 'Mark', 42: 'Luke', 43: 'John', 44: 'Acts', 45: 'Rom',
  46: '1Cor', 47: '2Cor', 48: 'Gal', 49: 'Eph', 50: 'Phil',
  51: 'Col', 52: '1Thess', 53: '2Thess', 54: '1Tim', 55: '2Tim',
  56: 'Titus', 57: 'Phlm', 58: 'Heb', 59: 'Jas', 60: '1Pet',
  61: '2Pet', 62: '1John', 63: '2John', 64: '3John', 65: 'Jude',
  66: 'Rev',
};

function toGetBibleBook(osisId: string): string {
  return OSIS_TO_GETBIBLE[osisId] || osisId;
}

function getBookNumber(osisId: string): number | null {
  const bookInfo = getBookById(osisId);
  if (!bookInfo) return null;
  return bookInfo.order;
}

interface _GetBibleChapterResponse {
  reference: string;
  verses: Record<string, string | number | object>; // verse number -> text (may be string, number, or object)
  text: string; // full chapter text
  translation_id: string;
  translation_name: string;
  translation_note: string;
  book_id: string;
  book_name: string;
  chapter: number;
}

interface GetBibleTranslation {
  id?: string;  // May not be present - use abbreviation instead
  translation?: string;  // Full name
  name?: string;  // Alternative name field
  abbreviation: string;  // This is the actual ID used by the API
  language?: string;
  language_name?: string;
  lang?: string;  // Alternative language field
  direction?: string;
  encoding?: string;
  book_nr?: number;
  description?: string;
}

class GetBibleClient implements BibleApiClient {
  readonly provider: BibleApiProvider = 'getbible';
  private config: ApiConfig | null = null;
  private mainApiUrl: string = DEFAULT_MAIN_API_URL;
  private queryApiUrl: string = DEFAULT_QUERY_API_URL;

  isConfigured(): boolean {
    return this.config?.enabled ?? true; // getBible is free, so enabled by default
  }

  configure(config: ApiConfig): void {
    this.config = config;
    // Allow custom base URL for self-hosted instances
    if (config.baseUrl) {
      // If baseUrl is provided, use it for both main and query APIs
      // User can specify full URL or just the base
      if (config.baseUrl.includes('api.getbible.net') || config.baseUrl.includes('query.getbible.net')) {
        // Full URL provided
        if (config.baseUrl.includes('api.getbible.net')) {
          this.mainApiUrl = config.baseUrl;
        } else {
          this.queryApiUrl = config.baseUrl;
        }
      } else {
        // Base URL provided, construct full paths
        this.mainApiUrl = `${config.baseUrl}/v2`;
        this.queryApiUrl = `${config.baseUrl.replace('/api/', '/query/')}/v2`;
      }
    }
  }

  async getTranslations(): Promise<ApiTranslation[]> {
    // Check cache first - refresh once per day
    try {
      const cachedTranslations = await getCachedTranslations();
      if (cachedTranslations) {
        // For now, we'll use the cache if it exists. The database module handles TTL internally.
        const translations: GetBibleTranslation[] = Array.isArray(cachedTranslations)
          ? (cachedTranslations as GetBibleTranslation[])
          : (Object.values(cachedTranslations || {}) as GetBibleTranslation[]);
        
        return this.parseTranslations(translations);
      }
    } catch (error) {
      // If translationCache table doesn't exist yet (old database version), just fetch
      console.warn('[GetBibleClient] Error reading cache (table may not exist), fetching fresh:', error);
    }
    
    // Fetch fresh translations
    try {
      const url = `${this.mainApiUrl}/translations.json`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch translations: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const translations: GetBibleTranslation[] = Array.isArray(data) ? (data as GetBibleTranslation[]) : (Object.values(data as Record<string, unknown>) as GetBibleTranslation[]);

      // Parse and return immediately, cache in background
      const parsed = this.parseTranslations(translations);
      
      // Cache the raw data in background (don't wait)
      setCachedTranslations(translations).catch((cacheError) => {
        console.warn('[GetBibleClient] Failed to cache translations:', cacheError);
      });
      
      return parsed;
    } catch (error) {
      console.error('[GetBibleClient] Failed to fetch translations:', error);
      
      // Try to return cached data even if expired
      try {
        const cachedTranslations = await getCachedTranslations();
        if (cachedTranslations) {
          const translations: GetBibleTranslation[] = Array.isArray(cachedTranslations)
            ? (cachedTranslations as GetBibleTranslation[])
            : (Object.values(cachedTranslations || {}) as GetBibleTranslation[]);
          return this.parseTranslations(translations);
        }
      } catch (fallbackError) {
        console.warn('[GetBibleClient] Fallback cache also failed:', fallbackError);
      }
      
      return [];
    }
  }

  private parseTranslations(translations: GetBibleTranslation[]): ApiTranslation[] {
    const validTranslations = translations
      .filter(t => {
        // Use abbreviation as the ID if id is not present
        const translationId = t.id || t.abbreviation;
        const hasValidId = translationId && typeof translationId === 'string' && translationId.trim() !== '';
        if (!hasValidId) {
          console.warn('[GetBibleClient] Filtering out translation with invalid ID:', t);
        }
        return hasValidId;
      })
      .map(t => {
        // Use abbreviation as the ID (this is what the API uses)
        const translationId = (t.id || t.abbreviation || '').trim();
        const name = t.translation || t.name || translationId;
        const abbreviation = t.abbreviation || translationId.toUpperCase();
        const language = t.lang || t.language || 'en';
        const languageName = t.language_name || t.language || language;
        
        return {
          id: translationId,
          name: name,
          abbreviation: abbreviation,
          language: language,
          provider: this.provider,
          description: t.description || `${languageName} - ${name}`,
        };
      });
    
    return validTranslations;
  }

  async getChapter(
    translationId: string,
    book: string,
    chapter: number
  ): Promise<ChapterResponse> {
    const bookNumber = getBookNumber(book);
    if (!bookNumber) {
      throw new BibleApiError(
        `Invalid book: ${book}`,
        this.provider
      );
    }

    try {
      // Use Main API for full chapter: /v2/{translation}/{book_number}/{chapter}.json
      const url = `${this.mainApiUrl}/${translationId}/${bookNumber}/${chapter}.json`;
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new BibleApiError(
            `Chapter not found: ${book} ${chapter} in ${translationId}`,
            this.provider,
            404
          );
        }
        throw new BibleApiError(
          `Failed to fetch chapter: ${response.statusText}`,
          this.provider,
          response.status
        );
      }

      type GetBibleVerseItem = { verse?: number | string; text?: string | { text?: string; content?: string } };
      type GetBibleChapterData = {
        verses?: GetBibleVerseItem[] | Record<string, unknown>;
        result?: Record<string, { verses?: GetBibleVerseItem[] }>;
        translation_note?: string;
      };
      const data = await response.json() as GetBibleChapterData;

      // getBible API v2 Main API returns verses as an array of objects
      // Format: { verses: [{ chapter: 1, verse: 1, name: "Genesis 1:1", text: "..." }, ...] }
      let versesArray: GetBibleVerseItem[] = [];

      if (Array.isArray(data.verses)) {
        versesArray = data.verses;
      } else if (data.verses && typeof data.verses === 'object' && !Array.isArray(data.verses)) {
        // Legacy format - verses is an object with verse numbers as keys
        versesArray = Object.entries(data.verses as Record<string, unknown>).map(([verseNum, text]) => ({
          verse: parseInt(verseNum, 10),
          text: typeof text === 'string' ? text : (typeof text === 'object' && text !== null && 'text' in text ? (text as { text?: string }).text : String(text ?? '')),
        }));
      } else if (data.result) {
        // Query API format - extract from result
        const firstKey = Object.keys(data.result)[0];
        if (firstKey && data.result[firstKey].verses) {
          versesArray = data.result[firstKey].verses as GetBibleVerseItem[];
        }
      }
      
      if (versesArray.length === 0) {
        console.warn('getBible API: No verses found in response', {
          url,
          hasVerses: !!data.verses,
          isArray: Array.isArray(data.verses),
          hasResult: !!data.result,
          dataKeys: Object.keys(data),
        });
        throw new BibleApiError(
          `No verses found in getBible response for ${book} ${chapter}`,
          this.provider,
          404
        );
      }
      
      // Convert getBible format to our format
      const verses: VerseResponse[] = versesArray
        .filter((verse): verse is GetBibleVerseItem & { verse: number | string } => verse != null && verse.verse !== undefined && verse.verse !== null)
        .map((verse) => {
          let textStr = '';
          if (typeof verse.text === 'string') {
            textStr = verse.text;
          } else if (verse.text && typeof verse.text === 'object') {
            textStr = String(verse.text.text || verse.text.content || '');
          } else {
            textStr = String(verse.text || '');
          }
          const verseNum = typeof verse.verse === 'number' ? verse.verse : parseInt(String(verse.verse ?? '0'), 10);
          return {
            book,
            chapter,
            verse: verseNum,
            text: textStr.trim(),
            html: textStr.trim(),
          };
        })
        .filter(v => v.verse > 0) // Filter out invalid verses
        .sort((a, b) => a.verse - b.verse);

      return {
        book,
        chapter,
        verses,
        copyright: data.translation_note || undefined,
      };
    } catch (error) {
      if (error instanceof BibleApiError) {
        throw error;
      }
      throw new BibleApiError(
        `Failed to fetch chapter: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.provider,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getVerse(
    translationId: string,
    ref: VerseRef
  ): Promise<VerseResponse> {
    // Use Query API for single verse
    const bookName = toGetBibleBook(ref.book);
    const query = `${bookName} ${ref.chapter}:${ref.verse}`;
    
    try {
      const url = `${this.queryApiUrl}/${translationId}/${encodeURIComponent(query)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new BibleApiError(
          `Failed to fetch verse: ${response.statusText}`,
          this.provider,
          response.status
        );
      }

      const data = await response.json();
      
      // Query API returns verses in order
      const verse = data.verses?.[0];
      if (!verse) {
        throw new BibleApiError(
          `Verse not found: ${ref.book} ${ref.chapter}:${ref.verse}`,
          this.provider,
          404
        );
      }

      return {
        book: ref.book,
        chapter: ref.chapter,
        verse: ref.verse,
        text: verse.text || '',
        html: verse.text || '',
      };
    } catch (error) {
      if (error instanceof BibleApiError) {
        throw error;
      }
      throw new BibleApiError(
        `Failed to fetch verse: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.provider,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getVerseRange(
    translationId: string,
    startRef: VerseRef,
    endRef: VerseRef
  ): Promise<VerseResponse[]> {
    // Use Query API for verse ranges
    const bookName = toGetBibleBook(startRef.book);
    const query = `${bookName} ${startRef.chapter}:${startRef.verse}-${endRef.verse}`;
    
    try {
      const url = `${this.queryApiUrl}/${translationId}/${encodeURIComponent(query)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new BibleApiError(
          `Failed to fetch verse range: ${response.statusText}`,
          this.provider,
          response.status
        );
      }

      const data = await response.json();
      
      return ((data as { verses?: Array<{ verse?: number; text?: string }> }).verses || []).map((verse) => ({
        book: startRef.book,
        chapter: startRef.chapter,
        verse: verse.verse || 0,
        text: verse.text || '',
        html: verse.text || '',
      }));
    } catch (error) {
      if (error instanceof BibleApiError) {
        throw error;
      }
      throw new BibleApiError(
        `Failed to fetch verse range: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.provider,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }
}

export const getBibleClient = new GetBibleClient();
