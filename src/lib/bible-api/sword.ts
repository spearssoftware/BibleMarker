/**
 * SWORD Module Client
 *
 * Local Bible text provider using SWORD zText modules.
 * Downloads module zips on demand and reads them with the existing sword-ztext reader.
 */

import type {
  BibleApiClient,
  ApiConfig,
  ApiTranslation,
  ChapterResponse,
  VerseResponse,
  BibleApiProvider,
} from './types';
import { BibleApiError } from './types';
import type { VerseRef, WordStrongs } from '@/types';
import { getVerseCount, BIBLE_BOOKS } from '@/types';
import { loadFromZip, getVerseRaw, type SwordModuleFiles } from './sword-ztext';

/** Copyright text for NASB editions */
export const NASB_COPYRIGHT =
  'New American Standard Bible\u00AE Copyright \u00A9 1960, 1971, 1977, 1995, 2020 by The Lockman Foundation, La Habra, Calif. All rights reserved.';
export const NASB95_COPYRIGHT =
  'New American Standard Bible\u00AE \u2014 NASB 1995 Copyright \u00A9 1960, 1971, 1977, 1995 by The Lockman Foundation, La Habra, Calif. All rights reserved.';
export const LOCKMAN_URL = 'https://www.lockman.org';

/** Module registry entry */
interface SwordModuleInfo {
  id: string;
  name: string;
  abbreviation: string;
  /** URL for single-zip download (most modules) */
  downloadUrl?: string;
  /** Resource filename for modules bundled with the app */
  bundledResource?: string;
  copyright: string | null;
  copyrightUrl: string | null;
  language: string;
  category: 'licensed' | 'public-domain';
  /** Whether this module includes Strong's number tagging */
  hasStrongs?: boolean;
}

/** CrossWire rawzip base URL */
const CROSSWIRE_BASE = 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip';


/** Helper to create a public domain module entry */
function pdModule(abbreviation: string, name: string, language = 'en', hasStrongs = false): SwordModuleInfo {
  return {
    id: `sword-${abbreviation}`,
    name,
    abbreviation,
    downloadUrl: `${CROSSWIRE_BASE}/${abbreviation}.zip`,
    copyright: null,
    copyrightUrl: null,
    language,
    category: 'public-domain',
    hasStrongs,
  };
}

/** Hardcoded module registry */
const MODULE_REGISTRY: SwordModuleInfo[] = [
  // Licensed modules (Lockman Foundation) — bundled with the app
  {
    id: 'sword-NASB',
    name: 'New American Standard Bible (2020)',
    abbreviation: 'NASB',
    bundledResource: 'sword-NASB.zip',
    copyright: NASB_COPYRIGHT,
    copyrightUrl: LOCKMAN_URL,
    language: 'en',
    category: 'licensed',
    hasStrongs: true,
  },
  {
    id: 'sword-NASB1995',
    name: 'New American Standard Bible (1995)',
    abbreviation: 'NASB95',
    bundledResource: 'sword-NASB1995.zip',
    copyright: NASB95_COPYRIGHT,
    copyrightUrl: LOCKMAN_URL,
    language: 'en',
    category: 'licensed',
    hasStrongs: true,
  },

  // Public domain modules — ASV is bundled as the offline-default translation
  // so a fresh install always has a Bible to read, even without internet.
  // Other public-domain modules download from CrossWire on demand.
  {
    id: 'sword-ASV',
    name: 'American Standard Version',
    abbreviation: 'ASV',
    downloadUrl: `${CROSSWIRE_BASE}/ASV.zip`,
    bundledResource: 'sword-ASV.zip',
    copyright: null,
    copyrightUrl: null,
    language: 'en',
    category: 'public-domain',
  },
  pdModule('KJV', 'King James Version', 'en', true),
  pdModule('BBE', 'Bible in Basic English'),
  pdModule('BSB', 'Berean Standard Bible'),
  pdModule('Darby', 'Darby Translation'),
  pdModule('DRC', 'Douay-Rheims Challoner'),
  pdModule('Geneva', 'Geneva Bible (1599)'),
  pdModule('Godbey', 'Godbey New Testament'),
  pdModule('JPS', 'JPS 1917 Old Testament'),
  pdModule('KJVA', 'King James Version with Apocrypha', 'en', true),
  pdModule('LITV', 'Green\'s Literal Translation'),
  pdModule('LEB', 'Lexham English Bible'),
  pdModule('MKJV', 'Modern King James Version'),
  pdModule('Montgomery', 'Montgomery New Testament'),
  pdModule('Murdock', 'Murdock Peshitta Translation'),
  pdModule('NHEB', 'New Heart English Bible'),
  pdModule('Noyes', 'Noyes Translation'),
  pdModule('OEBcth', 'Open English Bible (Commonwealth)'),
  pdModule('RKJNT', 'Revised King James New Testament'),
  pdModule('RWebster', 'Revised Webster Version'),
  pdModule('SPMT', 'Smith\'s Peshitta Targum'),
  pdModule('Twenty', 'Twentieth Century New Testament'),
  pdModule('Tyndale', 'Tyndale Bible (1525/1530)'),
  pdModule('UKJV', 'Updated King James Version'),
  pdModule('Webster', 'Webster Bible'),
  pdModule('Weymouth', 'Weymouth New Testament'),
  pdModule('WLC', 'Westminster Leningrad Codex (Hebrew OT)'),
  pdModule('Worsley', 'Worsley New Testament'),
  pdModule('YLT', 'Young\'s Literal Translation'),

  // Non-English literal/formal equivalence translations (for precept study)
  pdModule('SpaRV1909', 'Reina-Valera 1909', 'es'),
  pdModule('FreSegond1910', 'Louis Segond 1910', 'fr'),
  pdModule('GerElb1905', 'Elberfelder 1905', 'de'),
  pdModule('PorAlmeida1911', 'Almeida 1911', 'pt'),
  pdModule('ItaRive', 'Riveduta Bibbia', 'it'),
  pdModule('RusSynodal', 'Synodal Translation', 'ru'),
  pdModule('DutSVV', 'Statenvertaling', 'nl'),
  pdModule('Vulgate', 'Latin Vulgate', 'la'),
];

/** In-memory loaded module files, keyed by module ID */
const loadedModules = new Map<string, SwordModuleFiles>();

/** Per-module decompression buffer caches */
const bufferCaches = new Map<string, Map<string, Uint8Array>>();

/** Modules verified installed this session — skips repeat install checks. */
const verifiedInstalled = new Set<string>();
const inFlightInstalls = new Map<string, Promise<void>>();

/** Strip OSIS XML to plain verse text (removes notes, titles, divs, keeps word content) */
export function stripOsis(text: string): string {
  let result = text
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, '') // remove section headings
    .replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, '')   // remove notes (cross-refs, footnotes)
    .replace(/<div\b[^>]*\/>/g, '')                    // remove self-closing divs (milestones)
    .replace(/<div\b[^>]*>[\s\S]*?<\/div>/g, '');     // remove div blocks
  // Loop catch-all tag removal to handle any tags reconstituted by prior replacements
  let previous;
  do {
    previous = result;
    result = result.replace(/<[^>]+>/g, '');
  } while (result !== previous);
  return result.replace(/\s+/g, ' ').trim();
}

/** Extract cross-references from OSIS XML */
export function extractCrossRefs(osisText: string): { label: string; osisRef: string }[] {
  const refs: { label: string; osisRef: string }[] = [];
  const noteRegex = /<note\b[^>]*type="crossReference"[^>]*>([\s\S]*?)<\/note>/g;
  let noteMatch: RegExpExecArray | null;
  while ((noteMatch = noteRegex.exec(osisText)) !== null) {
    const noteContent = noteMatch[1];
    const refRegex = /<reference\s+osisRef="([^"]+)"[^>]*>([^<]*)<\/reference>/g;
    let refMatch: RegExpExecArray | null;
    while ((refMatch = refRegex.exec(noteContent)) !== null) {
      refs.push({ osisRef: refMatch[1], label: refMatch[2] });
    }
  }
  return refs;
}

/** Extract words with Strong's numbers from OSIS XML (before stripping) */
export function extractWordsWithStrongs(osisText: string): WordStrongs[] {
  const result: WordStrongs[] = [];
  const wTagRegex = /<w\b[^>]*lemma="([^"]*)"[^>]*>([^<]*)<\/w>/g;
  let match: RegExpExecArray | null;
  while ((match = wTagRegex.exec(osisText)) !== null) {
    const lemmaAttr = match[1];
    const word = match[2].trim();
    if (!word) continue;

    const strongs: string[] = [];
    const strongsRegex = /strong:([HG]\d+)/gi;
    let strongsMatch: RegExpExecArray | null;
    while ((strongsMatch = strongsRegex.exec(lemmaAttr)) !== null) {
      strongs.push(strongsMatch[1].toUpperCase());
    }

    if (strongs.length > 0) {
      result.push({ word, strongs });
    }
  }
  return result;
}

/** Get the app data directory path for SWORD module storage */
async function getSwordDir(): Promise<string> {
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const base = await appDataDir();
  return await join(base, 'sword');
}

/** Get the file path for a module zip */
async function getModulePath(moduleId: string): Promise<string> {
  const { join } = await import('@tauri-apps/api/path');
  const dir = await getSwordDir();
  return await join(dir, `${moduleId}.zip`);
}

/**
 * Install a bundled module from app resources if not already on disk.
 * Throws a BibleApiError on failure so the caller can surface the reason.
 */
async function installBundledIfNeeded(moduleId: string): Promise<void> {
  if (verifiedInstalled.has(moduleId)) return;

  const existing = inFlightInstalls.get(moduleId);
  if (existing) return existing;

  const info = MODULE_REGISTRY.find((m) => m.id === moduleId);
  if (!info?.bundledResource) return;

  const promise = (async () => {
    const destPath = await getModulePath(moduleId);
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('install_bundled_module', {
        resourceName: info.bundledResource,
        destPath,
      });
      verifiedInstalled.add(moduleId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[SWORD] Failed to install bundled module ${moduleId}:`, msg);
      throw new BibleApiError(
        `Could not install bundled ${info.name}: ${msg}`,
        'sword'
      );
    } finally {
      inFlightInstalls.delete(moduleId);
    }
  })();

  inFlightInstalls.set(moduleId, promise);
  return promise;
}

/**
 * Check if a module zip exists on disk. Swallows install errors — use
 * `ensureModuleReady` instead when you need the failure reason.
 */
export async function isModuleDownloaded(moduleId: string): Promise<boolean> {
  try {
    await installBundledIfNeeded(moduleId);
    const { exists } = await import('@tauri-apps/plugin-fs');
    const path = await getModulePath(moduleId);
    return await exists(path);
  } catch {
    return false;
  }
}

/**
 * Ensure a module is installed and on disk, throwing a BibleApiError with
 * the underlying reason if anything goes wrong. Use before loading verses.
 */
export async function ensureModuleReady(moduleId: string): Promise<void> {
  await installBundledIfNeeded(moduleId);
  const { exists } = await import('@tauri-apps/plugin-fs');
  const path = await getModulePath(moduleId);
  if (!(await exists(path))) {
    const info = MODULE_REGISTRY.find((m) => m.id === moduleId);
    throw new BibleApiError(
      `Module ${info?.name ?? moduleId} is not installed. Install it in Settings.`,
      'sword'
    );
  }
}

/** Download a module zip to disk via Tauri backend (bypasses CORS) */
export async function downloadModule(
  moduleId: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  const info = MODULE_REGISTRY.find((m) => m.id === moduleId);
  if (!info) throw new Error(`Unknown SWORD module: ${moduleId}`);

  if (!info.downloadUrl) {
    // Bundled module — install from resources
    await installBundledIfNeeded(moduleId);
    loadedModules.delete(moduleId);
    bufferCaches.delete(moduleId);
    return;
  }

  onProgress?.(0);
  const destPath = await getModulePath(moduleId);
  console.log(`[SWORD] Downloading ${info.name} from ${info.downloadUrl} to ${destPath}`);

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('download_file', { url: info.downloadUrl, destPath });
    console.log(`[SWORD] Download complete: ${destPath}`);
  } catch (e) {
    console.error(`[SWORD] Download failed:`, e);
    throw new BibleApiError(
      `Failed to download ${info.name}: ${e instanceof Error ? e.message : String(e)}`,
      'sword'
    );
  }

  onProgress?.(100);

  // Clear in-memory cache so next read loads fresh
  loadedModules.delete(moduleId);
  bufferCaches.delete(moduleId);
  verifiedInstalled.delete(moduleId);
}

/** Delete a module zip from disk */
export async function deleteModule(moduleId: string): Promise<void> {
  const { remove } = await import('@tauri-apps/plugin-fs');
  const path = await getModulePath(moduleId);
  try {
    await remove(path);
  } catch {
    // ignore if already gone
  }
  loadedModules.delete(moduleId);
  bufferCaches.delete(moduleId);
  verifiedInstalled.delete(moduleId);
}

/** Load module files into memory (cached) */
async function ensureLoaded(moduleId: string): Promise<SwordModuleFiles> {
  const cached = loadedModules.get(moduleId);
  if (cached) return cached;

  const { readFile } = await import('@tauri-apps/plugin-fs');
  const path = await getModulePath(moduleId);

  const tryLoad = async (): Promise<SwordModuleFiles> => {
    console.log(`[SWORD] Loading module from ${path}`);
    const bytes = await readFile(path);
    console.log(`[SWORD] Read ${bytes.byteLength} bytes`);
    const blob = new Blob([bytes as BlobPart]);
    const { files, meta } = await loadFromZip(blob);
    console.log(`[SWORD] Loaded module: ${meta.name} (${meta.abbreviation}), files: ${Object.keys(files).join(', ')}`);
    return files;
  };

  try {
    const files = await tryLoad();
    loadedModules.set(moduleId, files);
    return files;
  } catch (firstErr) {
    // If load failed (e.g. corrupt on-disk file from AGP wrapping), delete
    // the file, force re-install from bundled resources, and retry once.
    const info = MODULE_REGISTRY.find((m) => m.id === moduleId);
    if (info?.bundledResource) {
      console.warn(
        `[SWORD] First load of ${moduleId} failed, deleting and re-installing:`,
        firstErr instanceof Error ? firstErr.message : firstErr
      );
      try {
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(path).catch(() => {});
        verifiedInstalled.delete(moduleId);
        await installBundledIfNeeded(moduleId);
        const files = await tryLoad();
        loadedModules.set(moduleId, files);
        return files;
      } catch (retryErr) {
        console.error(
          `[SWORD] Retry also failed for ${moduleId}:`,
          retryErr instanceof Error ? retryErr.message : retryErr
        );
      }
    }
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    throw new BibleApiError(
      `Failed to load ${info?.name ?? moduleId}: ${msg}`,
      'sword'
    );
  }
}

/** Get or create the buffer cache for a module */
function getBufferCache(moduleId: string): Map<string, Uint8Array> {
  let cache = bufferCaches.get(moduleId);
  if (!cache) {
    cache = new Map();
    bufferCaches.set(moduleId, cache);
  }
  return cache;
}

/** Check if a module is bundled with the app (not removable) */
export function isModuleBundled(moduleId: string): boolean {
  return MODULE_REGISTRY.some((m) => m.id === moduleId && !!m.bundledResource);
}

/** Get the module registry entry */
export function getModuleInfo(moduleId: string): SwordModuleInfo | undefined {
  return MODULE_REGISTRY.find((m) => m.id === moduleId);
}

/** Get copyright info for a module */
export function getModuleCopyright(moduleId: string): { text: string; url?: string } | null {
  const info = getModuleInfo(moduleId);
  if (!info?.copyright) return null;
  return { text: info.copyright, url: info.copyrightUrl ?? undefined };
}

/** Get the full list of available modules (for settings UI) */
export function getAvailableModules(): SwordModuleInfo[] {
  return [...MODULE_REGISTRY];
}

/** Check if a module has Strong's number tagging */
export function hasModuleStrongs(moduleId: string): boolean {
  const info = getModuleInfo(moduleId);
  return info?.hasStrongs === true;
}

/** Search result from SWORD module text search */
export interface SwordSearchResult {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  context: string;
  moduleId: string;
}

/**
 * Search a SWORD module's full text directly (no cache needed).
 * Loads the module into memory if not already loaded, then iterates all verses.
 */
export async function searchModuleText(
  moduleId: string,
  query: string,
  limit = 100,
  filterBook?: string,
  filterChapter?: number
): Promise<SwordSearchResult[]> {
  if (!query.trim()) return [];

  const downloaded = await isModuleDownloaded(moduleId);
  if (!downloaded) return [];

  const files = await ensureLoaded(moduleId);
  const bufCache = getBufferCache(moduleId);
  const normalizedQuery = query.toLowerCase();
  const results: SwordSearchResult[] = [];

  const books = filterBook
    ? BIBLE_BOOKS.filter(b => b.id === filterBook)
    : BIBLE_BOOKS;

  for (const book of books) {
    const startChapter = filterChapter ?? 1;
    const endChapter = filterChapter ?? book.chapters;
    for (let ch = startChapter; ch <= endChapter; ch++) {
      const verseCount = getVerseCount(book.id, ch);
      for (let v = 1; v <= verseCount; v++) {
        const raw = getVerseRaw(files, book.id, ch, v, bufCache);
        const text = stripOsis(raw);
        if (!text) continue;

        const lowerText = text.toLowerCase();
        if (lowerText.includes(normalizedQuery)) {
          const index = lowerText.indexOf(normalizedQuery);
          const start = Math.max(0, index - 50);
          const end = Math.min(text.length, index + normalizedQuery.length + 50);
          results.push({
            book: book.id,
            chapter: ch,
            verse: v,
            text,
            context: text.substring(start, end),
            moduleId,
          });
          if (results.length >= limit) return results;
        }
      }
    }
  }

  return results;
}

class SwordClient implements BibleApiClient {
  readonly provider: BibleApiProvider = 'sword';

  isConfigured(): boolean {
    return true; // always available
  }

  configure(_config: ApiConfig): void {
    // no-op — SWORD modules don't need configuration
  }

  async getTranslations(): Promise<ApiTranslation[]> {
    // Return only installed (downloaded) modules
    const translations: ApiTranslation[] = [];
    for (const mod of MODULE_REGISTRY) {
      const downloaded = await isModuleDownloaded(mod.id);
      if (downloaded) {
        translations.push({
          id: mod.id,
          name: mod.name,
          abbreviation: mod.abbreviation,
          language: mod.language,
          provider: 'sword',
          copyright: mod.copyright ?? undefined,
        });
      }
    }
    return translations;
  }

  async getChapter(translationId: string, book: string, chapter: number): Promise<ChapterResponse> {
    const moduleId = translationId.startsWith('sword-') ? translationId : `sword-${translationId}`;
    await ensureModuleReady(moduleId);

    const files = await ensureLoaded(moduleId);
    const bufCache = getBufferCache(moduleId);
    const verseCount = getVerseCount(book, chapter);
    const verses: VerseResponse[] = [];

    for (let v = 1; v <= verseCount; v++) {
      const raw = getVerseRaw(files, book, chapter, v, bufCache);
      const words = raw.includes('lemma="strong:') ? extractWordsWithStrongs(raw) : undefined;
      const text = stripOsis(raw);
      if (v === 1) {
        console.log(`[SWORD] ${moduleId} ${book} ${chapter}:1 raw=${raw.substring(0, 80)}... text=${text.substring(0, 80)}...`);
      }
      if (text) {
        const verse: VerseResponse = { book, chapter, verse: v, text, html: text };
        if (words && words.length > 0) verse.words = words;
        verses.push(verse);
      }
    }
    console.log(`[SWORD] ${moduleId} ${book} ${chapter}: ${verses.length}/${verseCount} verses`);

    if (verseCount > 0 && verses.length === 0) {
      throw new BibleApiError(
        `SWORD module ${moduleId} returned no verses for ${book} ${chapter} (expected ${verseCount}). The module data may be corrupt — try removing and re-downloading it.`,
        'sword'
      );
    }

    const info = getModuleInfo(moduleId);
    return {
      book,
      chapter,
      verses,
      copyright: info?.copyright ?? undefined,
    };
  }

  async getVerse(translationId: string, ref: VerseRef): Promise<VerseResponse> {
    const moduleId = translationId.startsWith('sword-') ? translationId : `sword-${translationId}`;
    const files = await ensureLoaded(moduleId);
    const bufCache = getBufferCache(moduleId);
    const raw = getVerseRaw(files, ref.book, ref.chapter, ref.verse, bufCache);
    const text = stripOsis(raw);
    return { book: ref.book, chapter: ref.chapter, verse: ref.verse, text, html: text };
  }

  async getVerseRange(translationId: string, startRef: VerseRef, endRef: VerseRef): Promise<VerseResponse[]> {
    const moduleId = translationId.startsWith('sword-') ? translationId : `sword-${translationId}`;
    const files = await ensureLoaded(moduleId);
    const bufCache = getBufferCache(moduleId);
    const verses: VerseResponse[] = [];
    for (let v = startRef.verse; v <= endRef.verse; v++) {
      const raw = getVerseRaw(files, startRef.book, startRef.chapter, v, bufCache);
      const text = stripOsis(raw);
      if (text) {
        verses.push({ book: startRef.book, chapter: startRef.chapter, verse: v, text, html: text });
      }
    }
    return verses;
  }
}

export const swordClient = new SwordClient();
