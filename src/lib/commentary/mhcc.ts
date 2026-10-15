/**
 * Matthew Henry's Concise Commentary (SWORD zCom module MHCC) → blocks for one chapter.
 */

import { BIBLE_BOOKS, getVerseCount } from '@/types';
import { headingProse, parseEntry, type ParsedEntry } from './osis';
import type { CommentaryBlock, CommentaryBlockKind } from './types';

/** Reads one module slot (verse 0 = chapter heading, chapter 0 = book heading); null when empty. */
export type SlotReader = (book: string, chapter: number, verse: number) => { pointer: string; text: string } | null;


interface Run {
  pointer: string;
  text: string;
  start: number;
  end: number;
}

/** Group the chapter's verse slots into linked runs. Throws if an entry reappears after a gap. */
function linkedRuns(read: SlotReader, book: string, chapter: number): Run[] {
  const runs: Run[] = [];
  const seen = new Set<string>();
  let prev: Run | null = null;
  for (let verse = 1; verse <= getVerseCount(book, chapter); verse++) {
    const slot = read(book, chapter, verse);
    if (!slot) {
      prev = null;
      continue;
    }
    if (prev && prev.pointer === slot.pointer) {
      prev.end = verse;
      continue;
    }
    if (seen.has(slot.pointer)) {
      throw new Error(`MHCC ${book} ${chapter}:${verse} links to an entry already used earlier in the chapter`);
    }
    seen.add(slot.pointer);
    prev = { pointer: slot.pointer, text: slot.text, start: verse, end: verse };
    runs.push(prev);
  }
  return runs;
}

/** Drop (and log) runs linked into the previous or next chapter of the same book. */
function dropChapterCrossing(runs: Run[], read: SlotReader, book: string, chapter: number): Run[] {
  const lastVerse = getVerseCount(book, chapter);
  const chapters = BIBLE_BOOKS.find((b) => b.id === book)?.chapters ?? chapter;
  const prevLast = chapter > 1 ? read(book, chapter - 1, getVerseCount(book, chapter - 1))?.pointer : undefined;
  const nextFirst = chapter < chapters ? read(book, chapter + 1, 1)?.pointer : undefined;
  return runs.filter((run) => {
    const crosses =
      (run.start === 1 && run.pointer === prevLast) || (run.end === lastVerse && run.pointer === nextFirst);
    if (crosses) {
      console.error(`[Commentary] MHCC ${book} ${chapter}:${run.start}-${run.end} crosses a chapter boundary; dropped`);
    }
    return !crosses;
  });
}

/** Derive the commentary blocks for one chapter, in display order. Empty blocks are omitted. */
export function deriveChapterBlocks(read: SlotReader, book: string, chapter: number): CommentaryBlock[] {
  const runs = dropChapterCrossing(linkedRuns(read, book, chapter), read, book, chapter);
  const entries: { run: Run; parsed: ParsedEntry }[] = runs.map((run) => ({ run, parsed: parseEntry(run.text) }));
  const first = entries[0]?.parsed;
  // One-chapter books keep the book introduction in the chapter-1 heading slot.
  const oneChapterBook = BIBLE_BOOKS.find((b) => b.id === book)?.chapters === 1;
  const chapterHeading = read(book, chapter, 0)?.text ?? '';

  const blocks: CommentaryBlock[] = [];
  const add = (
    kind: CommentaryBlockKind,
    paragraphs: CommentaryBlock['paragraphs'],
    section?: { start: number; end: number; title: string | null }
  ) => {
    if (!paragraphs.length) return;
    blocks.push({
      id: `${kind}:${section?.start ?? 0}:${blocks.length}`,
      commentaryId: 'mhcc',
      kind,
      book,
      chapter,
      startVerse: section?.start ?? null,
      endVerse: section?.end ?? null,
      title: section?.title ?? null,
      paragraphs,
    });
  };

  if (chapter === 1) {
    add('book-intro', oneChapterBook ? headingProse(chapterHeading) : (first?.bookIntro ?? []));
  }
  add('chapter-intro', [
    ...(first?.hasLabel ? first.preLabel : []),
    ...(oneChapterBook ? [] : headingProse(chapterHeading)),
  ]);
  for (const { parsed } of entries) {
    if (!parsed.hasLabel) add('whole-chapter', parsed.preLabel);
  }
  for (const { run, parsed } of entries) {
    if (!parsed.hasLabel) continue;
    const title = first?.outline.find((row) => row.start === run.start)?.title ?? null;
    add('section', parsed.body, { start: run.start, end: run.end, title });
  }
  return blocks;
}
