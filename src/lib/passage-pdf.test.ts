/**
 * Tests for passage-pdf pure helpers. The PDF generation itself depends on
 * pdfmake's runtime + a font bundle and is exercised manually in the app.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Annotation } from '@/types';
import type { JsPDFDoc } from '@/lib/pdf/page-writer';
import { makeHighlightAnnotation, makeMarkingPreset, makeVerseRef } from '@/lib/__test__/factories';
import { formatRangeLabel, getTranslationAttribution, renderPassageIntoDoc } from './passage-pdf';
import type { ApiTranslation } from '@/lib/bible-api';

const { renderedAnnotations } = vi.hoisted(() => ({ renderedAnnotations: { current: [] as Annotation[] } }));

vi.mock('@/lib/pdf/symbol-cache', () => ({
  iconCacheKey: () => '',
  buildIconCache: async (perVerse: Annotation[][]) => {
    renderedAnnotations.current = perVerse.flat();
    throw new Error('stop after the annotation pass');
  },
}));

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

describe('renderPassageIntoDoc study filter', () => {
  const doc = {
    getNumberOfPages: () => 1,
    internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } },
  } as unknown as JsPDFDoc;

  async function renderedIds(activeStudyId: string | null): Promise<string[]> {
    renderedAnnotations.current = [];
    await expect(
      renderPassageIntoDoc(doc, {
        translation: NASB,
        book: 'Gen',
        chapter: 1,
        verses: [{ ref: makeVerseRef(), text: 'In the beginning' }],
        annotations: [
          makeHighlightAnnotation({ id: 'plain' }),
          makeHighlightAnnotation({ id: 'romans-only', studyId: 'study-1' }),
          makeHighlightAnnotation({ id: 'via-preset', presetId: 'preset-study' }),
        ],
        notes: [],
        sectionHeadings: [],
        chapterTitle: null,
        presets: [makeMarkingPreset({ id: 'preset-study', word: undefined, studyId: 'study-1' })],
        activeStudyId,
      })
    ).rejects.toThrow('stop after the annotation pass');
    return renderedAnnotations.current.map((a) => a.id).sort();
  }

  it('leaves out annotations that belong to a study that is not in effect', async () => {
    expect(await renderedIds(null)).toEqual(['plain']);
  });

  it('keeps the selected study\'s annotations and hides no-study plain highlights', async () => {
    expect(await renderedIds('study-1')).toEqual(['romans-only', 'via-preset']);
  });
});
