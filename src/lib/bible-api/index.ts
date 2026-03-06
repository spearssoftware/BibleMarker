/**
 * Bible API Module
 *
 * Unified interface for fetching Bible text from two sources:
 * - SWORD modules (local, offline) — NASB, KJV, ASV, WEB
 * - ESV API (network, requires API key) — ESV only
 */

import type {
  BibleApiProvider,
  ApiConfig,
  ApiTranslation,
  ChapterResponse,
  SearchResult,
  BibleApiClient,
} from './types';
import { BibleApiError } from './types';
import { esvClient, parseVerseText } from './esv';
import { swordClient } from './sword';
import type { Chapter } from '@/types';
import { getPreferences, updatePreferences, getCachedChapter, setCachedChapter, getAllCachedChapters, clearChapterCache, sqlSelect, sqlExecute } from '@/lib/database';
import { retryWithBackoff, isNetworkError, getNetworkErrorMessage, isOnline } from '../offline';

// Re-export types
export * from './types';
export { esvClient, ESV_COPYRIGHT } from './esv';
export { swordClient } from './sword';
export {
  isModuleDownloaded,
  downloadModule,
  deleteModule,
  getAvailableModules,
  getModuleInfo,
  isModuleBundled,
  getModuleCopyright,
  hasModuleStrongs,
  searchModuleText,
  NASB_COPYRIGHT,
  NASB95_COPYRIGHT,
  LOCKMAN_URL,
} from './sword';

// Console helpers
if (typeof window !== 'undefined') {
  (window as Window & { clearChapterCache?: () => Promise<number> }).clearChapterCache = async () => {
    const allCached = await getAllCachedChapters();
    const count = allCached.length;
    await clearChapterCache();
    return count;
  };

  (window as Window & { clearTranslationCache?: () => Promise<number> }).clearTranslationCache = async () => {
    const rows = await sqlSelect<{ id: string }[]>('SELECT id FROM translation_cache');
    const count = rows.length;
    await sqlExecute('DELETE FROM translation_cache');
    return count;
  };
}

/** All available API clients */
const clients: Record<BibleApiProvider, BibleApiClient> = {
  esv: esvClient,
  sword: swordClient,
};

/** Get a specific API client */
export function getClient(provider: BibleApiProvider): BibleApiClient {
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

/** Get all available translations from installed SWORD modules + ESV */
export async function getAllTranslations(): Promise<ApiTranslation[]> {
  const translations: ApiTranslation[] = [];

  // SWORD modules (local, always available)
  try {
    const swordTranslations = await swordClient.getTranslations();
    translations.push(...swordTranslations);
  } catch (error) {
    console.error('Failed to get SWORD translations:', error);
  }

  // ESV (network, only if configured)
  if (esvClient.isConfigured()) {
    try {
      const esvTranslations = await esvClient.getTranslations();
      translations.push(...esvTranslations);
    } catch (error) {
      console.error('Failed to get ESV translations:', error);
    }
  }

  return translations;
}

/**
 * Fetch a chapter from the appropriate source
 *
 * Priority:
 * 1. Check cache
 * 2. If sword-* translation -> swordClient.getChapter()
 * 3. If ESV -> esvClient.getChapter()
 */
export async function fetchChapter(
  translationId: string,
  book: string,
  chapter: number
): Promise<Chapter> {
  // Check cache first (SWORD modules are local, skip cache)
  const isSword = translationId.startsWith('sword-');
  const cached = isSword ? null : await getCachedChapter(translationId, book, chapter);

  if (cached) {
    const isESV = isEsvTranslation(translationId);
    const verses = Object.entries(cached.verses).map(([num, text]) => {
      let textStr = '';
      if (typeof text === 'string') {
        textStr = text;
      } else if (text && typeof text === 'object') {
        textStr = String((text as { text?: string; content?: string }).text || (text as { text?: string; content?: string }).content || '');
      } else {
        textStr = String(text || '');
      }

      if (isESV && textStr) {
        const parsed = parseVerseText(textStr);
        textStr = parsed.text;
      }

      return {
        ref: { book, chapter, verse: parseInt(num, 10) },
        text: textStr,
        html: textStr,
      };
    });

    return { book, chapter, verses };
  }

  // Determine source
  const isESV = isEsvTranslation(translationId);

  let chapterData: ChapterResponse | null = null;

  if (isSword) {
    chapterData = await swordClient.getChapter(translationId, book, chapter);
  } else if (isESV) {
    if (!esvClient.isConfigured()) {
      throw new BibleApiError(
        'ESV API key not configured. Please configure your ESV API key in Settings.',
        'esv',
        401
      );
    }

    try {
      chapterData = await retryWithBackoff(
        () => esvClient.getChapter('ESV', book, chapter),
        { maxRetries: 2, initialDelay: 1000 }
      );
    } catch (error) {
      if (isNetworkError(error) || !isOnline()) {
        throw new BibleApiError(
          getNetworkErrorMessage(error),
          'esv',
          error instanceof BibleApiError ? error.statusCode : undefined
        );
      }
      throw error;
    }
  } else {
    throw new BibleApiError(
      `Unknown translation "${translationId}". Available sources: SWORD modules (offline) and ESV API.`,
      'sword',
      404
    );
  }

  if (chapterData) {
    // Cache the chapter
    if (isESV) {
      // ESV storage limits: max 500 consecutive verses or half book
      const verseCount = chapterData.verses.length;
      const { getBookVerseCount, getVerseCount: getVC } = await import('@/types/bible');
      const halfBook = Math.floor(getBookVerseCount(book) / 2);
      const maxVerses = Math.min(500, halfBook);

      if (verseCount <= maxVerses) {
        const allCached = await getAllCachedChapters();
        const cachedChapters = allCached.filter(c => c.moduleId === translationId && c.book === book);
        const chapterNumbers = new Set<number>();
        cachedChapters.forEach(c => { if (c.chapter !== undefined) chapterNumbers.add(c.chapter); });
        chapterNumbers.add(chapter);
        const sortedChapters = Array.from(chapterNumbers).sort((a, b) => a - b);

        let maxConsecutiveVerses = 0;
        for (let i = 0; i < sortedChapters.length; i++) {
          let sequenceVerses = 0;
          let includesNewChapter = false;
          for (let j = i; j < sortedChapters.length; j++) {
            if (j > i && sortedChapters[j] !== sortedChapters[j - 1] + 1) break;
            if (sortedChapters[j] === chapter) {
              sequenceVerses += verseCount;
              includesNewChapter = true;
            } else {
              const cc = cachedChapters.find(c => c.chapter === sortedChapters[j]);
              sequenceVerses += cc ? Object.keys(cc.verses || {}).length : getVC(book, sortedChapters[j]);
            }
          }
          if (includesNewChapter) {
            maxConsecutiveVerses = Math.max(maxConsecutiveVerses, sequenceVerses);
          }
        }

        if (maxConsecutiveVerses <= maxVerses) {
          const versesMap: Record<number, string> = {};
          for (const v of chapterData.verses) versesMap[v.verse] = v.text;
          await setCachedChapter(translationId, book, chapter, versesMap);
        }
      }
    }
    // SWORD modules are local — no caching needed

    return {
      book,
      chapter,
      verses: chapterData.verses.map(v => ({
        ref: { book, chapter, verse: v.verse },
        text: v.text,
        html: v.html || v.text,
        ...(v.words ? { words: v.words } : {}),
      })),
    };
  }

  return { book, chapter, verses: [] };
}

/** Check if a translation ID refers to ESV */
function isEsvTranslation(translationId: string): boolean {
  const upper = translationId.toUpperCase();
  return upper === 'ESV' || upper === 'ESV-ESV' || upper.startsWith('ESV-');
}

/**
 * Search across Bible text (ESV only — SWORD modules don't support search)
 */
export async function searchBible(
  translationId: string,
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  if (isEsvTranslation(translationId) && esvClient.isConfigured()) {
    return esvClient.search(translationId, query, limit);
  }
  return [];
}

/**
 * Load API configurations from database
 */
export async function loadApiConfigs(): Promise<void> {
  try {
    const prefs = await getPreferences();

    if (prefs?.apiConfigs) {
      for (const configRecord of prefs.apiConfigs) {
        // Only handle ESV configs (SWORD doesn't need config)
        if (configRecord.provider === 'esv') {
          const config: ApiConfig = {
            provider: configRecord.provider as BibleApiProvider,
            apiKey: configRecord.apiKey,
            enabled: configRecord.enabled,
          };
          configureApi(config.provider, config);
        }
      }
    }
  } catch (error) {
    console.error('Failed to load API configs:', error);
  }

  // Clean up stale SWORD chapter cache (SWORD modules are local, no caching needed)
  try {
    await sqlExecute(`DELETE FROM cached_chapters WHERE module_id LIKE 'sword-%'`);
  } catch {
    // ignore
  }
}

/**
 * Save API configuration to database
 */
export async function saveApiConfig(config: ApiConfig): Promise<void> {
  // SWORD doesn't need saved config
  if (config.provider === 'sword') return;

  const prefs = await getPreferences();
  const existingConfigs = (prefs.apiConfigs || []).filter(c =>
    c.provider === 'esv' || c.provider === 'sword'
  );
  const updatedConfigs = existingConfigs.filter(c => c.provider !== config.provider);

  updatedConfigs.push({
    provider: config.provider as 'esv' | 'sword',
    apiKey: config.apiKey,
    username: config.username,
    password: config.password,
    baseUrl: config.baseUrl,
    enabled: config.enabled,
  });

  await updatePreferences({ apiConfigs: updatedConfigs });
  configureApi(config.provider, config);
}

/**
 * Get API configuration from database
 */
export async function getApiConfig(provider: BibleApiProvider): Promise<ApiConfig | null> {
  if (provider === 'sword') {
    return { provider: 'sword', enabled: true };
  }

  const prefs = await getPreferences();
  if (!prefs?.apiConfigs) return null;
  const config = prefs.apiConfigs.find(c => c.provider === provider);
  if (!config) return null;

  return {
    provider: config.provider as BibleApiProvider,
    apiKey: config.apiKey,
    enabled: config.enabled,
  };
}
