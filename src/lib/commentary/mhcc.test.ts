import { describe, it, expect, vi } from 'vitest';
import fixture from './__fixtures__/mhcc-slots.json';
import { deriveChapterBlocks, type SlotReader } from './mhcc';
import type { CommentaryBlock } from './types';

/** Real MHCC slot text for the chapters under test, extracted from the bundled module. */
const slots = fixture as { slots: Record<string, string | null>; entries: Record<string, string> };

const readFixture: SlotReader = (book, chapter, verse) => {
  const key = `${book}.${chapter}.${verse}`;
  if (!(key in slots.slots)) throw new Error(`Fixture has no slot ${key}`);
  const pointer = slots.slots[key];
  return pointer ? { pointer, text: slots.entries[pointer] } : null;
};

const blocksFor = (book: string, chapter: number) => deriveChapterBlocks(readFixture, book, chapter);
const text = (block: CommentaryBlock) => block.paragraphs.map((p) => p.map((r) => r.text).join('')).join('\n');
const sections = (blocks: CommentaryBlock[]) =>
  blocks.filter((b) => b.kind === 'section').map((b) => ({ start: b.startVerse, end: b.endVerse, title: b.title }));

describe('deriveChapterBlocks (fixtures)', () => {
  it('Luke 1: book intro first, without its title, then titled sections', () => {
    const blocks = blocksFor('Luke', 1);
    expect(blocks[0].kind).toBe('book-intro');
    expect(text(blocks[0])).toMatch(/^This evangelist is generally supposed/);
    expect(text(blocks[0])).not.toContain('Luke\n');
    expect(blocks.some((b) => b.kind === 'chapter-intro')).toBe(false);
    expect(sections(blocks)).toContainEqual({ start: 5, end: 25, title: 'Zacharias and Elisabeth' });
    expect(sections(blocks)[0]).toEqual({ start: 1, end: 4, title: 'The Preface' });
  });

  it('Luke 1: references stay separate runs', () => {
    const intro = blocksFor('Luke', 1)[0].paragraphs[0];
    const refs = intro.filter((r) => r.osisRef);
    expect(refs.slice(0, 2)).toEqual([
      { text: 'Ac 16:10', osisRef: 'Acts.16.10' },
      { text: '11', osisRef: 'Acts.16.11' },
    ]);
  });

  it('Luke 2: no book intro', () => {
    expect(blocksFor('Luke', 2).some((b) => b.kind === 'book-intro')).toBe(false);
  });

  it('John 3: first section is the linked 1–8, and no chapter intro', () => {
    const blocks = blocksFor('John', 3);
    expect(blocks.some((b) => b.kind === 'chapter-intro')).toBe(false);
    expect(sections(blocks)[0]).toEqual({ start: 1, end: 8, title: "Christ's discourse with Nicodemus" });
    expect(sections(blocks)).toContainEqual({ start: 22, end: 36, title: "The baptism of John of Christ John's testimony" });
  });

  it('Psalm 119: chapter intro, then 22 untitled sections', () => {
    const blocks = blocksFor('Ps', 119);
    expect(blocks[0].kind).toBe('chapter-intro');
    expect(text(blocks[0])).toMatch(/^The general scope and design of this psalm/);
    expect(sections(blocks)).toHaveLength(22);
    expect(sections(blocks).every((s) => s.title === null)).toBe(true);
  });

  it('Genesis 21: plain-text outline titles, removed from the text', () => {
    const blocks = blocksFor('Gen', 21);
    expect(sections(blocks).map((s) => s.title)).toEqual([
      "Birth of Isaac, Sarah's joy",
      'Ishmael mocks Isaac',
      'Hagar and Ishmael are cast forth, They are relieved and comforted by an angel',
      "Abimelech's covenant with Abraham",
    ]);
    expect(blocks.some((b) => b.kind === 'chapter-intro')).toBe(false);
  });

  it('Genesis 23: outline inside the preverse', () => {
    expect(sections(blocksFor('Gen', 23))[0]).toEqual({
      start: 1,
      end: 13,
      title: 'The death of Sarah, Abraham applies for a burying-place',
    });
  });

  it('Genesis 36: one whole-chapter block with no range or title', () => {
    const blocks = blocksFor('Gen', 36);
    expect(blocks.map((b) => b.kind)).toEqual(['whole-chapter']);
    expect(blocks[0]).toMatchObject({ startVerse: null, endVerse: null, title: null });
    expect(text(blocks[0])).toContain('—The registers in this chapter');
  });

  it('Leviticus 19: heading-slot chapter intro only, with source artifacts cleaned', () => {
    const blocks = blocksFor('Lev', 19);
    expect(blocks.map((b) => b.kind)).toEqual(['chapter-intro']);
    expect(text(blocks[0])).toContain('ver. (2)');
    expect(text(blocks[0])).not.toMatch(/--|#\(/);
  });

  it('Jude: book intro from the chapter heading slot and no chapter intro', () => {
    const blocks = blocksFor('Jude', 1);
    expect(blocks.filter((b) => b.kind === 'book-intro')).toHaveLength(1);
    expect(text(blocks[0])).toMatch(/^This epistle is addressed to all believers/);
    expect(blocks.some((b) => b.kind === 'chapter-intro')).toBe(false);
    expect(sections(blocks)[0].title).toBe('The apostle exhorts to stedfastness in the faith');
  });

  it('2 Kings 1: no book intro, titles from an outline without a Chapter 1 title', () => {
    const blocks = blocksFor('2Kgs', 1);
    expect(blocks.some((b) => b.kind === 'book-intro')).toBe(false);
    expect(sections(blocks).map((s) => s.title)).toEqual([
      'The revolt of Moab—Sickness of Ahaziah, king of Israel',
      'Fire called from heaven by Elijah—Death of Ahaziah',
    ]);
  });

  it('2 Chronicles 1: no book intro, one whole-chapter block', () => {
    expect(blocksFor('2Chr', 1).map((b) => b.kind)).toEqual(['whole-chapter']);
  });

  it('Amos 1: book intro, then an unlabelled entry as a whole-chapter block', () => {
    const blocks = blocksFor('Amos', 1);
    expect(blocks.map((b) => b.kind)).toEqual(['book-intro', 'whole-chapter']);
    expect(text(blocks[0])).toMatch(/^Amos was a herdsman/);
  });

  it('Matthew 13: a split outline range titles its first section, and the label tail is removed', () => {
    const tares = blocksFor('Matt', 13).find((b) => b.startVerse === 24);
    expect(tares?.title).toBe('The parable of the tares');
    expect(text(tares!)).toMatch(/^This parable represents/);
  });

  it('Isaiah 2 and Ecclesiastes 1: one-paragraph outlines give titles and no chapter intro', () => {
    const isa = blocksFor('Isa', 2);
    expect(isa.some((b) => b.kind === 'chapter-intro')).toBe(false);
    expect(sections(isa).map((s) => s.title)).toEqual([
      'The conversion of the Gentiles, Description of the sinfulness of Israel',
      'The awful punishment of unbelievers',
    ]);
    const eccl = blocksFor('Eccl', 1);
    expect(eccl.map((b) => b.kind)).toEqual(['book-intro', 'section', 'section', 'section', 'section']);
    expect(sections(eccl)[2].title).toBe('There is nothing new');
  });

  it('never leaks titles, outline lines, labels or markup into paragraphs', () => {
    const chapters: [string, number][] = [
      ['Luke', 1], ['Luke', 2], ['John', 3], ['Ps', 119], ['Gen', 21], ['Gen', 23], ['Gen', 36], ['Lev', 19],
      ['Jude', 1], ['2Kgs', 1], ['2Chr', 1], ['Amos', 1], ['Matt', 13], ['Isa', 2], ['Eccl', 1],
    ];
    for (const [book, chapter] of chapters) {
      for (const block of blocksFor(book, chapter)) {
        for (const line of text(block).split('\n')) {
          expect(line).not.toMatch(/Chapter Outline|^Chapter \d|^\(\d+(-\d+)?\)$|Verses? \d+-?\d* |[<>]|&[a-z]+;/);
          expect(line.trim()).not.toBe('');
        }
      }
    }
  });
});

describe('deriveChapterBlocks (synthetic slots)', () => {
  const entry = (label: string, body: string) =>
    `<div type="x-milestone" subType="x-preverse" sID="p"/><div type="x-milestone" subType="x-preverse" eID="p"/>` +
    `<hi type="bold">${label}</hi> <div sID="a" type="x-p"/> ${body} <div eID="a" type="x-p"/>`;

  function reader(map: Record<string, string>): SlotReader {
    return (book, chapter, verse) => {
      const pointer = map[`${book}.${chapter}.${verse}`];
      return pointer ? { pointer, text: pointer.startsWith('E') ? entry('Verses 1-2', `Body ${pointer}`) : pointer } : null;
    };
  }

  it('groups linked slots into ranges and skips empty slots', () => {
    // Obad 1 has 21 verses: 1–2 linked, 3–20 empty, 21 alone.
    const read = reader({ 'Obad.1.1': 'E1', 'Obad.1.2': 'E1', 'Obad.1.21': 'E2' });
    expect(sections(deriveChapterBlocks(read, 'Obad', 1))).toEqual([
      { start: 1, end: 2, title: null },
      { start: 21, end: 21, title: null },
    ]);
  });

  it('throws when an entry reappears after a gap', () => {
    const read = reader({ 'Obad.1.1': 'E1', 'Obad.1.3': 'E1' });
    expect(() => deriveChapterBlocks(read, 'Obad', 1)).toThrow('Obad 1:3');
  });

  it('drops and logs a run linked across a chapter boundary', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Ruth 1 has 22 verses; its last entry is also linked to Ruth 2:1.
    const map: Record<string, string> = { 'Ruth.1.1': 'E1', 'Ruth.1.22': 'E9', 'Ruth.2.1': 'E9' };
    const read = reader(map);
    expect(sections(deriveChapterBlocks(read, 'Ruth', 1))).toEqual([{ start: 1, end: 1, title: null }]);
    expect(sections(deriveChapterBlocks(read, 'Ruth', 2))).toEqual([]);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
