import { describe, it, expect } from 'vitest';
import {
  getTestamentIndex,
  parseConf,
  discoverFiles,
  readVerseIndex,
  readBufferSizes,
} from './sword-ztext';
import type { SwordModuleFiles, TestamentFiles } from './sword-ztext';

describe('getTestamentIndex', () => {
  it('returns testament 1 for OT book (Genesis)', () => {
    const result = getTestamentIndex('Gen', 1, 1);
    expect(result.testament).toBe(1);
  });

  it('returns testament 2 for NT book (Matthew)', () => {
    const result = getTestamentIndex('Matt', 1, 1);
    expect(result.testament).toBe(2);
  });

  it('returns index 0 for Gen 1:1', () => {
    const result = getTestamentIndex('Gen', 1, 1);
    expect(result.index).toBe(0);
  });

  it('returns index 1 for Gen 1:2', () => {
    const result = getTestamentIndex('Gen', 1, 2);
    expect(result.index).toBe(1);
  });

  it('accumulates verse offsets across chapters', () => {
    // Gen 1 has 31 verses, so Gen 2:1 should be index 31
    const result = getTestamentIndex('Gen', 2, 1);
    expect(result.index).toBe(31);
  });

  it('returns index 0 for Matt 1:1 (NT resets)', () => {
    const result = getTestamentIndex('Matt', 1, 1);
    expect(result.index).toBe(0);
  });

  it('handles unknown book gracefully', () => {
    const result = getTestamentIndex('Unknown', 1, 1);
    expect(result.testament).toBe(1);
    expect(result.index).toBe(0);
  });
});

describe('parseConf', () => {
  function makeConf(text: string): SwordModuleFiles {
    const encoder = new TextEncoder();
    return { 'module.conf': encoder.encode(text).buffer };
  }

  it('parses Description and Abbreviation', () => {
    const files = makeConf('[KJV]\nDescription=King James Version\nAbbreviation=KJV\nLang=en\n');
    const meta = parseConf(files);
    expect(meta.name).toBe('King James Version');
    expect(meta.abbreviation).toBe('KJV');
    expect(meta.id).toBe('sword-KJV');
    expect(meta.language).toBe('en');
  });

  it('returns defaults for missing fields', () => {
    const files = makeConf('[MOD]\n');
    const meta = parseConf(files);
    expect(meta.name).toBe('SWORD Module');
    expect(meta.abbreviation).toBe('SWORD');
  });

  it('returns defaults when no .conf file exists', () => {
    const meta = parseConf({ 'ot.bzv': new ArrayBuffer(0) });
    expect(meta.name).toBe('Unknown');
    expect(meta.abbreviation).toBe('SWORD');
  });
});

describe('discoverFiles', () => {
  it('discovers .vzv/.vzs/.vzz files', () => {
    const files: SwordModuleFiles = {
      'ot.vzv': new ArrayBuffer(0),
      'ot.vzs': new ArrayBuffer(0),
      'ot.vzz': new ArrayBuffer(0),
      'nt.vzv': new ArrayBuffer(0),
      'nt.vzs': new ArrayBuffer(0),
      'nt.vzz': new ArrayBuffer(0),
    };
    const result = discoverFiles(files);
    expect(result).not.toBeNull();
    expect(result!.ot.verseIndex).toBe('ot.vzv');
    expect(result!.nt.data).toBe('nt.vzz');
  });

  it('discovers .bzv/.bzs/.bzz files', () => {
    const files: SwordModuleFiles = {
      'ot.bzv': new ArrayBuffer(0),
      'ot.bzs': new ArrayBuffer(0),
      'ot.bzz': new ArrayBuffer(0),
      'nt.bzv': new ArrayBuffer(0),
      'nt.bzs': new ArrayBuffer(0),
      'nt.bzz': new ArrayBuffer(0),
    };
    const result = discoverFiles(files);
    expect(result).not.toBeNull();
    expect(result!.ot.verseIndex).toBe('ot.bzv');
  });

  it('discovers .idx/.bzs/.dat files', () => {
    const files: SwordModuleFiles = {
      'ot.idx': new ArrayBuffer(0),
      'ot.bzs': new ArrayBuffer(0),
      'ot.dat': new ArrayBuffer(0),
      'nt.idx': new ArrayBuffer(0),
      'nt.bzs': new ArrayBuffer(0),
      'nt.dat': new ArrayBuffer(0),
    };
    const result = discoverFiles(files);
    expect(result).not.toBeNull();
  });

  it('returns null when files are missing', () => {
    const files: SwordModuleFiles = {
      'ot.vzv': new ArrayBuffer(0),
    };
    expect(discoverFiles(files)).toBeNull();
  });

  it('returns null for empty file map', () => {
    expect(discoverFiles({})).toBeNull();
  });
});

describe('readVerseIndex', () => {
  function makeVerseIndexLE(bufferNum: number, verseStart: number, verseLen: number): ArrayBuffer {
    const buf = new ArrayBuffer(10);
    const view = new DataView(buf);
    view.setUint32(0, bufferNum, true);
    view.setUint32(4, verseStart, true);
    view.setUint16(8, verseLen, true);
    return buf;
  }

  function makeVerseIndexBE(bufferNum: number, verseStart: number, verseLen: number): ArrayBuffer {
    const buf = new ArrayBuffer(10);
    const view = new DataView(buf);
    view.setUint32(0, bufferNum, false);
    view.setUint32(4, verseStart, false);
    view.setUint16(8, verseLen, false);
    return buf;
  }

  it('reads little-endian verse index (.bzv)', () => {
    const files: SwordModuleFiles = { 'ot.bzv': makeVerseIndexLE(5, 100, 42) };
    const tf: TestamentFiles = { verseIndex: 'ot.bzv', bufferIndex: 'ot.bzs', data: 'ot.bzz' };
    const result = readVerseIndex(files, tf, 0);
    expect(result).toEqual({ bufferNum: 5, verseStart: 100, verseLen: 42 });
  });

  it('reads big-endian verse index (.idx)', () => {
    const files: SwordModuleFiles = { 'ot.idx': makeVerseIndexBE(5, 100, 42) };
    const tf: TestamentFiles = { verseIndex: 'ot.idx', bufferIndex: 'ot.bzs', data: 'ot.dat' };
    const result = readVerseIndex(files, tf, 0);
    expect(result).toEqual({ bufferNum: 5, verseStart: 100, verseLen: 42 });
  });

  it('returns zeros for out-of-bounds index', () => {
    const files: SwordModuleFiles = { 'ot.bzv': new ArrayBuffer(10) };
    const tf: TestamentFiles = { verseIndex: 'ot.bzv', bufferIndex: 'ot.bzs', data: 'ot.bzz' };
    const result = readVerseIndex(files, tf, 999);
    expect(result).toEqual({ bufferNum: 0, verseStart: 0, verseLen: 0 });
  });

  it('returns zeros for missing file', () => {
    const files: SwordModuleFiles = {};
    const tf: TestamentFiles = { verseIndex: 'ot.bzv', bufferIndex: 'ot.bzs', data: 'ot.bzz' };
    const result = readVerseIndex(files, tf, 0);
    expect(result).toEqual({ bufferNum: 0, verseStart: 0, verseLen: 0 });
  });
});

describe('readBufferSizes', () => {
  function makeBufferSizesLE(offset: number, compSize: number, uncompSize: number): ArrayBuffer {
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setUint32(0, offset, true);
    view.setUint32(4, compSize, true);
    view.setUint32(8, uncompSize, true);
    return buf;
  }

  function makeBufferSizesBE(offset: number, compSize: number, uncompSize: number): ArrayBuffer {
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setUint32(0, offset, false);
    view.setUint32(4, compSize, false);
    view.setUint32(8, uncompSize, false);
    return buf;
  }

  it('reads little-endian buffer sizes (.bzs with .bzv)', () => {
    const files: SwordModuleFiles = { 'ot.bzs': makeBufferSizesLE(200, 150, 300) };
    const tf: TestamentFiles = { verseIndex: 'ot.bzv', bufferIndex: 'ot.bzs', data: 'ot.bzz' };
    const result = readBufferSizes(files, tf, 0);
    expect(result).toEqual({ offset: 200, compSize: 150, uncompSize: 300 });
  });

  it('reads big-endian buffer sizes (.bzs with .idx)', () => {
    const files: SwordModuleFiles = { 'ot.bzs': makeBufferSizesBE(200, 150, 300) };
    const tf: TestamentFiles = { verseIndex: 'ot.idx', bufferIndex: 'ot.bzs', data: 'ot.dat' };
    const result = readBufferSizes(files, tf, 0);
    expect(result).toEqual({ offset: 200, compSize: 150, uncompSize: 300 });
  });

  it('returns zeros for out-of-bounds bufferNum', () => {
    const files: SwordModuleFiles = { 'ot.bzs': new ArrayBuffer(12) };
    const tf: TestamentFiles = { verseIndex: 'ot.bzv', bufferIndex: 'ot.bzs', data: 'ot.bzz' };
    const result = readBufferSizes(files, tf, 999);
    expect(result).toEqual({ offset: 0, compSize: 0, uncompSize: 0 });
  });

  it('returns zeros for missing file', () => {
    const files: SwordModuleFiles = {};
    const tf: TestamentFiles = { verseIndex: 'ot.bzv', bufferIndex: 'ot.bzs', data: 'ot.bzz' };
    const result = readBufferSizes(files, tf, 0);
    expect(result).toEqual({ offset: 0, compSize: 0, uncompSize: 0 });
  });
});
