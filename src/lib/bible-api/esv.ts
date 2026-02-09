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
import { getEsvRateLimitState, saveEsvRateLimitState } from '@/lib/database';

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

/** Parse ESV verse text - exported for use in cache normalization */
export function parseVerseText(text: string): { text: string; html: string } {
  // Remove HTML tags for plain text (ESV API may return HTML even from text endpoint)
  const plainText = text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  
  // Keep original HTML for display (or use plain text if no HTML tags were present)
  const html = text.includes('<') ? text : plainText;
  
  return { text: plainText, html };
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
  const state = await getEsvRateLimitState();
  let timestamps: number[] = state.requestTimestamps ?? [];
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
  const state = await getEsvRateLimitState();
  const now = Date.now();
  let timestamps: number[] = state.requestTimestamps ?? [];
  timestamps = timestamps.filter((t) => now - t < MS_PER_DAY);
  timestamps.push(now);
  await saveEsvRateLimitState(timestamps);
}

export class EsvClient implements BibleApiClient {
  readonly provider: BibleApiProvider = 'esv';
  private apiKey: string | null = null;
  private baseUrl = ESV_BASE_URL;

  isConfigured(): boolean {
    // Check if API key is actually set
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  configure(config: ApiConfig): void {
    if (config.apiKey && config.apiKey.trim().length > 0) {
      this.apiKey = config.apiKey.trim();
    } else {
      this.apiKey = null;
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
    
    // Debug: Log ESV parsing for Jeremiah 29 when debug flags are enabled
    // Note: We can't check debug flags here since this is in the API layer
    // This will only log if called from a context where debug is enabled
    const isESVDebug = book === 'Jer' && chapter === 29;
    if (isESVDebug && typeof window !== 'undefined' && (window as Window & { __ESV_DEBUG__?: boolean }).__ESV_DEBUG__) {
      console.log(`%c[ESV DEBUG] ========== Parsing ${book} ${chapter} ==========`, 'color: green; font-weight: bold; font-size: 16px;');
      console.log(`[ESV DEBUG] Full text length: ${fullText.length}`);
      console.log(`[ESV DEBUG] First 500 chars:`, fullText.substring(0, 500));
    }
    
    // ESV format with verse numbers: [1] In the beginning... [2] The earth was...
    // Use a more reliable approach: split by verse markers and process each segment
    // Find all verse markers first
    const verseMarkerPattern = /\[(\d+)\]/g;
    const markers: Array<{ verseNum: number; index: number }> = [];
    let markerMatch;
    
    // Reset regex lastIndex to ensure we start from the beginning
    verseMarkerPattern.lastIndex = 0;
    while ((markerMatch = verseMarkerPattern.exec(fullText)) !== null) {
      markers.push({
        verseNum: parseInt(markerMatch[1], 10),
        index: markerMatch.index
      });
    }
    
    if (isESVDebug) {
      console.log(`[ESV] Found ${markers.length} verse markers:`, markers.slice(0, 10).map(m => `[${m.verseNum}]@${m.index}`));
    }
    
    // Extract verse text between markers
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      // Calculate marker length: [verseNum] format, e.g., [1] = 3 chars, [10] = 4 chars, [100] = 5 chars
      const markerLength = `[${marker.verseNum}]`.length;
      const startIndex = marker.index + markerLength; // Start after the marker
      const endIndex = i < markers.length - 1 ? markers[i + 1].index : fullText.length;
      const verseText = fullText.substring(startIndex, endIndex).trim();
      
      // Only process if we have actual text content
      if (verseText) {
        const { text, html } = parseVerseText(verseText);
        // Only add if text is not empty after parsing
        if (text) {
          if (isESVDebug && (marker.verseNum === 1 || marker.verseNum === 15)) {
            console.log(`[ESV] Verse ${marker.verseNum}:`, {
              rawText: verseText.substring(0, 100),
              parsedText: text.substring(0, 100),
              textLength: text.length
            });
          }
          verses.push({
            book,
            chapter,
            verse: marker.verseNum,
            text,
            html,
          });
        } else if (isESVDebug && (marker.verseNum === 1 || marker.verseNum === 15)) {
          console.warn(`[ESV] Verse ${marker.verseNum} parsed to empty text!`, {
            rawText: verseText.substring(0, 100)
          });
        }
      } else if (isESVDebug && (marker.verseNum === 1 || marker.verseNum === 15)) {
        console.warn(`[ESV] Verse ${marker.verseNum} has no text content!`, {
          startIndex,
          endIndex,
          fullTextSample: fullText.substring(marker.index, Math.min(marker.index + 200, fullText.length))
        });
      }
    }
    
    // Sort verses by verse number to ensure correct order
    verses.sort((a, b) => a.verse - b.verse);
    
    if (isESVDebug) {
      console.log(`[ESV] Extracted ${verses.length} verses. Verse 1 text:`, verses.find(v => v.verse === 1)?.text?.substring(0, 100));
      console.log(`[ESV] Verse 15 text:`, verses.find(v => v.verse === 15)?.text?.substring(0, 100));
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
    
    // Use the same robust approach as getChapter
    // Find all verse markers first
    const verseMarkerPattern = /\[(\d+)\]/g;
    const markers: Array<{ verseNum: number; index: number }> = [];
    let markerMatch;
    
    // Reset regex lastIndex to ensure we start from the beginning
    verseMarkerPattern.lastIndex = 0;
    while ((markerMatch = verseMarkerPattern.exec(fullText)) !== null) {
      markers.push({
        verseNum: parseInt(markerMatch[1], 10),
        index: markerMatch.index
      });
    }
    
    // Extract verse text between markers
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      // Calculate marker length: [verseNum] format, e.g., [1] = 3 chars, [10] = 4 chars, [100] = 5 chars
      const markerLength = `[${marker.verseNum}]`.length;
      const startIndex = marker.index + markerLength; // Start after the marker
      const endIndex = i < markers.length - 1 ? markers[i + 1].index : fullText.length;
      const verseText = fullText.substring(startIndex, endIndex).trim();
      
      // Only process if we have actual text content
      if (verseText) {
        const { text, html } = parseVerseText(verseText);
        // Only add if text is not empty after parsing
        if (text) {
          verses.push({
            book: startRef.book,
            chapter: startRef.chapter,
            verse: marker.verseNum,
            text,
            html,
          });
        }
      }
    }
    
    // Sort verses by verse number to ensure correct order
    verses.sort((a, b) => a.verse - b.verse);

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
