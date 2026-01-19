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
import { bibleGatewayClient } from './biblegateway';
import { esvClient } from './esv';
import { getBibleClient } from './getbible';
import type { VerseRef, Chapter } from '@/types/bible';
import { db } from '@/lib/db';

// Re-export types
export * from './types';
export { bibliaClient } from './biblia';
export { bibleGatewayClient } from './biblegateway';
export { esvClient, ESV_COPYRIGHT } from './esv';
export { getBibleClient } from './getbible';

/** Set to true to enable BibleGateway API (NASB, NIV, etc.). Disabled for now. */
export const BIBLEGATEWAY_ENABLED = false;

/**
 * Check if a Bible translation is available with the current Biblia API key
 * Usage: In browser console, type: window.testBibleAvailability('NASB')
 */
if (typeof window !== 'undefined') {
  (window as any).testBibleAvailability = async (bibleId: string) => {
    const { bibliaClient } = await import('./biblia');
    const isAvailable = await bibliaClient.isBibleAvailable(bibleId);
    console.log(`Bible "${bibleId}" is ${isAvailable ? '✅ AVAILABLE' : '❌ NOT AVAILABLE'} with your API key`);
    return isAvailable;
  };

  (window as any).listAvailableBibles = async () => {
    const { bibliaClient } = await import('./biblia');
    const bibleIds = await bibliaClient.getAvailableBibleIds();
    console.log(`Available Bibles with your API key (${bibleIds.length} total):`, bibleIds);
    return bibleIds;
  };

  (window as any).clearChapterCache = async () => {
    const count = await db.chapterCache.count();
    await db.chapterCache.clear();
    console.log(`✅ Cleared ${count} cached chapters`);
    return count;
  };

  (window as any).clearTranslationCache = async () => {
    const count = await db.translationCache.count();
    await db.translationCache.clear();
    console.log(`✅ Cleared ${count} cached translation lists`);
    return count;
  };
}

/** All available API clients */
const clients: Record<BibleApiProvider, BibleApiClient | null> = {
  biblia: bibliaClient,
  biblegateway: bibleGatewayClient,
  esv: esvClient,
  getbible: getBibleClient,
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

// Request deduplication: if getAllTranslations is already in progress, 
// subsequent calls wait for the first one to complete
let getAllTranslationsPromise: Promise<ApiTranslation[]> | null = null;

// In-memory cache for the current session
let cachedTranslations: ApiTranslation[] | null = null;

const CACHE_KEY = 'all-translations';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Get all available translations from all configured APIs */
export async function getAllTranslations(): Promise<ApiTranslation[]> {
  // Check IndexedDB cache first (24 hour TTL)
  try {
    const cached = await db.translationCache.get(CACHE_KEY);
    if (cached && cached.cachedAt) {
      const now = new Date();
      const cacheAge = now.getTime() - cached.cachedAt.getTime();
      if (cacheAge < CACHE_DURATION_MS) {
        const translations = cached.translations as ApiTranslation[];
        console.log('[getAllTranslations] Using cached translations from IndexedDB (age:', Math.round(cacheAge / 1000 / 60 / 60), 'hours)');
        // Update in-memory cache
        cachedTranslations = translations;
        return translations;
      } else {
        console.log('[getAllTranslations] Cache expired (age:', Math.round(cacheAge / 1000 / 60 / 60), 'hours), fetching fresh translations');
      }
    }
  } catch (error) {
    // If translationCache table doesn't exist yet, just continue to fetch
    console.warn('[getAllTranslations] Error reading cache, fetching fresh:', error);
  }

  // Check in-memory cache (for same-session calls)
  if (cachedTranslations) {
    console.log('[getAllTranslations] Using in-memory cached translations');
    return cachedTranslations;
  }

  // If a request is already in progress, wait for it instead of starting a new one
  if (getAllTranslationsPromise) {
    console.log('[getAllTranslations] Request already in progress, waiting for existing request...');
    return getAllTranslationsPromise;
  }

  // Ensure getBible is configured (it's free and always available)
  if (!getBibleClient.isConfigured()) {
    getBibleClient.configure({
      provider: 'getbible',
      enabled: true,
    });
  }
  
  console.log('[getAllTranslations] Starting to fetch translations from all clients');
  
  // Create the promise and store it so concurrent calls can wait for it
  getAllTranslationsPromise = (async () => {
    const translations: ApiTranslation[] = [];
    const seenIds = new Set<string>();
    
    // Load translations sequentially to avoid overwhelming browser resources
    // This prevents net::ERR_INSUFFICIENT_RESOURCES errors
    const allProviderTranslations: ApiTranslation[][] = [];
    
    for (const [provider, client] of Object.entries(clients)) {
      if (!client) continue;
      if (provider === 'biblegateway' && !BIBLEGATEWAY_ENABLED) continue;

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
          
          allProviderTranslations.push(providerTranslations);
        } catch (error) {
          console.error(`Failed to get translations from ${provider}:`, error);
          allProviderTranslations.push([]);
        }
      } else {
        console.log(`[getAllTranslations] ${provider} client not configured or not available`);
        allProviderTranslations.push([]);
      }
      
      // Add a small delay between API calls to prevent overwhelming browser resources
      // Only delay if there are more providers to process
      const remainingProviders = Object.entries(clients).slice(
        Object.entries(clients).findIndex(([p]) => p === provider) + 1
      );
      if (remainingProviders.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 150)); // 150ms delay
      }
    }
    
    // Combine and deduplicate translations
    for (const providerTranslations of allProviderTranslations) {
      for (const translation of providerTranslations) {
        // Skip translations without valid IDs
        if (!translation.id || typeof translation.id !== 'string' || translation.id.trim() === '') {
          console.warn(`Skipping translation without valid ID:`, translation);
          continue;
        }
        
        // Create unique ID by prefixing with provider if duplicate exists
        let uniqueId = translation.id.trim();
        if (seenIds.has(uniqueId)) {
          uniqueId = `${translation.provider}-${translation.id.trim()}`;
        }
        seenIds.add(uniqueId);
        
        translations.push({
          ...translation,
          id: uniqueId,
        });
      }
    }
    
    console.log(`[getAllTranslations] Returning ${translations.length} total translations`);
    
    // Cache the result in memory
    cachedTranslations = translations;
    
    // Persist to IndexedDB for next session
    try {
      await db.translationCache.put({
        id: CACHE_KEY,
        translations: translations,
        cachedAt: new Date(),
      });
      console.log('[getAllTranslations] Cached translations to IndexedDB');
    } catch (error) {
      console.warn('[getAllTranslations] Failed to cache translations:', error);
    }
    
    return translations;
  })();

  try {
    const result = await getAllTranslationsPromise;
    return result;
  } finally {
    // Clear the promise so future calls can start a new request
    getAllTranslationsPromise = null;
  }
}

/** Clear the translations cache (useful when API configs change) */
export async function clearTranslationsCache(): Promise<void> {
  cachedTranslations = null;
  try {
    await db.translationCache.delete(CACHE_KEY);
    console.log('[getAllTranslations] Cache cleared from IndexedDB');
  } catch (error) {
    console.warn('[getAllTranslations] Failed to clear cache:', error);
  }
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
    if (['getbible', 'biblia', 'esv', 'biblegateway'].includes(prefix)) {
      provider = prefix as BibleApiProvider;
      actualTranslationId = rest.join('-');
    }
  }
  
  let chapterData: ChapterResponse | null = null;
  
  // Check ESV first (case-insensitive) - ESV is a specific API, not getBible
  // Handle multiple formats: "ESV", "esv-ESV", or provider prefix "esv"
  const normalizedId = actualTranslationId.toUpperCase();
  const normalizedOriginalId = translationId.toUpperCase();
  const isESV = normalizedId === 'ESV' || 
                normalizedId === 'ESV-ESV' ||
                normalizedOriginalId === 'ESV' ||
                normalizedOriginalId.startsWith('ESV-') ||
                provider === 'esv';
  
  if (isESV) {
    if (esvClient.isConfigured()) {
      try {
        chapterData = await esvClient.getChapter('ESV', book, chapter);
      } catch (error) {
        console.warn('ESV API failed:', error);
        // Don't silently fail - rethrow if it's a configuration error
        if (error instanceof BibleApiError && error.statusCode === 401) {
          throw error;
        }
      }
    } else {
      // ESV API not configured - provide helpful error
      throw new BibleApiError(
        'ESV API key not configured. Please configure your ESV API key in the Module Manager settings.',
        'esv',
        401
      );
    }
  }
  
  // Check if it's a Biblia translation
  // Biblia now only handles unique translations: LEB, DARBY, YLT, EMPHBBL
  // KJV and ASV are handled by getBible (free)
  // Also handle old format with "eng-" prefix for backwards compatibility
  const isBibliaTranslation = (!provider || provider === 'biblia') && (
    actualTranslationId.startsWith('eng-') || 
    ['LEB', 'DARBY', 'YLT', 'EMPHBBL'].includes(actualTranslationId.toUpperCase())
  );
  
  // Check BibleGateway (NASB, NIV, ESV, etc.) - disabled when BIBLEGATEWAY_ENABLED is false
  if (BIBLEGATEWAY_ENABLED && !chapterData && (provider === 'biblegateway' || (!provider && bibleGatewayClient.isConfigured()))) {
    if (bibleGatewayClient.isConfigured()) {
      try {
        chapterData = await bibleGatewayClient.getChapter(actualTranslationId, book, chapter);
      } catch (error) {
        console.warn('BibleGateway API failed:', error);
      }
    }
  }

  let bibliaError: Error | null = null;
  if (!chapterData && isBibliaTranslation) {
    if (bibliaClient.isConfigured()) {
      try {
        // Remove "eng-" prefix if present for backwards compatibility
        let bibliaTranslationId = actualTranslationId;
        if (bibliaTranslationId.startsWith('eng-')) {
          bibliaTranslationId = bibliaTranslationId.substring(4);
        }
        // Convert to uppercase to match Biblia API format
        bibliaTranslationId = bibliaTranslationId.toUpperCase();
        console.log('[fetchChapter] Using Biblia API with translation ID:', bibliaTranslationId);
        chapterData = await bibliaClient.getChapter(bibliaTranslationId, book, chapter);
      } catch (error) {
        bibliaError = error as Error;
        // Check if it's a 403 error (translation not available)
        const is403Error = error instanceof BibleApiError && error.statusCode === 403;
        if (is403Error) {
          console.warn(`[fetchChapter] Translation "${actualTranslationId}" not available with your Biblia API key. Try KJV, ASV, or LEB instead.`);
        } else {
          console.warn('Biblia API failed, trying other sources:', error);
        }
      }
    }
  }
  
  // Check if it's a getBible translation (only if not ESV or Biblia)
  // If provider is explicitly getbible, or if it's not from another provider, try getBible
  // getBible uses lowercase translation IDs (abbreviations)
  let getBibleError: Error | null = null;
  if (!chapterData && !isESV && (!provider || provider === 'getbible')) {
    if (getBibleClient.isConfigured()) {
      try {
        // Try getBible for any translation ID (it will fail gracefully if not found)
        chapterData = await getBibleClient.getChapter(actualTranslationId.toLowerCase(), book, chapter);
      } catch (error) {
        getBibleError = error as Error;
        // If provider is explicitly getbible and we get a 404, the translation doesn't exist
        if (provider === 'getbible' && error instanceof BibleApiError && error.statusCode === 404) {
          // Translation explicitly from getBible but not found - report error immediately
          throw new BibleApiError(
            `Translation "${translationId}" not found in getBible API. The translation may not be available or the ID may be incorrect.`,
            'getbible',
            404
          );
        }
        // For non-explicit getbible translations, log but continue to try other APIs
        // Only log if it's not a CORS/network error (these are expected for invalid translations)
        const isCorsError = error instanceof Error && (
          error.message.includes('CORS') || 
          error.message.includes('Failed to fetch') ||
          error.message.includes('NetworkError') ||
          error.message.includes('timeout')
        );
        if (!isCorsError) {
          console.warn('getBible API failed, trying other sources:', error);
        }
        // Continue to try other APIs
      }
    }
  }

  if (chapterData) {
    // For ESV, check storage limits before caching
    const isESV = normalizedId === 'ESV' || 
                  normalizedId === 'ESV-ESV' ||
                  normalizedOriginalId === 'ESV' ||
                  normalizedOriginalId.startsWith('ESV-') ||
                  provider === 'esv';
    
    if (isESV) {
      // Check ESV storage limits: max 500 consecutive verses or half book
      const verseCount = chapterData.verses.length;
      const { getBookVerseCount } = await import('@/types/bible');
      const halfBook = Math.floor(getBookVerseCount(book) / 2);
      const maxVerses = Math.min(500, halfBook);
      
      // Check if this chapter alone exceeds the limit
      if (verseCount > maxVerses) {
        // Don't cache if it exceeds limits - but still return the data
        console.warn(`ESV storage limit: Not caching ${book} ${chapter} (${verseCount} verses exceeds limit of ${maxVerses})`);
      } else {
        // Check if caching this chapter would create more than 500 consecutive verses
        // Get all cached chapters for this book/translation
        const allCached = await db.chapterCache
          .where('moduleId')
          .equals(translationId)
          .toArray();
        const cachedChapters = allCached.filter(c => c.book === book);
        
        // Find consecutive chapters that include this chapter
        const cachedChapterNumbers = cachedChapters
          .map(c => c.chapter)
          .filter((ch): ch is number => ch !== undefined)
          .sort((a, b) => a - b);
        
        // Find the longest consecutive sequence that includes this chapter
        const allChapters = [...new Set([...cachedChapterNumbers, chapter])].sort((a, b) => a - b);
        
        // Find consecutive sequences
        let maxConsecutiveVerses = 0;
        let sequenceStart = 0;
        
        for (let i = 0; i < allChapters.length; i++) {
          let sequenceLength = 1;
          let sequenceVerses = 0;
          
          // Count verses in this chapter (either cached or the one we're adding)
          if (allChapters[i] === chapter) {
            sequenceVerses += verseCount;
          } else {
            const cached = cachedChapters.find(c => c.chapter === allChapters[i]);
            if (cached) {
              sequenceVerses += Object.keys(cached.verses || {}).length;
            }
          }
          
          // Extend sequence forward
          for (let j = i + 1; j < allChapters.length; j++) {
            if (allChapters[j] === allChapters[j - 1] + 1) {
              sequenceLength++;
              if (allChapters[j] === chapter) {
                sequenceVerses += verseCount;
              } else {
                const cached = cachedChapters.find(c => c.chapter === allChapters[j]);
                if (cached) {
                  sequenceVerses += Object.keys(cached.verses || {}).length;
                }
              }
            } else {
              break;
            }
          }
          
          // Check if this sequence includes the chapter we're adding
          if (allChapters[i] <= chapter && chapter <= allChapters[i] + sequenceLength - 1) {
            maxConsecutiveVerses = Math.max(maxConsecutiveVerses, sequenceVerses);
          }
        }
        
        if (maxConsecutiveVerses > maxVerses) {
          console.warn(`ESV storage limit: Not caching ${book} ${chapter} (would create ${maxConsecutiveVerses} consecutive verses, exceeds limit of ${maxVerses})`);
        } else {
          // Safe to cache
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
        }
      }
    } else {
      // For non-ESV translations, cache normally
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
    }

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

  // No API data available - provide helpful error message
  if (bibliaError && bibliaError instanceof BibleApiError && bibliaError.statusCode === 403) {
    // Biblia translation not available - suggest alternatives
    throw new BibleApiError(
      `Translation "${translationId}" is not available with your Biblia API key. Try KJV, ASV, or LEB instead. You can change the translation in the Module Manager.`,
      'biblia',
      403
    );
  }
  
  // If getBible was tried and failed with a non-404 error, mention it
  if (getBibleError && getBibleError instanceof BibleApiError && getBibleError.statusCode !== 404) {
    throw new BibleApiError(
      `Failed to load translation "${translationId}" from getBible API: ${getBibleError.message}. Please check your internet connection or try a different translation.`,
      'getbible',
      getBibleError.statusCode
    );
  }
  
  // Generic error - translation not found in any API
  throw new BibleApiError(
    `Translation "${translationId}" not found. Available APIs: getBible (free), Biblia, ESV${BIBLEGATEWAY_ENABLED ? ', BibleGateway' : ''}. The translation may not be available or the ID may be incorrect.`,
    'getbible',
    404
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

  if (BIBLEGATEWAY_ENABLED && bibleGatewayClient.isConfigured() && bibleGatewayClient.search) {
    try {
      return await bibleGatewayClient.search(translationId, query, limit);
    } catch {
      // fall through
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
    // Ensure database is ready before accessing it
    await db.open();
    
    const prefs = await db.preferences.get('main');
    console.log('[loadApiConfigs] Preferences loaded:', prefs ? 'found' : 'not found');
    if (prefs?.apiConfigs) {
      console.log('[loadApiConfigs] Loading API configs:', prefs.apiConfigs.map(c => ({ 
        provider: c.provider, 
        hasKey: !!c.apiKey,
        enabled: c.enabled 
      })));
      for (const configRecord of prefs.apiConfigs) {
        if (configRecord.provider === 'biblegateway' && !BIBLEGATEWAY_ENABLED) continue;
        
        // Convert ApiConfigRecord to ApiConfig
        const config: ApiConfig = {
          provider: configRecord.provider as BibleApiProvider,
          apiKey: configRecord.apiKey,
          username: configRecord.username,
          password: configRecord.password,
          baseUrl: configRecord.baseUrl,
          enabled: configRecord.enabled,
        };
        
        // Configure the API client
        configureApi(config.provider, config);
        
        // Log configuration status
        const client = getClient(config.provider);
        if (client) {
          const isConfigured = client.isConfigured();
          console.log(`[loadApiConfigs] ${config.provider} configured:`, isConfigured, 'hasKey:', !!config.apiKey);
          if (!isConfigured && config.enabled && config.apiKey) {
            console.warn(`[loadApiConfigs] ${config.provider} has API key but client reports not configured - this may indicate a configuration issue`);
          }
        }
      }
    } else {
      console.log('[loadApiConfigs] No API configs found in preferences');
    }
    
    // Enable getBible by default (no API key required)
    // Note: getBible doesn't need to be stored in apiConfigs since it's always available
    getBibleClient.configure({
      provider: 'getbible',
      enabled: true,
    });
  } catch (error) {
    console.error('Failed to load API configs:', error);
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
  
  // Ensure preferences exist
  let prefs = await db.preferences.get('main');
  if (!prefs) {
    // Create default preferences if they don't exist
    const { getPreferences } = await import('@/lib/db');
    prefs = await getPreferences();
  }

  const existingConfigs = prefs.apiConfigs || [];
  const updatedConfigs = existingConfigs.filter(c => c.provider !== config.provider);
  
  // Convert ApiConfig to ApiConfigRecord (exclude getbible)
  updatedConfigs.push({
    provider: config.provider as 'biblia' | 'esv' | 'getbible' | 'biblegateway',
    apiKey: config.apiKey,
    username: config.username,
    password: config.password,
    baseUrl: config.baseUrl,
    enabled: config.enabled,
  });

  console.log('[saveApiConfig] Saving config for', config.provider, 'enabled:', config.enabled, 'hasKey:', !!config.apiKey);
  
  await db.preferences.update('main', {
    apiConfigs: updatedConfigs,
  });
  
  // Verify it was saved
  const verifyPrefs = await db.preferences.get('main');
  const savedConfig = verifyPrefs?.apiConfigs?.find(c => c.provider === config.provider);
  console.log('[saveApiConfig] Verification - saved config:', savedConfig ? {
    provider: savedConfig.provider,
    enabled: savedConfig.enabled,
    hasKey: !!savedConfig.apiKey
  } : 'NOT FOUND');

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
    username: config.username,
    password: config.password,
    baseUrl: config.baseUrl,
    enabled: config.enabled,
  };
}
