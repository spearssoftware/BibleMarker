/**
 * Tests for passage-pdf pure helpers. The PDF generation itself depends on
 * pdfmake's runtime + a font bundle and is exercised manually in the app.
 */

import { describe, expect, it } from 'vitest';
import { formatRangeLabel, getTranslationAttribution } from './passage-pdf';
import type { ApiTranslation } from '@/lib/bible-api';

const ESV: ApiTranslation = {
  id: 'ESV',
  name: 'English Standard Version',
  abbreviation: 'ESV',
  language: 'en',
  provider: 'esv',
};

const NASB: ApiTranslation = {
  id: 'sword-NASB',
  name: 'New American Standard Bible 2020',
  abbreviation: 'NASB',
  language: 'en',
  provider: 'sword',
};

const KJV: ApiTranslation = {
  id: 'sword-KJV',
  name: 'King James Version',
  abbreviation: 'KJV',
  language: 'en',
  provider: 'sword',
};

describe('getTranslationAttribution', () => {
  it('returns ESV Crossway copyright for ESV', () => {
    expect(getTranslationAttribution(ESV)).toMatch(/Crossway/);
  });

  it('returns NASB Lockman copyright for NASB', () => {
    expect(getTranslationAttribution(NASB)).toMatch(/Lockman/);
  });

  it('falls back to a public-domain line for modules with no copyright', () => {
    expect(getTranslationAttribution(KJV)).toMatch(/public domain/);
  });
});

describe('formatRangeLabel', () => {
  it('returns book + chapter when no range is given', () => {
    expect(formatRangeLabel('John', 3)).toBe('John 3');
  });

  it('returns book + chapter:verse for a single-verse range', () => {
    expect(formatRangeLabel('John', 3, { start: 16, end: 16 })).toBe('John 3:16');
  });

  it('returns book + chapter:start–end for a multi-verse range', () => {
    expect(formatRangeLabel('John', 3, { start: 5, end: 12 })).toBe('John 3:5–12');
  });

  it('resolves OSIS book id to full name', () => {
    expect(formatRangeLabel('1Cor', 13)).toBe('1 Corinthians 13');
  });
});
