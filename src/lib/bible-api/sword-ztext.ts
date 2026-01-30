/**
 * SWORD zText module reader
 *
 * Minimal in-house reader for SWORD zText Bibles: parse .conf, read .idx/.bzs/.dat
 * (or .vzv/.vzs/.vzz), decompress with pako (zlib), map (book, chapter, verse) to verse text.
 */

import JSZip from 'jszip';
import pako from 'pako';
import { BIBLE_BOOKS, getVerseCount } from '@/types/bible';

/** Map of filename (lowercase) to file content */
export type SwordModuleFiles = Record<string, ArrayBuffer>;

export interface SwordModuleMeta {
  name: string;
  abbreviation: string;
  id: string;
  language?: string;
}

/** File set for one testament (OT or NT) */
export interface TestamentFiles {
  verseIndex: string;  // e.g. "ot.vzv"
  bufferIndex: string; // e.g. "ot.vzs"
  data: string;        // e.g. "ot.vzz"
}

/** Result of loadFromZip */
export interface LoadedSwordModule {
  meta: SwordModuleMeta;
  files: SwordModuleFiles;
}

/** 1 = OT, 2 = NT (matches SWORD testament) */
export type Testament = 1 | 2;

/** Read big-endian uint32 from buffer at offset */
function readU32BE(buf: ArrayBuffer, offset: number): number {
  const v = new DataView(buf);
  return v.getUint32(offset, false);
}

/** Read big-endian uint16 from buffer at offset */
function readU16BE(buf: ArrayBuffer, offset: number): number {
  const v = new DataView(buf);
  return v.getUint16(offset, false);
}

/** Read little-endian uint32 (SWORD .bzv/.bzs use little-endian) */
function readU32LE(buf: ArrayBuffer, offset: number): number {
  const v = new DataView(buf);
  return v.getUint32(offset, true);
}

/** Read little-endian uint16 */
function readU16LE(buf: ArrayBuffer, offset: number): number {
  const v = new DataView(buf);
  return v.getUint16(offset, true);
}

/**
 * Get testament (1=OT, 2=NT) and 0-based linear verse index within that testament.
 * Uses BIBLE_BOOKS order and KJV_VERSE_COUNTS (KJV versification).
 */
export function getTestamentIndex(
  book: string,
  chapter: number,
  verse: number
): { testament: Testament; index: number } {
  const bookInfo = BIBLE_BOOKS.find((b) => b.id === book);
  if (!bookInfo) {
    return { testament: 1, index: 0 };
  }
  const testament: Testament = bookInfo.order <= 39 ? 1 : 2;
  let index = 0;
  for (const b of BIBLE_BOOKS) {
    if (b.testament !== (testament === 1 ? 'OT' : 'NT')) continue;
    if (b.order < bookInfo.order) {
      for (let c = 1; c <= b.chapters; c++) {
        index += getVerseCount(b.id, c);
      }
    } else if (b.id === book) {
      for (let c = 1; c < chapter; c++) {
        index += getVerseCount(book, c);
      }
      index += verse - 1;
      break;
    }
  }
  return { testament, index };
}

/**
 * 1-based chapter index within testament (Gen 1 = 1, Gen 2 = 2, ..., Exod 1 = 51, ..., Matt 1 = 1, ...).
 * Used to compute preamble offset for .bzv modules (chapter title/number entries).
 */
function getChapterIndexInTestament(book: string, chapter: number): number {
  const bookInfo = BIBLE_BOOKS.find((b) => b.id === book);
  if (!bookInfo) return 1;
  const testament = bookInfo.order <= 39 ? 'OT' : 'NT';
  let n = 0;
  for (const b of BIBLE_BOOKS) {
    if (b.testament !== testament) continue;
    if (b.order < bookInfo.order) {
      n += b.chapters;
    } else if (b.id === book) {
      n += chapter;
      break;
    }
  }
  return n;
}

/**
 * Preamble offset for .bzv/.bzs/.bzz (CrossWire KJV): first chapter of testament has 4
 * extra entries (blank, blank, title, number); each other chapter has 2 (title, number).
 */
function bzvPreambleOffset(verseIndexKey: string, book: string, chapter: number): number {
  if (!verseIndexKey.toLowerCase().endsWith('.bzv')) return 0;
  const chapterIndex = getChapterIndexInTestament(book, chapter);
  return 4 + 2 * (chapterIndex - 1);
}

/**
 * Parse INI-style .conf from file map. Returns meta for display and stable id.
 */
export function parseConf(files: SwordModuleFiles): SwordModuleMeta {
  const confKey = Object.keys(files).find((k) => k.toLowerCase().endsWith('.conf'));
  if (!confKey) {
    return { name: 'Unknown', abbreviation: 'SWORD', id: 'sword-unknown' };
  }
  const buf = files[confKey];
  const text = new TextDecoder('utf-8').decode(buf);
  const lines = text.split(/\r?\n/);
  const data: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('[')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    data[key] = value;
  }
  const description = data['Description'] ?? data['description'] ?? 'SWORD Module';
  const abbreviation = data['Abbreviation'] ?? data['abbreviation'] ?? 'SWORD';
  const lang = data['Lang'] ?? data['lang'] ?? 'en';
  const id = `sword-${abbreviation}`;
  return {
    name: description,
    abbreviation,
    id,
    language: lang,
  };
}

/**
 * Discover OT/NT file pairs. Supports .vzv/.vzs/.vzz, .bzv/.bzs/.bzz, and .idx/.bzs/.dat naming.
 */
export function discoverFiles(files: SwordModuleFiles): { ot: TestamentFiles; nt: TestamentFiles } | null {
  const keys = Object.keys(files).map((k) => k.toLowerCase());
  const has = (base: string, ext: string) => keys.some((k) => k === `${base}.${ext}` || k.endsWith(`/${base}.${ext}`));
  const get = (base: string, ext: string) => {
    const found = Object.keys(files).find(
      (k) => k.toLowerCase() === `${base}.${ext}` || k.toLowerCase().endsWith(`/${base}.${ext}`)
    );
    return found ?? '';
  };
  // Try .vzv/.vzs/.vzz (zVerse chapter blocks)
  if (has('ot', 'vzv') && has('ot', 'vzs') && has('ot', 'vzz') && has('nt', 'vzv') && has('nt', 'vzs') && has('nt', 'vzz')) {
    return {
      ot: { verseIndex: get('ot', 'vzv'), bufferIndex: get('ot', 'vzs'), data: get('ot', 'vzz') },
      nt: { verseIndex: get('nt', 'vzv'), bufferIndex: get('nt', 'vzs'), data: get('nt', 'vzz') },
    };
  }
  // Try .bzv/.bzs/.bzz (CrossWire KJV and similar; same layout as zVerse)
  if (has('ot', 'bzv') && has('ot', 'bzs') && has('ot', 'bzz') && has('nt', 'bzv') && has('nt', 'bzs') && has('nt', 'bzz')) {
    return {
      ot: { verseIndex: get('ot', 'bzv'), bufferIndex: get('ot', 'bzs'), data: get('ot', 'bzz') },
      nt: { verseIndex: get('nt', 'bzv'), bufferIndex: get('nt', 'bzs'), data: get('nt', 'bzz') },
    };
  }
  // Try .idx/.bzs/.dat (alternative naming - same layout)
  if (has('ot', 'idx') && has('ot', 'bzs') && has('ot', 'dat') && has('nt', 'idx') && has('nt', 'bzs') && has('nt', 'dat')) {
    return {
      ot: { verseIndex: get('ot', 'idx'), bufferIndex: get('ot', 'bzs'), data: get('ot', 'dat') },
      nt: { verseIndex: get('nt', 'idx'), bufferIndex: get('nt', 'bzs'), data: get('nt', 'dat') },
    };
  }
  return null;
}

function getFileByKey(files: SwordModuleFiles, key: string): ArrayBuffer | undefined {
  const lower = key.toLowerCase();
  const found = Object.entries(files).find(
    ([k]) => k.toLowerCase() === lower || k.toLowerCase().endsWith('/' + lower)
  );
  return found?.[1];
}

/** True if this file set uses little-endian (CrossWire .bzv/.bzs/.bzz). */
function isLittleEndian(testamentFiles: TestamentFiles): boolean {
  const v = testamentFiles.verseIndex.toLowerCase();
  return v.endsWith('.bzv') || v.endsWith('.vzv');
}

/**
 * Read 10-byte verse index record at index.
 * CrossWire .bzv uses little-endian; .vzv/.idx use big-endian.
 */
export function readVerseIndex(
  files: SwordModuleFiles,
  testamentFiles: TestamentFiles,
  index: number
): { bufferNum: number; verseStart: number; verseLen: number } {
  const buf = getFileByKey(files, testamentFiles.verseIndex);
  if (!buf || buf.byteLength < (index + 1) * 10) {
    return { bufferNum: 0, verseStart: 0, verseLen: 0 };
  }
  const offset = index * 10;
  const le = isLittleEndian(testamentFiles);
  return {
    bufferNum: le ? readU32LE(buf, offset) : readU32BE(buf, offset),
    verseStart: le ? readU32LE(buf, offset + 4) : readU32BE(buf, offset + 4),
    verseLen: le ? readU16LE(buf, offset + 8) : readU16BE(buf, offset + 8),
  };
}

/**
 * Read 12-byte buffer sizes record at bufferNum.
 * CrossWire .bzs uses little-endian; .vzs/.bzs (with .idx) use big-endian.
 */
export function readBufferSizes(
  files: SwordModuleFiles,
  testamentFiles: TestamentFiles,
  bufferNum: number
): { offset: number; compSize: number; uncompSize: number } {
  const buf = getFileByKey(files, testamentFiles.bufferIndex);
  if (!buf || buf.byteLength < (bufferNum + 1) * 12) {
    return { offset: 0, compSize: 0, uncompSize: 0 };
  }
  const offset = bufferNum * 12;
  const le = isLittleEndian(testamentFiles);
  return {
    offset: le ? readU32LE(buf, offset) : readU32BE(buf, offset),
    compSize: le ? readU32LE(buf, offset + 4) : readU32BE(buf, offset + 4),
    uncompSize: le ? readU32LE(buf, offset + 8) : readU32BE(buf, offset + 8),
  };
}

/**
 * Decompress a block from the data file (zlib). rawZFilter is no-op for unencrypted modules.
 */
export function decompressBuffer(
  dataFile: ArrayBuffer,
  offset: number,
  compSize: number
): Uint8Array {
  const slice = dataFile.slice(offset, offset + compSize);
  return pako.inflate(new Uint8Array(slice));
}

/**
 * Get raw OSIS verse text for (book, chapter, verse). Uses optional cache per (testament, bufferNum).
 * verseStart/verseLen in .bzv are byte offsets into the uncompressed buffer; we slice by bytes then decode.
 */
export function getVerseRaw(
  files: SwordModuleFiles,
  book: string,
  chapter: number,
  verse: number,
  bufferCache?: Map<string, Uint8Array>
): string {
  const discovered = discoverFiles(files);
  if (!discovered) return '';
  const { testament, index: linearIndex } = getTestamentIndex(book, chapter, verse);
  const testamentFiles = testament === 1 ? discovered.ot : discovered.nt;
  const preambleOffset = bzvPreambleOffset(testamentFiles.verseIndex, book, chapter);
  const index = linearIndex + preambleOffset;
  const { bufferNum, verseStart, verseLen } = readVerseIndex(files, testamentFiles, index);
  if (verseLen === 0) return '';
  const cacheKey = bufferCache ? `${testament}:${bufferNum}` : null;
  if (bufferCache && cacheKey) {
    const cached = bufferCache.get(cacheKey);
    if (cached !== undefined) {
      const verseBytes = cached.subarray(verseStart, verseStart + verseLen);
      return new TextDecoder('utf-8').decode(verseBytes);
    }
  }
  const { offset, compSize } = readBufferSizes(files, testamentFiles, bufferNum);
  const dataBuf = getFileByKey(files, testamentFiles.data);
  if (!dataBuf) return '';
  const uncompressed = decompressBuffer(dataBuf, offset, compSize);
  if (bufferCache && cacheKey) {
    bufferCache.set(cacheKey, uncompressed);
  }
  const verseBytes = uncompressed.subarray(verseStart, verseStart + verseLen);
  return new TextDecoder('utf-8').decode(verseBytes);
}

/**
 * Load and validate a SWORD module from a zip blob. Returns meta and file map.
 */
/**
 * Normalize zip entry path and return the filename for use as key.
 * CrossWire rawzip can use full paths like "modules/texts/ztext/KJV/ot.idx";
 * we key by last segment so discoverFiles finds ot.idx, nt.idx, etc.
 */
function zipPathToKey(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
  const segments = normalized.split('/');
  return segments[segments.length - 1] ?? path;
}

export async function loadFromZip(zipBlob: Blob): Promise<LoadedSwordModule> {
  const zip = await JSZip.loadAsync(zipBlob);
  const files: SwordModuleFiles = {};
  const addEntry = async (path: string, entry: JSZip.JSZipObject) => {
    if (entry.dir) return;
    const buf = await entry.async('arraybuffer');
    const key = zipPathToKey(path);
    files[key] = buf;
  };
  const entries: [string, JSZip.JSZipObject][] = [];
  zip.forEach((path, entry) => entries.push([path, entry]));
  for (const [path, entry] of entries) {
    await addEntry(path, entry);
  }
  if (!Object.keys(files).some((k) => k.toLowerCase().endsWith('.conf'))) {
    throw new Error('SWORD zip: no .conf file found');
  }
  if (!discoverFiles(files)) {
    const keys = Object.keys(files).join(', ');
    throw new Error(
      `SWORD zip: could not find OT/NT data files (.vzv/.vzs/.vzz, .bzv/.bzs/.bzz, or .idx/.bzs/.dat). Found: ${keys}`
    );
  }
  const meta = parseConf(files);
  return { meta, files };
}
