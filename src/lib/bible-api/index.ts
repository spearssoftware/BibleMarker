/**
 * Bible API Module
 * 
 * Unified interface for fetching Bible text from multiple providers:
 * - Biblia API (NASB, ESV, NIV, etc.)
 * - ESV API (ESV only, generous limits)
 * - SWORD modules (fallback for public domain translations)
 */

import type {
  BibleApiProvider,
  ApiConfig,
  ApiTranslation,
  ChapterResponse,
  VerseResponse,
  SearchResult,
  BibleApiClient,
} from './types';
import { BibleApiError } from './types';
import { bibliaClient } from './biblia';
import { esvClient } from './esv';
import type { VerseRef, Chapter } from '@/types/sword';
import { db } from '@/lib/db';

// Re-export types
export * from './types';
export { bibliaClient } from './biblia';
export { esvClient } from './esv';

/** All available API clients */
const clients: Record<BibleApiProvider, BibleApiClient | null> = {
  biblia: bibliaClient,
  esv: esvClient,
  sword: null, // SWORD is handled separately through moduleReader
};

/** Get a specific API client */
export function getClient(provider: BibleApiProvider): BibleApiClient | null {
  return clients[provider];
}

/** Configure an API client */
export function configureApi(provider: BibleApiProvider, config: ApiConfig): void {
  const client = clients[provider];
  if (client) {
    client.configure(config);
  }
}

/** Check if an API is configured and ready */
export function isApiConfigured(provider: BibleApiProvider): boolean {
  const client = clients[provider];
  return client?.isConfigured() ?? false;
}

/** Get all available translations from all configured APIs */
export async function getAllTranslations(): Promise<ApiTranslation[]> {
  const translations: ApiTranslation[] = [];
  
  for (const [provider, client] of Object.entries(clients)) {
    if (client && client.isConfigured()) {
      try {
        const providerTranslations = await client.getTranslations();
        translations.push(...providerTranslations);
      } catch (error) {
        console.warn(`Failed to get translations from ${provider}:`, error);
      }
    }
  }
  
  return translations;
}

/**
 * Fetch a chapter from the appropriate source
 * 
 * Priority:
 * 1. Check IndexedDB cache
 * 2. Try API if translation is from an API
 * 3. Fall back to SWORD module
 */
export async function fetchChapter(
  translationId: string,
  book: string,
  chapter: number
): Promise<Chapter> {
  // Check cache first
  const cacheKey = `${translationId}:${book}:${chapter}`;
  const cached = await db.chapterCache.get(cacheKey);
  
  if (cached) {
    return {
      book,
      chapter,
      verses: Object.entries(cached.verses).map(([num, text]) => ({
        ref: { book, chapter, verse: parseInt(num, 10) },
        text: text as string,
        html: text as string,
      })),
    };
  }

  // Determine which API to use based on translation ID
  let chapterData: ChapterResponse | null = null;
  
  // Check if it's a Biblia translation
  if (translationId.startsWith('eng-') || ['NASB', 'NIV', 'NKJV'].includes(translationId)) {
    if (bibliaClient.isConfigured()) {
      try {
        chapterData = await bibliaClient.getChapter(translationId, book, chapter);
      } catch (error) {
        console.warn('Biblia API failed, trying other sources:', error);
      }
    }
  }
  
  // Check if it's ESV
  if (!chapterData && translationId === 'ESV') {
    if (esvClient.isConfigured()) {
      try {
        chapterData = await esvClient.getChapter(translationId, book, chapter);
      } catch (error) {
        console.warn('ESV API failed:', error);
      }
    }
  }

  if (chapterData) {
    // Cache the result
    await db.chapterCache.put({
      id: cacheKey,
      moduleId: translationId,
      book,
      chapter,
      verses: Object.fromEntries(
        chapterData.verses.map(v => [v.verse.toString(), v.text])
      ),
      cachedAt: new Date(),
    });

    return {
      book,
      chapter,
      verses: chapterData.verses.map(v => ({
        ref: { book, chapter, verse: v.verse },
        text: v.text,
        html: v.html || v.text,
      })),
    };
  }

  // No API data available - let caller handle SWORD fallback
  throw new BibleApiError(
    `No API configured for translation: ${translationId}`,
    'sword'
  );
}

/**
 * Search across Bible text
 */
export async function searchBible(
  translationId: string,
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  // Determine which API to use
  if (translationId.startsWith('eng-') || ['NASB', 'NIV', 'NKJV'].includes(translationId)) {
    if (bibliaClient.isConfigured()) {
      return bibliaClient.search(translationId, query, limit);
    }
  }
  
  if (translationId === 'ESV') {
    if (esvClient.isConfigured()) {
      return esvClient.search(translationId, query, limit);
    }
  }

  // No search available
  return [];
}

/**
 * Load API configurations from database
 */
export async function loadApiConfigs(): Promise<void> {
  try {
    const prefs = await db.preferences.get('main');
    if (prefs?.apiConfigs) {
      for (const config of prefs.apiConfigs) {
        configureApi(config.provider, config);
      }
    }
  } catch (error) {
    console.warn('Failed to load API configs:', error);
  }
}

/**
 * Save API configuration to database
 */
export async function saveApiConfig(config: ApiConfig): Promise<void> {
  const prefs = await db.preferences.get('main');
  if (!prefs) return;

  const existingConfigs = prefs.apiConfigs || [];
  const updatedConfigs = existingConfigs.filter(c => c.provider !== config.provider);
  updatedConfigs.push(config);

  await db.preferences.update('main', {
    apiConfigs: updatedConfigs,
  });

  // Apply the config immediately
  configureApi(config.provider, config);
}

/**
 * Get API configuration from database
 */
export async function getApiConfig(provider: BibleApiProvider): Promise<ApiConfig | null> {
  const prefs = await db.preferences.get('main');
  if (!prefs?.apiConfigs) return null;
  return prefs.apiConfigs.find(c => c.provider === provider) || null;
}
