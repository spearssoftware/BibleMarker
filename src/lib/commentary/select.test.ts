import { describe, it, expect } from 'vitest';
import { selectBlockForVerse } from './select';
import type { CommentaryBlock } from './types';

function block(id: string, kind: CommentaryBlock['kind'], startVerse: number | null = null, endVerse: number | null = null): CommentaryBlock {
  return {
    id,
    commentaryId: 'mhcc',
    kind,
    book: 'Luke',
    chapter: 1,
    startVerse,
    endVerse,
    title: null,
    paragraphs: [[{ text: id }]],
  };
}

const BOOK_INTRO = block('book', 'book-intro');
const CHAPTER_INTRO = block('intro', 'chapter-intro');
const WHOLE = block('whole', 'whole-chapter');
const S1 = block('s1', 'section', 1, 8);
const S2 = block('s2', 'section', 22, 36);

describe('selectBlockForVerse', () => {
  it('returns null for no blocks', () => {
    expect(selectBlockForVerse([], 5)).toBeNull();
    expect(selectBlockForVerse([], null)).toBeNull();
  });

  it('picks the first section for a null verse', () => {
    expect(selectBlockForVerse([S1, S2], null)).toBe(S1);
  });

  it('picks the section containing the verse, inclusive of both ends', () => {
    expect(selectBlockForVerse([S1, S2], 1)).toBe(S1);
    expect(selectBlockForVerse([S1, S2], 8)).toBe(S1);
    expect(selectBlockForVerse([S1, S2], 22)).toBe(S2);
    expect(selectBlockForVerse([S1, S2], 30)).toBe(S2);
  });

  it('picks the previous section for a verse in a gap or past the last section', () => {
    expect(selectBlockForVerse([S1, S2], 16)).toBe(S1);
    expect(selectBlockForVerse([S1, S2], 40)).toBe(S2);
  });

  it('does not depend on input order', () => {
    expect(selectBlockForVerse([S2, S1], null)).toBe(S1);
    expect(selectBlockForVerse([S2, S1], 16)).toBe(S1);
    expect(selectBlockForVerse([S2, S1], 30)).toBe(S2);
  });

  it('picks the first section for a verse before it', () => {
    const first = block('s3', 'section', 3, 6);
    expect(selectBlockForVerse([first, S2], 1)).toBe(first);
  });

  it('handles a single-verse section', () => {
    const single = block('single', 'section', 9, 9);
    expect(selectBlockForVerse([S1, single, S2], 9)).toBe(single);
    expect(selectBlockForVerse([S1, single, S2], 10)).toBe(single);
  });

  it('picks the whole-chapter block when there are no sections', () => {
    expect(selectBlockForVerse([BOOK_INTRO, WHOLE], 12)).toBe(WHOLE);
  });

  it('picks the chapter intro only when there are no sections', () => {
    expect(selectBlockForVerse([BOOK_INTRO, CHAPTER_INTRO], 3)).toBe(CHAPTER_INTRO);
    expect(selectBlockForVerse([CHAPTER_INTRO, S1, S2], 3)).toBe(S1);
    expect(selectBlockForVerse([CHAPTER_INTRO, S1, S2], null)).toBe(S1);
  });

  it('never picks a book intro', () => {
    expect(selectBlockForVerse([BOOK_INTRO, S1, S2], null)).toBe(S1);
    expect(selectBlockForVerse([BOOK_INTRO], 1)).toBeNull();
  });
});
