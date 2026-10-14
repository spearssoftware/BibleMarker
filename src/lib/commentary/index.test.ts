import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/bible-api/sword', () => ({ loadBundledModule: vi.fn() }));

import { BibleApiError } from '@/lib/bible-api/types';
import type { Chapter } from '@/types';
import { classifyPassageResult, resolveCommentaryPassage } from './index';

describe('resolveCommentaryPassage', () => {
  it('resolves a single verse', () => {
    expect(resolveCommentaryPassage('Acts.16.10')).toEqual({
      book: 'Acts', chapter: 16, startVerse: 10, endVerse: 10, label: 'Acts 16:10',
    });
  });

  it('keeps a same-chapter range whole, uncapped', () => {
    expect(resolveCommentaryPassage('Gen.1.13-Gen.1.25')).toEqual({
      book: 'Gen', chapter: 1, startVerse: 13, endVerse: 25, label: 'Genesis 1:13–25',
    });
  });

  it('falls back to the first verse for cross-chapter and inverted ranges', () => {
    expect(resolveCommentaryPassage('Jer.50.1-Jer.3.8')).toMatchObject({ startVerse: 1, endVerse: 1, label: 'Jeremiah 50:1' });
    expect(resolveCommentaryPassage('Exod.13.2-Exod.10.13')).toMatchObject({ chapter: 13, startVerse: 2, endVerse: 2 });
    expect(resolveCommentaryPassage('Gen.1.5-Gen.1.3')).toMatchObject({ startVerse: 5, endVerse: 5, label: 'Genesis 1:5' });
    expect(resolveCommentaryPassage('Deut.28.2-Deut.29.1')).toMatchObject({ startVerse: 2, endVerse: 2, label: 'Deuteronomy 28:2' });
  });

  it('returns null for a reference without a verse', () => {
    expect(resolveCommentaryPassage('Ps.23')).toBeNull();
  });
});

describe('classifyPassageResult', () => {
  const chapter: Chapter = {
    book: 'Gen',
    chapter: 1,
    verses: [1, 2, 3, 4].map((verse) => ({ ref: { book: 'Gen', chapter: 1, verse }, text: `v${verse}` })),
  };

  it('returns the requested verses', () => {
    expect(classifyPassageResult({ chapter }, 2, 3)).toEqual({
      status: 'ready',
      verses: [{ verse: 2, text: 'v2' }, { verse: 3, text: 'v3' }],
    });
  });

  it('treats a result with none of the requested verses as missing', () => {
    expect(classifyPassageResult({ chapter }, 10, 12)).toEqual({ status: 'missing', verses: [] });
  });

  it("treats the SWORD client's empty-chapter error as missing", () => {
    const error = new BibleApiError('SWORD module sword-X returned no verses for Matt 1 (expected 25).', 'sword');
    expect(classifyPassageResult({ error }, 1, 1).status).toBe('missing');
  });

  it('treats any other error as a failure', () => {
    expect(classifyPassageResult({ error: new BibleApiError('Network down', 'esv') }, 1, 1).status).toBe('error');
    expect(classifyPassageResult({ error: new BibleApiError('returned no verses', 'esv') }, 1, 1).status).toBe('error');
    expect(classifyPassageResult({ error: new Error('boom') }, 1, 1).status).toBe('error');
  });
});
