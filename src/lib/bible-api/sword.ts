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
import type { VerseRef } from '@/types';
import { getVerseCount } from '@/types';
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
  downloadUrl: string;
  copyright: string | null;
  copyrightUrl: string | null;
  language: string;
}

/** Hardcoded module registry */
const MODULE_REGISTRY: SwordModuleInfo[] = [
  {
    id: 'sword-NASB',
    name: 'New American Standard Bible (2020)',
    abbreviation: 'NASB',
    downloadUrl: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/NASB.zip',
    copyright: NASB_COPYRIGHT,
    copyrightUrl: LOCKMAN_URL,
    language: 'en',
  },
  {
    id: 'sword-NASB95',
    name: 'New American Standard Bible (1995)',
    abbreviation: 'NASB95',
    downloadUrl: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/NASB95.zip',
    copyright: NASB95_COPYRIGHT,
    copyrightUrl: LOCKMAN_URL,
    language: 'en',
  },
  {
    id: 'sword-KJV',
    name: 'King James Version',
    abbreviation: 'KJV',
    downloadUrl: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/KJV.zip',
    copyright: null,
    copyrightUrl: null,
    language: 'en',
  },
  {
    id: 'sword-ASV',
    name: 'American Standard Version',
    abbreviation: 'ASV',
    downloadUrl: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/ASV.zip',
    copyright: null,
    copyrightUrl: null,
    language: 'en',
  },
];

/** In-memory loaded module files, keyed by module ID */
const loadedModules = new Map<string, SwordModuleFiles>();

/** Per-module decompression buffer caches */
const bufferCaches = new Map<string, Map<string, Uint8Array>>();

/** Strip OSIS XML tags from verse text */
function stripOsis(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
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

/** Check if a module zip exists on disk */
export async function isModuleDownloaded(moduleId: string): Promise<boolean> {
  try {
    const { exists } = await import('@tauri-apps/plugin-fs');
    const path = await getModulePath(moduleId);
    return await exists(path);
  } catch {
    return false;
  }
}

/** Download a module zip to disk via Tauri backend (bypasses CORS) */
export async function downloadModule(
  moduleId: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  const info = MODULE_REGISTRY.find((m) => m.id === moduleId);
  if (!info) throw new Error(`Unknown SWORD module: ${moduleId}`);

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
}

/** Load module files into memory (cached) */
async function ensureLoaded(moduleId: string): Promise<SwordModuleFiles> {
  const cached = loadedModules.get(moduleId);
  if (cached) return cached;

  const { readFile } = await import('@tauri-apps/plugin-fs');
  const path = await getModulePath(moduleId);
  console.log(`[SWORD] Loading module from ${path}`);
  const bytes = await readFile(path);
  console.log(`[SWORD] Read ${bytes.byteLength} bytes`);
  const blob = new Blob([bytes]);
  const { files, meta } = await loadFromZip(blob);
  console.log(`[SWORD] Loaded module: ${meta.name} (${meta.abbreviation}), files: ${Object.keys(files).join(', ')}`);
  loadedModules.set(moduleId, files);
  return files;
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
    const downloaded = await isModuleDownloaded(moduleId);
    if (!downloaded) {
      throw new BibleApiError(
        `Module ${moduleId} is not downloaded. Download it in Settings.`,
        'sword'
      );
    }

    const files = await ensureLoaded(moduleId);
    const bufCache = getBufferCache(moduleId);
    const verseCount = getVerseCount(book, chapter);
    const verses: VerseResponse[] = [];

    for (let v = 1; v <= verseCount; v++) {
      const raw = getVerseRaw(files, book, chapter, v, bufCache);
      const text = stripOsis(raw);
      if (v === 1) {
        console.log(`[SWORD] ${moduleId} ${book} ${chapter}:1 raw=${raw.substring(0, 80)}... text=${text.substring(0, 80)}...`);
      }
      if (text) {
        verses.push({ book, chapter, verse: v, text, html: text });
      }
    }
    console.log(`[SWORD] ${moduleId} ${book} ${chapter}: ${verses.length}/${verseCount} verses`);

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
