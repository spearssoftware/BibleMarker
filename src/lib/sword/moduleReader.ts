/**
 * SWORD Module Reader
 * 
 * Reads Bible text from SWORD modules stored in IndexedDB.
 * Supports zText (compressed) and RawText (uncompressed) formats.
 */

import type { 
  SwordModuleConfig, 
  Chapter, 
  Verse, 
  VerseRef 
} from '@/types/sword';
import { getVerseCount, getChapterIndex } from './verseKey';
import { parseVerseMarkup } from './osisParser';
import { db } from '@/lib/db';

/** Module data stored in IndexedDB */
interface ModuleData {
  /** Book/chapter/verse index entries */
  index: {
    ot: Uint8Array;    // Old Testament index
    nt: Uint8Array;    // New Testament index
  };
  /** Compressed text blocks */
  blocks: Map<number, Uint8Array>;
}

/** Cache of loaded module data */
const moduleCache = new Map<string, ModuleData>();

/**
 * Read a chapter from a SWORD module
 */
export async function readChapter(
  moduleId: string, 
  book: string, 
  chapter: number
): Promise<Chapter> {
  const config = await db.modules.get(moduleId);
  if (!config) {
    throw new Error(`Module not found: ${moduleId}`);
  }

  const verseCount = getVerseCount(book, chapter);
  const verses: Verse[] = [];

  for (let v = 1; v <= verseCount; v++) {
    const ref: VerseRef = { book, chapter, verse: v };
    try {
      const text = await readVerse(moduleId, ref, config.config);
      const parsed = parseVerseMarkup(text, config.config.sourceType);
      verses.push({
        ref,
        text: parsed.text,
        html: parsed.html,
      });
    } catch {
      // Verse might not exist in this versification
      verses.push({
        ref,
        text: '',
        html: '',
      });
    }
  }

  return { book, chapter, verses };
}

/**
 * Read a single verse from a SWORD module
 */
export async function readVerse(
  moduleId: string,
  ref: VerseRef,
  config?: SwordModuleConfig
): Promise<string> {
  if (!config) {
    const mod = await db.modules.get(moduleId);
    if (!mod) throw new Error(`Module not found: ${moduleId}`);
    config = mod.config;
  }

  // For now, return placeholder - actual implementation requires
  // reading binary index and text files from IndexedDB
  const moduleData = await getModuleData(moduleId);
  
  if (config.modDrv === 'zText') {
    return readZTextVerse(moduleData, ref, config);
  } else if (config.modDrv === 'RawText') {
    return readRawTextVerse(moduleData, ref, config);
  }
  
  throw new Error(`Unsupported module driver: ${config.modDrv}`);
}

/**
 * Get module data from cache or load from IndexedDB
 */
async function getModuleData(moduleId: string): Promise<ModuleData> {
  if (moduleCache.has(moduleId)) {
    return moduleCache.get(moduleId)!;
  }

  // Load from IndexedDB
  const files = await db.moduleFiles
    .where('moduleId')
    .equals(moduleId)
    .toArray();

  const data: ModuleData = {
    index: {
      ot: new Uint8Array(0),
      nt: new Uint8Array(0),
    },
    blocks: new Map(),
  };

  for (const file of files) {
    if (file.path.endsWith('ot.bzs') || file.path.endsWith('ot.czs')) {
      data.index.ot = new Uint8Array(file.data);
    } else if (file.path.endsWith('nt.bzs') || file.path.endsWith('nt.czs')) {
      data.index.nt = new Uint8Array(file.data);
    }
    // Store other files for block reading
  }

  moduleCache.set(moduleId, data);
  return data;
}

/**
 * Read verse from zText (compressed) module
 * 
 * zText modules have:
 * - ot.bzs / nt.bzs: Block start index (4 bytes per block)
 * - ot.bzv / nt.bzv: Verse index within block (10 bytes per verse)
 * - ot.bzz / nt.bzz: Compressed text blocks
 */
async function readZTextVerse(
  _data: ModuleData,
  ref: VerseRef,
  config: SwordModuleConfig
): Promise<string> {
  // This is a simplified implementation
  // Full implementation would:
  // 1. Calculate verse index
  // 2. Read verse entry from bzv file (block num, offset, size)
  // 3. Read and decompress the block from bzz
  // 4. Extract verse text from decompressed block
  
  // For MVP, we'll use a simpler approach: pre-processed JSON
  const chapterData = await db.chapterCache.get(
    `${config.name}:${ref.book}:${ref.chapter}`
  );
  
  if (chapterData?.verses[ref.verse]) {
    return chapterData.verses[ref.verse];
  }
  
  return '';
}

/**
 * Read verse from RawText (uncompressed) module
 * 
 * RawText modules have:
 * - ot.vss / nt.vss: Verse index (6 bytes per verse: 4 byte offset + 2 byte size)
 * - ot / nt: Raw text file
 */
async function readRawTextVerse(
  _data: ModuleData,
  ref: VerseRef,
  config: SwordModuleConfig
): Promise<string> {
  // Similar to zText but without decompression
  const chapterData = await db.chapterCache.get(
    `${config.name}:${ref.book}:${ref.chapter}`
  );
  
  if (chapterData?.verses[ref.verse]) {
    return chapterData.verses[ref.verse];
  }
  
  return '';
}

/**
 * Import a chapter's text directly (for bootstrapping/testing)
 */
export async function importChapterText(
  moduleId: string,
  book: string,
  chapter: number,
  verses: Record<number, string>
): Promise<void> {
  await db.chapterCache.put({
    id: `${moduleId}:${book}:${chapter}`,
    moduleId,
    book,
    chapter,
    verses,
    cachedAt: new Date(),
  });
}

/**
 * Clear module from cache
 */
export function clearModuleCache(moduleId: string): void {
  moduleCache.delete(moduleId);
}

/**
 * Check if a module is fully loaded and readable
 */
export async function isModuleReady(moduleId: string): Promise<boolean> {
  const mod = await db.modules.get(moduleId);
  return mod?.status === 'installed';
}

/**
 * Get list of available books in a module
 * (Some modules may not have all 66 books)
 */
export async function getAvailableBooks(moduleId: string): Promise<string[]> {
  const chapters = await db.chapterCache
    .where('moduleId')
    .equals(moduleId)
    .toArray();
  
  const books = new Set(chapters.map(c => c.book));
  return Array.from(books);
}
