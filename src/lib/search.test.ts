import { describe, it, expect } from 'vitest';
import { parseVerseReference } from './search';

describe('parseVerseReference', () => {
  it('parses OSIS format (Gen.1.1)', () => {
    const result = parseVerseReference('Gen.1.1');
    expect(result).toEqual({ book: 'Gen', chapter: 1, verse: 1 });
  });

  it('parses common format with full name (Genesis 3:16)', () => {
    const result = parseVerseReference('Genesis 3:16');
    expect(result).toEqual({ book: 'Gen', chapter: 3, verse: 16 });
  });

  it('parses common format with short name (Gen 1:1)', () => {
    const result = parseVerseReference('Gen 1:1');
    expect(result).toEqual({ book: 'Gen', chapter: 1, verse: 1 });
  });

  it('parses numbered book (1 John 2:1)', () => {
    const result = parseVerseReference('1 John 2:1');
    expect(result).toEqual({ book: '1John', chapter: 2, verse: 1 });
  });

  it('parses multi-word book name (Song of Solomon 1:1)', () => {
    const result = parseVerseReference('Song of Solomon 1:1');
    expect(result).toEqual({ book: 'Song', chapter: 1, verse: 1 });
  });

  it('handles OSIS format for NT book (Matt.28.20)', () => {
    const result = parseVerseReference('Matt.28.20');
    expect(result).toEqual({ book: 'Matt', chapter: 28, verse: 20 });
  });

  it('parses Revelation reference', () => {
    const result = parseVerseReference('Revelation 22:21');
    expect(result).toEqual({ book: 'Rev', chapter: 22, verse: 21 });
  });

  it('returns null for invalid input', () => {
    expect(parseVerseReference('not a verse')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseVerseReference('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseVerseReference('   ')).toBeNull();
  });

  it('trims whitespace from input', () => {
    const result = parseVerseReference('  Gen.1.1  ');
    expect(result).toEqual({ book: 'Gen', chapter: 1, verse: 1 });
  });
});
