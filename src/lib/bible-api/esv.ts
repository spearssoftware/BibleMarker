/**
 * ESV API Client
 *
 * Client for Crossway's ESV API which provides access to the
 * English Standard Version translation.
 *
 * API Documentation: https://api.esv.org/docs/
 * Free for personal use with attribution.
 *
 * ESV API compliance: rate limits (60/min, 1000/hr, 5000/day),
 * verse limits (500 or half book per query), and attribution.
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
import { getBookById, getVerseCount, getBookVerseCount, countVersesInRange } from '@/types/bible';
import { db } from '@/lib/db';

const ESV_BASE_URL = 'https://api.esv.org/v3/passage';

/** ESV API limits (https://api.esv.org/) */
const ESV_MAX_VERSES = 500;
const ESV_REQUESTS_PER_MINUTE = 60;
const ESV_REQUESTS_PER_HOUR = 1000;
const ESV_REQUESTS_PER_DAY = 5000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Full ESV copyright for display (ESV API compliance). */
export const ESV_COPYRIGHT =
  'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers.';

/** Map OSIS book IDs to ESV format */
function toEsvBook(osisId: string): string {
  const bookInfo = getBookById(osisId);
  return bookInfo?.name || osisId;
}

/** Parse ESV verse text */
function parseVerseText(text: string): { text: string; html: string } {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  return { text: cleanText, html: cleanText };
}

/** Throws if verse count exceeds ESV limits: 500 or half of book, whichever is less. */
function validateEsvVerseCount(verseCount: number, book: string, context: string): void {
  const halfBook = Math.floor(getBookVerseCount(book) / 2);
  const limit = Math.min(ESV_MAX_VERSES, halfBook);
  if (verseCount > limit) {
    throw new BibleApiError(
      `ESV API limit: ${context} has ${verseCount} verses. Maximum per request is ${limit} (500 verses or half of ${getBookById(book)?.name || book}, whichever is less).`,
      'esv',
      400
    );
  }
}

/** Load, prune, and check ESV rate limits. Throws BibleApiError 429 if over. */
async function checkEsvRateLimit(): Promise<void> {
  const row = await db.esvRateLimit.get('esv');
  let timestamps: number[] = row?.requestTimestamps ?? [];
  const now = Date.now();
  timestamps = timestamps.filter((t) => now - t < MS_PER_DAY);
  const inLastMin = timestamps.filter((t) => now - t < MS_PER_MINUTE).length;
  const inLastHour = timestamps.filter((t) => now - t < MS_PER_HOUR).length;
  if (inLastMin >= ESV_REQUESTS_PER_MINUTE) {
    throw new BibleApiError(
      'ESV API rate limit: maximum 60 requests per minute. Please wait a moment before requesting more text.',
      'esv',
      429
    );
  }
  if (inLastHour >= ESV_REQUESTS_PER_HOUR) {
    throw new BibleApiError(
      'ESV API rate limit: maximum 1,000 requests per hour. Please try again later.',
      'esv',
      429
    );
  }
  if (timestamps.length >= ESV_REQUESTS_PER_DAY) {
    throw new BibleApiError(
      'ESV API rate limit: maximum 5,000 requests per day. Please try again tomorrow.',
      'esv',
      429
    );
  }
}

/** Append a request timestamp after a successful ESV API call. */
async function recordEsvRequest(): Promise<void> {
  const row = await db.esvRateLimit.get('esv');
  const now = Date.now();
  let timestamps: number[] = row?.requestTimestamps ?? [];
  timestamps = timestamps.filter((t) => now - t < MS_PER_DAY);
  timestamps.push(now);
  await db.esvRateLimit.put({ id: 'esv', requestTimestamps: timestamps });
}

export class EsvClient implements BibleApiClient {
  readonly provider: BibleApiProvider = 'esv';
  private apiKey: string | null = null;
  private baseUrl = ESV_BASE_URL;

  isConfigured(): boolean {
    // ESV should always be available in the list, even if API key isn't set yet
    // The API key check happens when actually fetching data
    return true;
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
    if (!this.apiKey || this.apiKey.length === 0) {
      throw new BibleApiError('ESV API key not configured. Please configure your ESV API key in settings.', 'esv', 401);
    }

    await checkEsvRateLimit();

    const url = new URL(`${this.baseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Token ${this.apiKey}` },
      });

      if (!response.ok) {
        throw new BibleApiError(`ESV API error: ${response.statusText}`, 'esv', response.status);
      }

      const data = await response.json();
      await recordEsvRequest();
      return data;
    } catch (error) {
      if (error instanceof BibleApiError) throw error;
      throw new BibleApiError('Failed to fetch from ESV API', 'esv', undefined, error as Error);
    }
  }

  async getTranslations(): Promise<ApiTranslation[]> {
    // ESV API only provides ESV
    return [
      {
        id: 'ESV',
        name: 'English Standard Version',
        abbreviation: 'ESV',
        language: 'en',
        provider: 'esv',
        description: 'English Standard Version (2016 text)',
        copyright: 'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers.',
      },
    ];
  }

  async getChapter(_translationId: string, book: string, chapter: number): Promise<ChapterResponse> {
    const verseCount = getVerseCount(book, chapter);
    validateEsvVerseCount(verseCount, book, `${getBookById(book)?.name || book} ${chapter}`);

    const esvBook = toEsvBook(book);
    const passage = `${esvBook} ${chapter}`;

    const response = await this.fetch<{
      passages: string[];
      passage_meta: Array<{
        canonical: string;
        chapter_start: [number, number];
        chapter_end: [number, number];
      }>;
      parsed: Array<[number, number, number, number]>;
    }>('/text/', {
      q: passage,
      'include-passage-references': 'false',
      'include-verse-numbers': 'true',
      'include-first-verse-numbers': 'true',
      'include-footnotes': 'false',
      'include-headings': 'false',
      'include-short-copyright': 'false',
      'include-passage-horizontal-lines': 'false',
      'include-heading-horizontal-lines': 'false',
      'horizontal-line-length': '0',
      'include-selahs': 'true',
      'indent-paragraphs': '0',
      'indent-poetry': 'false',
      'indent-poetry-lines': '0',
      'indent-declares': '0',
      'indent-psalm-doxology': '0',
      'line-length': '0',
    });

    // Parse the passage text to extract individual verses
    const fullText = response.passages[0] || '';
    const verses: VerseResponse[] = [];
    
    // ESV format with verse numbers: [1] In the beginning... [2] The earth was...
    const versePattern = /\[(\d+)\]\s*([^[]+)/g;
    let match;
    
    while ((match = versePattern.exec(fullText)) !== null) {
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

    return {
      book,
      chapter,
      verses,
      copyright: ESV_COPYRIGHT,
    };
  }

  async getVerse(_translationId: string, ref: VerseRef): Promise<VerseResponse> {
    const esvBook = toEsvBook(ref.book);
    const passage = `${esvBook} ${ref.chapter}:${ref.verse}`;
    
    const response = await this.fetch<{
      passages: string[];
    }>('/text/', {
      q: passage,
      'include-passage-references': 'false',
      'include-verse-numbers': 'false',
      'include-footnotes': 'false',
      'include-headings': 'false',
      'include-short-copyright': 'false',
    });

    const { text, html } = parseVerseText(response.passages[0] || '');
    
    return {
      book: ref.book,
      chapter: ref.chapter,
      verse: ref.verse,
      text,
      html,
    };
  }

  async getVerseRange(_translationId: string, startRef: VerseRef, endRef: VerseRef): Promise<VerseResponse[]> {
    const count = countVersesInRange(startRef, endRef);
    validateEsvVerseCount(count, startRef.book, `${getBookById(startRef.book)?.name || startRef.book} ${startRef.chapter}:${startRef.verse}-${endRef.chapter}:${endRef.verse}`);

    const esvBook = toEsvBook(startRef.book);
    const passage = `${esvBook} ${startRef.chapter}:${startRef.verse}-${endRef.verse}`;

    const response = await this.fetch<{
      passages: string[];
    }>('/text/', {
      q: passage,
      'include-passage-references': 'false',
      'include-verse-numbers': 'true',
      'include-first-verse-numbers': 'true',
      'include-footnotes': 'false',
      'include-headings': 'false',
      'include-short-copyright': 'false',
    });

    const fullText = response.passages[0] || '';
    const verses: VerseResponse[] = [];
    
    const versePattern = /\[(\d+)\]\s*([^[]+)/g;
    let match;
    
    while ((match = versePattern.exec(fullText)) !== null) {
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

    return verses;
  }

  async search(_translationId: string, query: string, limit = 20): Promise<SearchResult[]> {
    const response = await this.fetch<{
      results: Array<{
        reference: string;
        content: string;
      }>;
    }>('/search/', {
      q: query,
      'page-size': limit.toString(),
    });

    return response.results.map(result => {
      // Parse reference like "Genesis 1:1"
      const match = result.reference.match(/^(.+?)\s+(\d+):(\d+)$/);
      if (!match) {
        return null;
      }
      
      const bookInfo = getBookById(match[1]);
      const bookId = bookInfo?.id || match[1];
      
      return {
        ref: {
          book: bookId,
          chapter: parseInt(match[2], 10),
          verse: parseInt(match[3], 10),
        },
        text: result.content,
        preview: result.content,
        translation: 'ESV',
      };
    }).filter((r): r is SearchResult => r !== null);
  }
}

export const esvClient = new EsvClient();
