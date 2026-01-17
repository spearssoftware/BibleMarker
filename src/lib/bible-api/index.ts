/**
 * Bible API Module
 * 
 * Unified interface for fetching Bible text from multiple providers:
 * - getBible API (free, many translations, no API key required)
 * - Biblia API (NASB, ESV, NIV, etc.)
 * - ESV API (ESV only, generous limits)
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
import { getBibleClient } from './getbible';
import type { VerseRef, Chapter } from '@/types/sword';
import { db } from '@/lib/db';

// Re-export types
export * from './types';
export { bibliaClient } from './biblia';
export { esvClient } from './esv';
export { getBibleClient } from './getbible';

/** All available API clients */
const clients: Record<BibleApiProvider, BibleApiClient | null> = {
  biblia: bibliaClient,
  esv: esvClient,
  getbible: getBibleClient,
  sword: null, // Deprecated - no longer used
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
  // Ensure getBible is configured (it's free and always available)
  if (!getBibleClient.isConfigured()) {
    getBibleClient.configure({
      provider: 'getbible',
      enabled: true,
    });
  }
  
  const translations: ApiTranslation[] = [];
  const seenIds = new Set<string>();
  
  console.log('[getAllTranslations] Starting to fetch translations from all clients');
  
  for (const [provider, client] of Object.entries(clients)) {
    if (!client) continue; // Skip null clients (like sword)
    
    const isConfigured = client.isConfigured();
    console.log(`[getAllTranslations] Checking ${provider}:`, { 
      hasClient: !!client, 
      isConfigured 
    });
    
    if (isConfigured) {
      try {
        console.log(`[getAllTranslations] Fetching translations from ${provider}...`);
        const providerTranslations = await client.getTranslations();
        console.log(`[getAllTranslations] Got ${providerTranslations.length} translations from ${provider}:`, providerTranslations.slice(0, 3));
        
        // Filter out duplicates and add provider prefix if needed
        for (const translation of providerTranslations) {
          // Skip translations without valid IDs
          if (!translation.id || typeof translation.id !== 'string' || translation.id.trim() === '') {
            console.warn(`Skipping translation without valid ID from ${provider}:`, translation);
            continue;
          }
          
          // Create unique ID by prefixing with provider if duplicate exists
          let uniqueId = translation.id.trim();
          if (seenIds.has(uniqueId)) {
            uniqueId = `${provider}-${translation.id.trim()}`;
          }
          seenIds.add(uniqueId);
          
          translations.push({
            ...translation,
            id: uniqueId,
          });
        }
      } catch (error) {
        console.error(`Failed to get translations from ${provider}:`, error);
      }
    } else {
      console.log(`[getAllTranslations] ${provider} client not configured or not available`);
    }
  }
  
  console.log(`[getAllTranslations] Returning ${translations.length} total translations`);
  return translations;
}

/**
 * Fetch a chapter from the appropriate source
 * 
 * Priority:
 * 1. Check IndexedDB cache
 * 2. Try API (getBible, Biblia, or ESV)
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
    // Handle both old format (objects) and new format (strings)
    const verses = Object.entries(cached.verses).map(([num, text]) => {
      // Convert to string if it's an object (old cached format)
      let textStr = '';
      if (typeof text === 'string') {
        textStr = text;
      } else if (text && typeof text === 'object') {
        // Old format - extract text property
        textStr = String((text as any).text || (text as any).content || '');
      } else {
        textStr = String(text || '');
      }
      
      return {
        ref: { book, chapter, verse: parseInt(num, 10) },
        text: textStr,
        html: textStr,
      };
    });
    
    return {
      book,
      chapter,
      verses,
    };
  }

  // Determine which API to use based on translation ID
  // Strip provider prefix if present (e.g., "getbible-kjv" -> "kjv")
  let actualTranslationId = translationId;
  let provider: BibleApiProvider | null = null;
  
  if (translationId.includes('-')) {
    const [prefix, ...rest] = translationId.split('-');
    if (['getbible', 'biblia', 'esv'].includes(prefix)) {
      provider = prefix as BibleApiProvider;
      actualTranslationId = rest.join('-');
    }
  }
  
  let chapterData: ChapterResponse | null = null;
  
  // Check if it's a getBible translation
  // If provider is explicitly getbible, or if it's not from another provider, try getBible
  // getBible uses lowercase translation IDs (abbreviations)
  if ((!provider || provider === 'getbible')) {
    if (getBibleClient.isConfigured()) {
      try {
        // Try getBible for any translation ID (it will fail gracefully if not found)
        chapterData = await getBibleClient.getChapter(actualTranslationId.toLowerCase(), book, chapter);
      } catch (error) {
        // Only log if it's not a 404 (translation not found in getBible)
        if (error instanceof BibleApiError && error.statusCode !== 404) {
          console.warn('getBible API failed, trying other sources:', error);
        }
        // Continue to try other APIs
      }
    }
  }
  
  // Check if it's a Biblia translation
  if (!chapterData && (!provider || provider === 'biblia') && 
      (actualTranslationId.startsWith('eng-') || ['NASB', 'NIV', 'NKJV'].includes(actualTranslationId))) {
    if (bibliaClient.isConfigured()) {
      try {
        chapterData = await bibliaClient.getChapter(actualTranslationId, book, chapter);
      } catch (error) {
        console.warn('Biblia API failed, trying other sources:', error);
      }
    }
  }
  
  // Check if it's ESV
  if (!chapterData && (!provider || provider === 'esv') && actualTranslationId === 'ESV') {
    if (esvClient.isConfigured()) {
      try {
        chapterData = await esvClient.getChapter(actualTranslationId, book, chapter);
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

  // No API data available
  throw new BibleApiError(
    `No API configured for translation: ${translationId}. Available APIs: getBible (free), Biblia, ESV.`,
    'getbible'
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
    
    // Enable getBible by default (no API key required)
    // Note: getBible doesn't need to be stored in apiConfigs since it's always available
    getBibleClient.configure({
      provider: 'getbible',
      enabled: true,
    });
  } catch (error) {
    console.warn('Failed to load API configs:', error);
    // Still enable getBible even if loading configs fails
    getBibleClient.configure({
      provider: 'getbible',
      enabled: true,
    });
  }
}

/**
 * Save API configuration to database
 */
export async function saveApiConfig(config: ApiConfig): Promise<void> {
  // getBible doesn't need to be saved (it's always enabled)
  if (config.provider === 'getbible') {
    configureApi(config.provider, config);
    return;
  }
  
  const prefs = await db.preferences.get('main');
  if (!prefs) return;

  const existingConfigs = prefs.apiConfigs || [];
  const updatedConfigs = existingConfigs.filter(c => c.provider !== config.provider);
  
  // Convert ApiConfig to ApiConfigRecord (exclude getbible)
  updatedConfigs.push({
    provider: config.provider as 'biblia' | 'esv' | 'sword',
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    enabled: config.enabled,
  });

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
  // getBible is always enabled, no config needed
  if (provider === 'getbible') {
    return { provider: 'getbible', enabled: true };
  }
  
  const prefs = await db.preferences.get('main');
  if (!prefs?.apiConfigs) return null;
  const config = prefs.apiConfigs.find(c => c.provider === provider);
  if (!config) return null;
  
  // Convert ApiConfigRecord to ApiConfig
  return {
    provider: config.provider as BibleApiProvider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    enabled: config.enabled,
  };
}
