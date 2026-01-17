/**
 * ESV API Client
 * 
 * Client for Crossway's ESV API which provides access to the
 * English Standard Version translation.
 * 
 * API Documentation: https://api.esv.org/docs/
 * Free for personal use with attribution
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

const ESV_BASE_URL = 'https://api.esv.org/v3/passage';

/** Map OSIS book IDs to ESV format */
function toEsvBook(osisId: string): string {
  const bookInfo = getBookById(osisId);
  return bookInfo?.name || osisId;
}

/** Parse ESV verse text */
function parseVerseText(text: string): { text: string; html: string } {
  // ESV API returns clean text, minimal processing needed
  const cleanText = text
    .replace(/\s+/g, ' ')
    .trim();
  
  return { text: cleanText, html: cleanText };
}

export class EsvClient implements BibleApiClient {
  readonly provider: BibleApiProvider = 'esv';
  private apiKey: string | null = null;
  private baseUrl = ESV_BASE_URL;

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
      throw new BibleApiError('ESV API key not configured', 'esv');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Token ${this.apiKey}`,
        },
      });
      
      if (!response.ok) {
        throw new BibleApiError(
          `ESV API error: ${response.statusText}`,
          'esv',
          response.status
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof BibleApiError) throw error;
      throw new BibleApiError(
        'Failed to fetch from ESV API',
        'esv',
        undefined,
        error as Error
      );
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

  async getChapter(translationId: string, book: string, chapter: number): Promise<ChapterResponse> {
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
      copyright: 'ESV® Bible © 2001 Crossway',
    };
  }

  async getVerse(translationId: string, ref: VerseRef): Promise<VerseResponse> {
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

  async getVerseRange(translationId: string, startRef: VerseRef, endRef: VerseRef): Promise<VerseResponse[]> {
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

  async search(translationId: string, query: string, limit = 20): Promise<SearchResult[]> {
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
