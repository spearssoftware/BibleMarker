/**
 * Tests for passage-export formatter.
 * IO helpers (printPassage, copyPassage) depend on DOM/Clipboard APIs and
 * are covered manually in the browser.
 */

import { describe, expect, it } from 'vitest';
import { formatPassageAsHtml, getTranslationAttribution } from './passage-export';
import type { ApiTranslation } from '@/lib/bible-api';
import type { Annotation, ChapterTitle, Note, SectionHeading, Verse } from '@/types';

const ESV: ApiTranslation = {
  id: 'ESV',
  name: 'English Standard Version',
  abbreviation: 'ESV',
  language: 'en',
  provider: 'esv',
};

const PUBLIC_DOMAIN: ApiTranslation = {
  id: 'sword-KJV',
  name: 'King James Version',
  abbreviation: 'KJV',
  language: 'en',
  provider: 'sword',
};

const NASB: ApiTranslation = {
  id: 'sword-NASB',
  name: 'New American Standard Bible 2020',
  abbreviation: 'NASB',
  language: 'en',
  provider: 'sword',
};

function makeVerses(count: number, start = 1): Verse[] {
  return Array.from({ length: count }, (_, i) => {
    const v = start + i;
    return { ref: { book: 'John', chapter: 3, verse: v }, text: `Verse ${v} text.` };
  });
}

describe('formatPassageAsHtml', () => {
  it('renders an entire chapter with header, verses, and attribution', () => {
    const out = formatPassageAsHtml({
      translation: ESV,
      book: 'John',
      chapter: 3,
      verses: makeVerses(3),
      annotations: [],
      notes: [],
      sectionHeadings: [],
      chapterTitle: null,
    });
    expect(out.html).toContain('John 3');
    expect(out.html).toContain('English Standard Version');
    expect(out.html).toContain('Verse 1 text.');
    expect(out.html).toContain('Verse 3 text.');
    expect(out.html).toContain('Crossway');
    expect(out.plainText).toContain('John 3');
    expect(out.plainText).toContain('1 Verse 1 text.');
  });

  it('restricts to the verse range when provided', () => {
    const out = formatPassageAsHtml({
      translation: ESV,
      book: 'John',
      chapter: 3,
      verses: makeVerses(5),
      annotations: [],
      notes: [],
      sectionHeadings: [],
      chapterTitle: null,
      verseRange: { start: 2, end: 3 },
    });
    expect(out.html).toContain('John 3:2–3');
    expect(out.html).toContain('Verse 2 text.');
    expect(out.html).toContain('Verse 3 text.');
    expect(out.html).not.toContain('Verse 1 text.');
    expect(out.html).not.toContain('Verse 4 text.');
  });

  it('includes the chapter title only when the range starts at the first verse', () => {
    const title: ChapterTitle = {
      id: 't',
      book: 'John',
      chapter: 3,
      title: 'Born Again',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const full = formatPassageAsHtml({
      translation: PUBLIC_DOMAIN,
      book: 'John',
      chapter: 3,
      verses: makeVerses(3),
      annotations: [],
      notes: [],
      sectionHeadings: [],
      chapterTitle: title,
    });
    expect(full.html).toContain('Born Again');

    const partial = formatPassageAsHtml({
      translation: PUBLIC_DOMAIN,
      book: 'John',
      chapter: 3,
      verses: makeVerses(3),
      annotations: [],
      notes: [],
      sectionHeadings: [],
      chapterTitle: title,
      verseRange: { start: 2, end: 3 },
    });
    expect(partial.html).not.toContain('Born Again');
  });

  it('renders section headings before their verses', () => {
    const heading: SectionHeading = {
      id: 'h',
      beforeRef: { book: 'John', chapter: 3, verse: 2 },
      title: 'Nicodemus arrives',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const out = formatPassageAsHtml({
      translation: PUBLIC_DOMAIN,
      book: 'John',
      chapter: 3,
      verses: makeVerses(3),
      annotations: [],
      notes: [],
      sectionHeadings: [heading],
      chapterTitle: null,
    });
    const headingIdx = out.html.indexOf('Nicodemus arrives');
    const v2Idx = out.html.indexOf('Verse 2 text.');
    const v1Idx = out.html.indexOf('Verse 1 text.');
    expect(headingIdx).toBeGreaterThan(v1Idx);
    expect(headingIdx).toBeLessThan(v2Idx);
  });

  it('shows the covering section heading for partial ranges starting mid-section', () => {
    const heading: SectionHeading = {
      id: 'h',
      beforeRef: { book: 'John', chapter: 3, verse: 1 },
      title: 'Discourse with Nicodemus',
      coversUntil: { book: 'John', chapter: 3, verse: 5 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const out = formatPassageAsHtml({
      translation: PUBLIC_DOMAIN,
      book: 'John',
      chapter: 3,
      verses: makeVerses(5),
      annotations: [],
      notes: [],
      sectionHeadings: [heading],
      chapterTitle: null,
      verseRange: { start: 3, end: 4 },
    });
    expect(out.html).toContain('Discourse with Nicodemus');
  });

  it('renders notes inline below their verse', () => {
    const note: Note = {
      id: 'n',
      moduleId: 'sword-KJV',
      ref: { book: 'John', chapter: 3, verse: 2 },
      content: 'A pivotal night-time visit.',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const out = formatPassageAsHtml({
      translation: PUBLIC_DOMAIN,
      book: 'John',
      chapter: 3,
      verses: makeVerses(3),
      annotations: [],
      notes: [note],
      sectionHeadings: [],
      chapterTitle: null,
    });
    expect(out.html).toContain('A pivotal night-time visit.');
    expect(out.plainText).toContain('Note: A pivotal night-time visit.');
  });

  it('applies highlight color as inline background style', () => {
    const verses: Verse[] = [{ ref: { book: 'John', chapter: 3, verse: 16 }, text: 'For God so loved the world' }];
    const ann: Annotation = {
      id: 'a',
      moduleId: 'sword-KJV',
      type: 'highlight',
      startRef: { book: 'John', chapter: 3, verse: 16 },
      endRef: { book: 'John', chapter: 3, verse: 16 },
      startOffset: 4,
      endOffset: 7, // "God"
      selectedText: 'God',
      color: 'yellow',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const out = formatPassageAsHtml({
      translation: PUBLIC_DOMAIN,
      book: 'John',
      chapter: 3,
      verses,
      annotations: [ann],
      notes: [],
      sectionHeadings: [],
      chapterTitle: null,
    });
    expect(out.html).toContain('background-color:#eab30840');
    expect(out.html).toContain('>God<');
  });

  it('escapes HTML-special characters in verse text and notes', () => {
    const verses: Verse[] = [{ ref: { book: 'John', chapter: 3, verse: 1 }, text: '<script>alert(1)</script>' }];
    const note: Note = {
      id: 'n',
      moduleId: 'sword-KJV',
      ref: { book: 'John', chapter: 3, verse: 1 },
      content: '<b>bold</b>',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const out = formatPassageAsHtml({
      translation: PUBLIC_DOMAIN,
      book: 'John',
      chapter: 3,
      verses,
      annotations: [],
      notes: [note],
      sectionHeadings: [],
      chapterTitle: null,
    });
    expect(out.html).not.toContain('<script>alert(1)</script>');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });
});

describe('getTranslationAttribution', () => {
  it('returns the ESV copyright for the ESV translation', () => {
    expect(getTranslationAttribution(ESV)).toMatch(/Crossway/);
  });

  it('returns the NASB Lockman copyright for NASB', () => {
    expect(getTranslationAttribution(NASB)).toMatch(/Lockman/);
  });

  it('falls back to a short "public domain" line for modules with no copyright', () => {
    expect(getTranslationAttribution(PUBLIC_DOMAIN)).toMatch(/public domain/);
  });
});
