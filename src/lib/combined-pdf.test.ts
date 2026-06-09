import { describe, expect, it } from 'vitest';
import { buildChapterAndStudyPdf, chapterAndStudyFilename } from './combined-pdf';
import type { BuildPassagePdfInput } from './passage-pdf';
import type { ApiTranslation } from '@/lib/bible-api';
import type { Study } from '@/types';

const NASB: ApiTranslation = {
  id: 'sword-NASB', name: 'New American Standard Bible 2020', abbreviation: 'NASB', language: 'en', provider: 'sword',
};

const study: Study = { id: 's1', name: 'John — Abide', book: 'John', isActive: true, createdAt: new Date(0), updatedAt: new Date(0) };

const passage: BuildPassagePdfInput = {
  translation: NASB,
  book: 'John',
  chapter: 3,
  verses: [{ ref: { book: 'John', chapter: 3, verse: 16 }, text: 'For God so loved the world' }],
  annotations: [],
  notes: [],
  sectionHeadings: [],
  chapterTitle: null,
};

describe('chapterAndStudyFilename', () => {
  it('joins the passage base with the study book name', () => {
    expect(chapterAndStudyFilename(passage, study)).toBe('John-3-and-John-study.pdf');
  });
});

describe('buildChapterAndStudyPdf', () => {
  it('renders both the passage and the study report into one PDF', async () => {
    const bytes = await buildChapterAndStudyPdf(passage, study);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(bytes.length).toBeGreaterThan(1000);
    // Passage title/header carries the range label; the study section its name.
    expect(text).toContain('John');
    expect(text).toContain('Abide');
  });
});
