import { BibleApiError } from '@/lib/bible-api/types';
import { loadBundledModule } from '@/lib/bible-api/sword';
import { readSlot } from '@/lib/bible-api/sword-ztext';
import { formatCrossRefTarget } from '@/lib/chapterAnalysis/crossRefs';
import { parseOsisRef } from '@/types';
import type { Chapter } from '@/types';
import { deriveChapterBlocks } from './mhcc';
import type { CommentaryBlock } from './types';

export type { CommentaryBlock, CommentaryBlockKind, CommentaryRun } from './types';

const MHCC_MODULE_ID = 'sword-MHCC';

/** Load MHCC's blocks for one chapter from the bundled module. */
export async function getChapterCommentary(book: string, chapter: number): Promise<CommentaryBlock[]> {
  const { files, cache } = await loadBundledModule(MHCC_MODULE_ID);
  return deriveChapterBlocks((b, c, v) => readSlot(files, b, c, v, cache), book, chapter);
}

export interface CommentaryPassage {
  book: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
  label: string;
}

/**
 * Resolve a reference's `osisRef` to the verses to show inline. A single verse or a same-chapter
 * range (end at or after start) shows every verse; any other range shows the first verse only.
 */
export function resolveCommentaryPassage(osisRef: string): CommentaryPassage | null {
  const [startRef, endRef] = osisRef.split('-');
  const start = parseOsisRef(startRef);
  if (!start || start.verse === undefined) return null;
  const end = endRef ? parseOsisRef(endRef) : null;
  const endVerse =
    end?.verse !== undefined && end.book === start.book && end.chapter === start.chapter && end.verse >= start.verse
      ? end.verse
      : start.verse;
  return {
    book: start.book,
    chapter: start.chapter,
    startVerse: start.verse,
    endVerse,
    label: formatCrossRefTarget(startRef, endVerse !== start.verse ? endRef : null),
  };
}

export type PassageStatus = 'ready' | 'missing' | 'error';

/**
 * Classify a chapter fetch for an inline passage. "Missing" (not in this translation) means none of
 * the requested verses came back, or the SWORD client's empty-chapter error.
 */
export function classifyPassageResult(
  result: { chapter: Chapter } | { error: unknown },
  startVerse: number,
  endVerse: number
): { status: PassageStatus; verses: { verse: number; text: string }[] } {
  if ('error' in result) {
    const { error } = result;
    const missing = error instanceof BibleApiError && error.provider === 'sword' && /returned no verses/.test(error.message);
    return { status: missing ? 'missing' : 'error', verses: [] };
  }
  const verses = result.chapter.verses
    .filter((v) => v.ref.verse >= startVerse && v.ref.verse <= endVerse)
    .map((v) => ({ verse: v.ref.verse, text: v.text }));
  return { status: verses.length ? 'ready' : 'missing', verses };
}
