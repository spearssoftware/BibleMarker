/**
 * Biblia API Client
 * 
 * Client for Faithlife's Biblia API which provides access to
 * NASB, ESV, and many other translations.
 * 
 * API Documentation: https://api.biblia.com/docs/
 * Free tier: 5,000 calls/day
 * 
 * Note: The Biblia API does not support CORS, so in development we use
 * a Vite proxy (configured in vite.config.ts) to forward requests.
 * For production, you'll need to set up a backend proxy or use a service
 * that supports CORS.
 */

import type {
  BibleApiClient,
  ApiConfig,
  ApiTranslation,
  ChapterResponse,
  VerseResponse,
  SearchResult,
  BibleApiProvider,
} from './types';
import { BibleApiError } from './types';
import type { VerseRef } from '@/types/bible';
import { getBookById } from '@/types/bible';

// Use proxy in development, direct API in production
// In development, Vite proxy forwards /api/biblia/* to https://api.biblia.com/v1/bible/*
const BIBLIA_BASE_URL = import.meta.env.DEV 
  ? '/api/biblia' 
  : 'https://api.biblia.com/v1/bible';

/** Map OSIS book IDs to Biblia format */
function toBibliaBook(osisId: string): string {
  // Biblia uses slightly different book names
  const mapping: Record<string, string> = {
    'Gen': 'Genesis',
    'Exod': 'Exodus',
    'Lev': 'Leviticus',
    'Num': 'Numbers',
    'Deut': 'Deuteronomy',
    'Josh': 'Joshua',
    'Judg': 'Judges',
    'Ruth': 'Ruth',
    '1Sam': '1Samuel',
    '2Sam': '2Samuel',
    '1Kgs': '1Kings',
    '2Kgs': '2Kings',
    '1Chr': '1Chronicles',
    '2Chr': '2Chronicles',
    'Ezra': 'Ezra',
    'Neh': 'Nehemiah',
    'Esth': 'Esther',
    'Job': 'Job',
    'Ps': 'Psalms',
    'Prov': 'Proverbs',
    'Eccl': 'Ecclesiastes',
    'Song': 'SongofSolomon',
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
    '1Cor': '1Corinthians',
    '2Cor': '2Corinthians',
    'Gal': 'Galatians',
    'Eph': 'Ephesians',
    'Phil': 'Philippians',
    'Col': 'Colossians',
    '1Thess': '1Thessalonians',
    '2Thess': '2Thessalonians',
    '1Tim': '1Timothy',
    '2Tim': '2Timothy',
    'Titus': 'Titus',
    'Phlm': 'Philemon',
    'Heb': 'Hebrews',
    'Jas': 'James',
    '1Pet': '1Peter',
    '2Pet': '2Peter',
    '1John': '1John',
    '2John': '2John',
    '3John': '3John',
    'Jude': 'Jude',
    'Rev': 'Revelation',
  };
  return mapping[osisId] || osisId;
}

/** Parse Biblia verse text to clean it up */
function parseVerseText(html: string): { text: string; html: string } {
  // Remove HTML tags for plain text
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  
  return { text, html };
}

export class BibliaClient implements BibleApiClient {
  readonly provider: BibleApiProvider = 'biblia';
  private apiKey: string | null = null;
  private baseUrl = BIBLIA_BASE_URL;

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  configure(config: ApiConfig): void {
    if (config.apiKey) {
      this.apiKey = config.apiKey;
    }
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    }
  }

  private async fetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.apiKey) {
      throw new BibleApiError('Biblia API key not configured', 'biblia');
    }

    // In development, use relative URL for proxy; in production, use full URL
    let url: URL;
    if (import.meta.env.DEV && this.baseUrl.startsWith('/')) {
      // Development: use relative URL (will go through Vite proxy)
      url = new URL(`${this.baseUrl}${endpoint}`, window.location.origin);
    } else {
      // Production: use full URL
      url = new URL(`${this.baseUrl}${endpoint}`);
    }
    
    url.searchParams.set('key', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const requestUrl = import.meta.env.DEV && this.baseUrl.startsWith('/')
      ? url.pathname + url.search  // Relative URL for proxy
      : url.toString();  // Full URL for production

    console.log('[Biblia] Fetching:', requestUrl.substring(0, 100) + '...');

    try {
      const response = await fetch(requestUrl);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        
        // Provide more helpful error messages
        if (response.status === 403) {
          const isHtml = errorText.trim().startsWith('<!DOCTYPE');
          if (isHtml) {
            // 403 usually means the Bible ID is not available with this API key
            const translationIdMatch = endpoint.match(/\/content\/([^.]+)\./);
            const translationId = translationIdMatch ? translationIdMatch[1] : 'unknown';
            throw new BibleApiError(
              `Bible translation "${translationId}" is not available with your API key. Try KJV, ASV, or LEB instead.`,
              'biblia',
              response.status
            );
          }
        }
        
        throw new BibleApiError(
          `Biblia API error: ${response.status} ${response.statusText}${errorText && !errorText.trim().startsWith('<!DOCTYPE') ? ' - ' + errorText.substring(0, 200) : ''}`,
          'biblia',
          response.status
        );
      }

      // Check if endpoint is .txt format (plain text) or JSON format
      if (endpoint.endsWith('.txt') && !endpoint.endsWith('.txt.json')) {
        // Plain text response
        const text = await response.text();
        return { text } as T;
      } else {
        // JSON response
        return await response.json();
      }
    } catch (error) {
      if (error instanceof BibleApiError) throw error;
      throw new BibleApiError(
        'Failed to fetch from Biblia API',
        'biblia',
        undefined,
        error as Error
      );
    }
  }

  async getTranslations(): Promise<ApiTranslation[]> {
    // Only show translations that are UNIQUE to Biblia API (not available from getBible)
    // KJV and ASV are available from getBible (free), so we don't show them here
    // According to https://bibliaapi.com/docs/Available_Bibles, unique translations include:
    // LEB, DARBY, EMPHBBL, YLT
    // Note: NASB, NIV, and ESV are NOT available in the Biblia API
    const mainTranslations: ApiTranslation[] = [
      {
        id: 'LEB',
        name: 'Lexham English Bible',
        abbreviation: 'LEB',
        language: 'en',
        provider: 'biblia',
        description: 'The Lexham English Bible (unique to Biblia API)',
      },
      {
        id: 'DARBY',
        name: 'Darby Bible',
        abbreviation: 'DARBY',
        language: 'en',
        provider: 'biblia',
        description: '1890 Darby Bible (unique to Biblia API)',
      },
      {
        id: 'YLT',
        name: 'Young\'s Literal Translation',
        abbreviation: 'YLT',
        language: 'en',
        provider: 'biblia',
        description: 'Young\'s Literal Translation (unique to Biblia API)',
      },
      {
        id: 'EMPHBBL',
        name: 'The Emphasized Bible',
        abbreviation: 'EMPHBBL',
        language: 'en',
        provider: 'biblia',
        description: 'The Emphasized Bible (unique to Biblia API)',
      },
      // Note: KJV and ASV are available from getBible (free), so not shown here
      // Note: NASB, NIV, and ESV are NOT available in Biblia API
      // If you need these translations, use the ESV API (for ESV) or another service
    ];

    // Try to fetch available Bibles from the API if configured
    // This can be used to enhance the list, but we always return the default list
    if (this.apiKey) {
      try {
        // Biblia API /find endpoint returns available Bibles
        const response = await this.fetch<{ bibles: Array<{ bible: string; title: string; abbreviatedTitle?: string; description?: string; languages?: string[] }> }>('/find.json');
        
        if (response && response.bibles && Array.isArray(response.bibles)) {
          console.log('[Biblia] Fetched', response.bibles.length, 'available Bibles from API');
          
          // Get list of available Bible IDs from API
          const availableBibleIds = new Set(
            response.bibles
              .map((b: any) => b.bible?.toUpperCase())
              .filter((id: string) => id)
          );
          
          // Mark which translations are confirmed available
          mainTranslations.forEach(translation => {
            const isAvailable = availableBibleIds.has(translation.id.toUpperCase());
            if (isAvailable) {
              console.log(`[Biblia] Translation "${translation.id}" is confirmed available with API key`);
            }
          });
        }
      } catch (error) {
        console.warn('[Biblia] Failed to fetch available Bibles from API, using default list:', error);
      }
    }

    console.log('[Biblia] Returning translations:', mainTranslations.map(t => t.id));
    return mainTranslations;
  }

  async getChapter(translationId: string, book: string, chapter: number): Promise<ChapterResponse> {
    const bibliaBook = toBibliaBook(book);
    // Biblia API passage format: "BookNameChapter" (no space, no dot) e.g., "John3" or "Genesis1"
    const passage = `${bibliaBook}${chapter}`;
    
    console.log('[Biblia] Fetching chapter:', { translationId, book, chapter, passage });
    
    // Fetch the entire chapter as text with verse markers
    const response = await this.fetch<{ text: string }>('/content/' + translationId + '.txt', {
      passage,
      style: 'oneVersePerLineFullReference',
    });

    console.log('[Biblia] Response received, length:', response.text?.length || 0);
    console.log('[Biblia] First 500 chars:', response.text?.substring(0, 500));

    // Parse the response into individual verses
    // Biblia returns one verse per line in format: "BookName Chapter:Verse Text"
    // Examples: "John 3:16 For God so loved..." or "Genesis 1:1 In the beginning..."
    const lines = response.text.split('\n').filter(line => line.trim());
    console.log('[Biblia] Total lines to parse:', lines.length);
    const verses: VerseResponse[] = [];
    
    let matchedCount = 0;
    let chapterMismatchCount = 0;
    let failedMatchCount = 0;
    
    for (const line of lines) {
      // Match pattern: "BookName Chapter:Verse Text"
      // Examples: "John 3:20 For everyone..." or "Genesis 1:1 In the beginning..."
      // Try multiple patterns to handle different formats
      
      // Pattern 1: Standard format "Chapter:Verse Text" (with space after colon)
      let match = line.match(/(\d+):(\d+)\s+(.+)$/);
      
      // Pattern 2: Without $ anchor (in case there are trailing characters)
      if (!match) {
        match = line.match(/(\d+):(\d+)\s+(.+)/);
      }
      
      // Pattern 3: No space after colon "Chapter:VerseText"
      if (!match) {
        match = line.match(/(\d+):(\d+)(.+)$/);
      }
      
      if (match) {
        matchedCount++;
        const verseChapter = parseInt(match[1], 10);
        const verseNum = parseInt(match[2], 10);
        let verseText = match[3]?.trim() || '';
        
        // Verify the chapter matches (should always match for single chapter requests)
        if (verseChapter === chapter && verseNum > 0 && verseText) {
          // Remove translation abbreviation in parentheses if present (e.g., "(NASB)" or "(LEB)")
          verseText = verseText.replace(/\s*\([^)]+\)\s*$/, '').trim();
          const { text, html } = parseVerseText(verseText);
          verses.push({
            book,
            chapter,
            verse: verseNum,
            text,
            html,
          });
        } else if (verseChapter !== chapter) {
          // Chapter mismatch - might be from a different chapter in the response
          chapterMismatchCount++;
          if (chapterMismatchCount <= 3) {
            console.warn(`[Biblia] Chapter mismatch: expected ${chapter}, got ${verseChapter}:${verseNum} in line:`, line.substring(0, 100));
          }
        } else if (!verseText || verseNum === 0) {
          console.warn(`[Biblia] Invalid verse data: verse=${verseNum}, text="${verseText.substring(0, 50)}" in line:`, line.substring(0, 100));
        }
      } else {
        failedMatchCount++;
        // Log first few failed lines to understand the format
        if (failedMatchCount <= 5) {
          console.warn(`[Biblia] Could not parse line ${failedMatchCount}:`, line.substring(0, 150));
          if (failedMatchCount === 1) {
            console.warn('[Biblia] Full first failed line:', JSON.stringify(line));
          }
        }
      }
    }
    
    console.log(`[Biblia] Parsing summary: ${matchedCount} matched, ${chapterMismatchCount} chapter mismatches, ${failedMatchCount} failed matches, ${verses.length} verses added`);

    if (verses.length === 0) {
      console.error('[Biblia] No verses parsed from response. Raw response:', response.text?.substring(0, 500));
      throw new BibleApiError(
        `Failed to parse verses from Biblia API response. Check if translation ID "${translationId}" is valid.`,
        'biblia'
      );
    }

    console.log('[Biblia] Parsed', verses.length, 'verses');
    
    return {
      book,
      chapter,
      verses,
      copyright: this.getCopyright(translationId),
    };
  }

  async getVerse(translationId: string, ref: VerseRef): Promise<VerseResponse> {
    const bibliaBook = toBibliaBook(ref.book);
    const passage = `${bibliaBook}${ref.chapter}:${ref.verse}`;
    
    const response = await this.fetch<{ text: string }>('/content/' + translationId + '.txt', {
      passage,
    });

    const { text, html } = parseVerseText(response.text);
    
    return {
      book: ref.book,
      chapter: ref.chapter,
      verse: ref.verse,
      text,
      html,
    };
  }

  async getVerseRange(translationId: string, startRef: VerseRef, endRef: VerseRef): Promise<VerseResponse[]> {
    const bibliaBook = toBibliaBook(startRef.book);
    const passage = `${bibliaBook}${startRef.chapter}:${startRef.verse}-${endRef.verse}`;
    
    const response = await this.fetch<{ text: string }>('/content/' + translationId + '.txt', {
      passage,
      style: 'oneVersePerLineFullReference',
    });

    const lines = response.text.split('\n').filter(line => line.trim());
    const verses: VerseResponse[] = [];
    
    for (const line of lines) {
      const match = line.match(/^.+?\s+\d+:(\d+)\s+(.+)$/);
      if (match) {
        const verseNum = parseInt(match[1], 10);
        const { text, html } = parseVerseText(match[2]);
        verses.push({
          book: startRef.book,
          chapter: startRef.chapter,
          verse: verseNum,
          text,
          html,
        });
      }
    }

    return verses;
  }

  async search(translationId: string, query: string, limit = 20): Promise<SearchResult[]> {
    const response = await this.fetch<{
      results: Array<{
        title: string;
        preview: string;
      }>;
    }>('/search/' + translationId, {
      query,
      limit: limit.toString(),
    });

    return response.results.map(result => {
      // Parse title like "Genesis 1:1"
      const match = result.title.match(/^(.+?)\s+(\d+):(\d+)$/);
      if (!match) {
        return null;
      }
      
      return {
        ref: {
          book: match[1],
          chapter: parseInt(match[2], 10),
          verse: parseInt(match[3], 10),
        },
        text: result.preview.replace(/<[^>]+>/g, ''),
        preview: result.preview,
        translation: translationId,
      };
    }).filter((r): r is SearchResult => r !== null);
  }

  /**
   * Check if a Bible translation is available with the current API key
   * @param bibleId The Bible ID to check (e.g., 'NASB', 'KJV', 'LEB')
   * @returns true if available, false otherwise
   */
  async isBibleAvailable(bibleId: string): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      // Use the /find endpoint to check if a specific Bible is available
      const response = await this.fetch<{ bibles: Array<{ bible: string }> }>(`/find/${bibleId}.json`);
      const isAvailable = response && response.bibles && Array.isArray(response.bibles) && response.bibles.length > 0;
      console.log(`[Biblia] Bible "${bibleId}" is ${isAvailable ? 'available' : 'not available'} with your API key`);
      return isAvailable;
    } catch (error) {
      console.warn(`[Biblia] Error checking availability for "${bibleId}":`, error);
      return false;
    }
  }

  /**
   * Get all available Bible translations for the current API key
   * @returns Array of Bible IDs that are available
   */
  async getAvailableBibleIds(): Promise<string[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const response = await this.fetch<{ bibles: Array<{ bible: string }> }>('/find.json');
      if (response && response.bibles && Array.isArray(response.bibles)) {
        const bibleIds = response.bibles.map(b => b.bible);
        console.log('[Biblia] Available Bible IDs:', bibleIds);
        return bibleIds;
      }
      return [];
    } catch (error) {
      console.warn('[Biblia] Error fetching available Bible IDs:', error);
      return [];
    }
  }

  private getCopyright(translationId: string): string {
    // Handle both old format (eng-NASB) and new format (NASB)
    const normalizedId = translationId.startsWith('eng-') 
      ? translationId.substring(4) 
      : translationId;
    
    const copyrights: Record<string, string> = {
      'NASB': '© The Lockman Foundation',
      'ESV': '© Crossway',
      'NKJV': '© Thomas Nelson',
      'NIV': '© Biblica',
    };
    return copyrights[normalizedId.toUpperCase()] || '';
  }
}

export const bibliaClient = new BibliaClient();
