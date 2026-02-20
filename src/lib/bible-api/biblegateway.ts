/**
 * BibleGateway API Client
 *
 * Client for Bible Gateway's API which provides access to NASB, NIV, ESV,
 * and many other translations. Requires BibleGateway account credentials.
 *
 * API Documentation: https://www.biblegateway.com/api/documentation
 * Base URL: https://api.biblegateway.com/2/
 *
 * AUTHORIZATION (per API docs):
 * - GET /request_access_token?username=[user]&password=[password]
 *   → returns { access_token, expiration } (expiration = unix seconds since epoch)
 * - On expired/invalid token: {"error":{"errcode":4,"errmsg":"Invalid access_token"}}
 * - Pass access_token on every other request as a query param, e.g.:
 *   /bible/niv?access_token=token
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
import type { VerseRef } from '@/types';
import { getBookById, BIBLE_BOOKS } from '@/types';
import { sqlSelect, sqlExecute } from '@/lib/database';

const BIBLEGATEWAY_BASE_URL = import.meta.env.DEV
  ? '/api/biblegateway/2'
  : 'https://api.biblegateway.com/2';

/** Map OSIS book IDs to BibleGateway/OSIS reference format (e.g., "Matt 5", "1Cor 13") */
function toOsisRef(osisBook: string, chapter: number, verse?: number): string {
  if (verse !== undefined) {
    return `${osisBook} ${chapter}:${verse}`;
  }
  return `${osisBook} ${chapter}`;
}

/** Parse HTML content from BibleGateway into individual verses */
function parseChapterHtml(html: string, book: string, chapter: number): VerseResponse[] {
  const stripTags = (s: string) =>
    s
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

  const plain = stripTags(html);
  const verseNumRe = /(?:^|\.\s+)(\d{1,3})\s+([\s\S]*?)(?=\s\d{1,3}\s+|$)/g;
  const collected: { verse: number; text: string }[] = [];
  let match;

  while ((match = verseNumRe.exec(plain)) !== null) {
    const v = parseInt(match[1], 10);
    const t = (match[2] || '').trim();
    if (v >= 1 && t) collected.push({ verse: v, text: t });
  }

  if (collected.length > 0) {
    return collected.map(({ verse, text }) => ({
      book,
      chapter,
      verse,
      text,
      html: text,
    }));
  }

  const parts = html.split(/(?:<[^>]*>\s*)?(\d{1,3})\s+(?=[^<])/i);
  const verses: VerseResponse[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const v = parseInt(parts[i], 10);
    const raw = (parts[i + 1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (v >= 1 && raw) verses.push({ book, chapter, verse: v, text: raw, html: raw });
  }
  if (verses.length > 0) return verses;

  const single = stripTags(html);
  if (single) return [{ book, chapter, verse: 1, text: single, html: single }];
  return [];
}

const TRANSLATION_NAMES: Record<string, string> = {
  NASB: 'New American Standard Bible',
  NASB1995: 'New American Standard Bible 1995',
  NIV: 'New International Version',
  ESV: 'English Standard Version',
  KJV: 'King James Version',
  NKJV: 'New King James Version',
  NLT: 'New Living Translation',
  CSB: 'Christian Standard Bible',
  AMP: 'Amplified Bible',
  LSB: 'Legacy Standard Bible',
};

function parseTranslationList(list: string[]): ApiTranslation[] {
  return list
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => {
      const abbr = id.trim();
      const name = TRANSLATION_NAMES[abbr.toUpperCase()] || abbr;
      return { id: abbr, name, abbreviation: abbr, language: 'en', provider: 'biblegateway', description: name };
    });
}

export class BibleGatewayClient implements BibleApiClient {
  readonly provider: BibleApiProvider = 'biblegateway';
  private username: string | null = null;
  private password: string | null = null;
  private baseUrl = BIBLEGATEWAY_BASE_URL;
  private accessToken: string | null = null;
  private tokenExpiration = 0;
  /** Deduplicate: only one request_access_token in flight so we don't get throttled (error 14) */
  private _tokenPromise: Promise<string> | null = null;
  /** After auth errors (e.g. "user does not exist"), stop calling the API for 15 min to avoid noise/throttle */
  private _authFailureUntil = 0;
  private _authFailureMessage = '';

  isConfigured(): boolean {
    return !!(this.username && this.password);
  }

  configure(config: ApiConfig): void {
    this.username = config.username ?? null;
    this.password = config.password ?? null;
    if (config.baseUrl) this.baseUrl = config.baseUrl;
    this.accessToken = null;
    this.tokenExpiration = 0;
    this._tokenPromise = null;
    this._authFailureUntil = 0;
    this._authFailureMessage = '';
  }

  /** GET /request_access_token?username=...&password=... → { access_token, expiration } */
  private async ensureToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.tokenExpiration > now + 60) return this.accessToken;
    if (!this.username || !this.password) {
      throw new BibleApiError('BibleGateway username and password not configured', 'biblegateway', 401);
    }
    if (Date.now() < this._authFailureUntil) {
      throw new BibleApiError(
        this._authFailureMessage || 'BibleGateway authentication failed. Check your username and password in Module Manager. Will retry after 15 minutes.',
        'biblegateway',
        401
      );
    }
    if (this._tokenPromise) return this._tokenPromise;
    this._tokenPromise = this.doRequestAccessToken(now);
    try {
      return await this._tokenPromise;
    } finally {
      this._tokenPromise = null;
    }
  }

  private async doRequestAccessToken(now: number): Promise<string> {
    const url = `${this.baseUrl}/request_access_token?username=${encodeURIComponent(this.username!)}&password=${encodeURIComponent(this.password!)}`;
    const res = await fetch(url);
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
    } catch {
      console.warn('[BibleGateway] request_access_token: response was not JSON. Status:', res.status, 'Body (first 300):', text.slice(0, 300));
      const m = `BibleGateway auth failed (HTTP ${res.status}): response was not JSON. Check that the API is reachable.`;
      this._authFailureUntil = Date.now() + 15 * 60 * 1000;
      this._authFailureMessage = m;
      throw new BibleApiError(m, 'biblegateway', res.status);
    }
    if (!res.ok) {
      console.warn('[BibleGateway] request_access_token HTTP error:', res.status, data);
    }
    const token = data.access_token ?? data.accessToken ?? data.token ?? data.auth_token;
    const exp = data.expiration ?? data.expires ?? data.expires_at;
    if (token && typeof token === 'string') {
      this.accessToken = token;
      this.tokenExpiration = typeof exp === 'number' ? exp : now + 3600;
      return this.accessToken;
    }
    // { error: 14, error_message: 'too many attempts' } — throttle
    const errNum = data.error;
    const errMsg = data.error_message;
    if (typeof errNum === 'number' && (typeof errMsg === 'string' || errMsg === undefined)) {
      const msg = errNum === 14
        ? 'Too many attempts. Please wait a few minutes before trying again.'
        : (typeof errMsg === 'string' && errMsg ? errMsg : `BibleGateway error ${errNum}`);
      this._authFailureUntil = Date.now() + 15 * 60 * 1000;
      this._authFailureMessage = msg;
      throw new BibleApiError(msg, 'biblegateway', errNum);
    }
    // { error: { errcode, errmsg } } — object shape
    const err = data.error;
    if (err && typeof err === 'object' && err !== null) {
      const errcode = 'errcode' in err ? (err as { errcode?: number }).errcode : undefined;
      if (errcode === 200) {
        const m = 'BibleGateway did not return an access token. Check your username and password.';
        this._authFailureUntil = Date.now() + 15 * 60 * 1000;
        this._authFailureMessage = m;
        throw new BibleApiError(m, 'biblegateway', 401);
      }
      const errmsg = 'errmsg' in err ? (err as { errmsg?: string }).errmsg : typeof err === 'string' ? err : '';
      const m2 = errmsg || 'BibleGateway authentication failed';
      this._authFailureUntil = Date.now() + 15 * 60 * 1000;
      this._authFailureMessage = m2;
      throw new BibleApiError(m2, 'biblegateway', errcode ?? res.status);
    }
    // { error: "string" } or { error_message: "..." } without numeric error
    const msg =
      (typeof data.error_message === 'string' && data.error_message) ||
      (typeof data.error === 'string' && data.error) ||
      'BibleGateway did not return an access token. Check your username and password.';
    console.warn('[BibleGateway] request_access_token:', res.status, data);
    this._authFailureUntil = Date.now() + 15 * 60 * 1000;
    this._authFailureMessage = msg;
    throw new BibleApiError(msg, 'biblegateway', 401);
  }

  /** All API requests: add access_token as query param (e.g. /bible/niv?access_token=token) */
  private async fetchApi<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const token = await this.ensureToken();
    const href = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const url = href.startsWith('http') ? new URL(href) : new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    url.searchParams.set('access_token', token);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString());
    const data = (await res.json().catch(() => ({}))) as T & Record<string, unknown>;
    const errVal = data.error;
    if (errVal !== undefined && errVal !== null) {
      if (typeof errVal === 'number') {
        const msg = (data.error_message as string) || (errVal === 14 ? 'Too many attempts. Please wait a few minutes.' : `BibleGateway error ${errVal}`);
        throw new BibleApiError(msg, 'biblegateway', errVal);
      }
      if (typeof errVal === 'object') {
        const err = errVal as { errcode?: number; errmsg?: string };
        if (err.errcode === 4) {
          this.accessToken = null;
          this.tokenExpiration = 0;
        }
        throw new BibleApiError(err.errmsg || 'BibleGateway error', 'biblegateway', err.errcode || res.status);
      }
    }
    if (!res.ok) throw new BibleApiError(`BibleGateway API error: ${res.status}`, 'biblegateway', res.status);
    return data as T;
  }

  async getTranslations(): Promise<ApiTranslation[]> {
    const CACHE_KEY = 'biblegateway-translations';
    const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

    try {
      const rows = await sqlSelect<{ translations: string; cached_at: string }>(
        `SELECT translations, cached_at FROM translation_cache WHERE id = ?`,
        [CACHE_KEY]
      );
      if (rows.length > 0) {
        const now = new Date();
        const cachedAt = rows[0].cached_at;
        const translations = JSON.parse(rows[0].translations);
        if (cachedAt && Array.isArray(translations)) {
          const age = now.getTime() - new Date(cachedAt).getTime();
          if (age < CACHE_DURATION_MS) {
            return parseTranslationList(translations as string[]);
          }
        }
      }
    } catch (e) {
      console.warn('[BibleGateway] translation cache read failed, fetching fresh:', e);
    }

    try {
      const raw = await this.fetchApi<unknown>('/bible');
      const list: string[] = Array.isArray(raw)
        ? raw
        : (raw as { bibles?: string[]; translations?: string[] })?.bibles ||
          (raw as { translations?: string[] })?.translations ||
          [];
      const parsed = parseTranslationList(list);
      const now = new Date().toISOString();
      sqlExecute(
        `INSERT OR REPLACE INTO translation_cache (id, translations, cached_at) VALUES (?, ?, ?)`,
        [CACHE_KEY, JSON.stringify(list), now]
      ).catch((e) => console.warn('[BibleGateway] failed to cache translation list:', e));
      return parsed;
    } catch (e) {
      try {
        const rows = await sqlSelect<{ translations: string }>(
          `SELECT translations FROM translation_cache WHERE id = ?`,
          [CACHE_KEY]
        );
        if (rows.length > 0) {
          const translations = JSON.parse(rows[0].translations);
          if (Array.isArray(translations)) {
            return parseTranslationList(translations as string[]);
          }
        }
      } catch {
        // ignore cache read errors
      }
      throw e;
    }
  }

  async getChapter(translationId: string, book: string, chapter: number): Promise<ChapterResponse> {
    const osis = toOsisRef(book, chapter);
    const tr = translationId.split(',')[0].trim();
    const path = `/bible/osis/${encodeURIComponent(osis)}/${encodeURIComponent(tr)}`;
    const arr = await this.fetchApi<Array<{ content?: string }>>(path);
    const item = Array.isArray(arr) ? arr[0] : arr;
    const html = (item?.content ?? '') || '';
    const verses = parseChapterHtml(html, book, chapter);
    if (verses.length === 0) {
      throw new BibleApiError(`No verses in BibleGateway response for ${book} ${chapter} (${tr})`, 'biblegateway', 404);
    }
    return { book, chapter, verses, copyright: undefined };
  }

  async getVerse(translationId: string, ref: VerseRef): Promise<VerseResponse> {
    const osis = toOsisRef(ref.book, ref.chapter, ref.verse);
    const tr = translationId.split(',')[0].trim();
    const path = `/bible/osis/${encodeURIComponent(osis)}/${encodeURIComponent(tr)}`;
    const arr = await this.fetchApi<Array<{ content?: string }>>(path);
    const item = Array.isArray(arr) ? arr[0] : arr;
    const html = (item?.content ?? '') || '';
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return { book: ref.book, chapter: ref.chapter, verse: ref.verse, text: text || '[Verse not found]', html: text };
  }

  async getVerseRange(translationId: string, startRef: VerseRef, endRef: VerseRef): Promise<VerseResponse[]> {
    const osis = `${startRef.book} ${startRef.chapter}:${startRef.verse}-${endRef.verse}`;
    const tr = translationId.split(',')[0].trim();
    const path = `/bible/osis/${encodeURIComponent(osis)}/${encodeURIComponent(tr)}`;
    const arr = await this.fetchApi<Array<{ content?: string }>>(path);
    const item = Array.isArray(arr) ? arr[0] : arr;
    const html = (item?.content ?? '') || '';
    return parseChapterHtml(html, startRef.book, startRef.chapter);
  }

  async search(translationId: string, query: string, limit = 20): Promise<SearchResult[]> {
    const tr = translationId.split(',')[0].trim();
    const path = `/bible/search/terms/${encodeURIComponent(tr)}`;
    const res = await this.fetchApi<{ data?: Array<{ title?: string; preview?: string }> }>(path, { terms: query, limit: String(limit) });
    const hits = res.data || [];
    return hits
      .map((h) => {
        const m = (h.title || '').match(/^(.+?)\s+(\d+):(\d+)$/);
        if (!m) return null;
        const bookInfo = getBookById(m[1]) || BIBLE_BOOKS.find((b) => b.name === m[1]);
        return {
          ref: { book: bookInfo?.id || m[1], chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) },
          text: (h.preview || '').replace(/<[^>]+>/g, ''),
          preview: h.preview || '',
          translation: tr,
        };
      })
      .filter((r): r is SearchResult => r !== null);
  }
}

export const bibleGatewayClient = new BibleGatewayClient();
