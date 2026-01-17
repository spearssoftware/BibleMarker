/**
 * Biblia API Client
 * 
 * Client for Faithlife's Biblia API which provides access to
 * NASB, ESV, and many other translations.
 * 
 * API Documentation: https://api.biblia.com/docs/
 * Free tier: 5,000 calls/day
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
import type { VerseRef } from '@/types/sword';
import { getBookById } from '@/types/bible';

const BIBLIA_BASE_URL = 'https://api.biblia.com/v1/bible';

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

    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('key', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new BibleApiError(
          `Biblia API error: ${response.statusText}`,
          'biblia',
          response.status
        );
      }

      return await response.json();
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
    // Biblia has many translations, but we focus on the main ones
    // For a full list, you'd call /v1/bible/find
    const mainTranslations: ApiTranslation[] = [
      {
        id: 'eng-NASB',
        name: 'New American Standard Bible',
        abbreviation: 'NASB',
        language: 'en',
        provider: 'biblia',
        description: 'New American Standard Bible (1995 Update)',
        copyright: '© The Lockman Foundation',
      },
      {
        id: 'eng-ESV',
        name: 'English Standard Version',
        abbreviation: 'ESV',
        language: 'en',
        provider: 'biblia',
        description: 'English Standard Version',
        copyright: '© Crossway',
      },
      {
        id: 'eng-KJV',
        name: 'King James Version',
        abbreviation: 'KJV',
        language: 'en',
        provider: 'biblia',
        description: 'King James Version (1769)',
      },
      {
        id: 'eng-NKJV',
        name: 'New King James Version',
        abbreviation: 'NKJV',
        language: 'en',
        provider: 'biblia',
        description: 'New King James Version',
        copyright: '© Thomas Nelson',
      },
      {
        id: 'eng-NIV',
        name: 'New International Version',
        abbreviation: 'NIV',
        language: 'en',
        provider: 'biblia',
        description: 'New International Version',
        copyright: '© Biblica',
      },
    ];

    return mainTranslations;
  }

  async getChapter(translationId: string, book: string, chapter: number): Promise<ChapterResponse> {
    const bibliaBook = toBibliaBook(book);
    const passage = `${bibliaBook}${chapter}`;
    
    // Fetch the entire chapter as HTML with verse markers
    const response = await this.fetch<{ text: string }>('/content/' + translationId + '.txt', {
      passage,
      style: 'oneVersePerLineFullReference',
    });

    // Parse the response into individual verses
    // Biblia returns one verse per line in this format: "BookName Chapter:Verse Text"
    const lines = response.text.split('\n').filter(line => line.trim());
    const verses: VerseResponse[] = [];
    
    for (const line of lines) {
      // Parse line format: "Genesis 1:1 In the beginning..."
      const match = line.match(/^.+?\s+\d+:(\d+)\s+(.+)$/);
      if (match) {
        const verseNum = parseInt(match[1], 10);
        const { text, html } = parseVerseText(match[2]);
        verses.push({
          book,
          chapter,
          verse: verseNum,
          text,
          html,
        });
      }
    }

    // Get copyright info
    const bookInfo = getBookById(book);
    
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

  private getCopyright(translationId: string): string {
    const copyrights: Record<string, string> = {
      'eng-NASB': '© The Lockman Foundation',
      'eng-ESV': '© Crossway',
      'eng-NKJV': '© Thomas Nelson',
      'eng-NIV': '© Biblica',
    };
    return copyrights[translationId] || '';
  }
}

export const bibliaClient = new BibliaClient();
