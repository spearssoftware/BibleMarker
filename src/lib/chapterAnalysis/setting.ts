import { pluralize } from '@/lib/textUtils';
import { isOldTestament } from '@/types';

/** Entities excluded from "who's here" counts: present everywhere, so they say nothing about the chapter. */
export const DEITY_SLUGS: ReadonlySet<string> = new Set(['god', 'holy-spirit']);

/**
 * People Gnosis tags in Old Testament verses that read as prophecy: the text
 * never names them there, so the OT chapter is "foretold in", not "named in".
 */
export const FORETOLD_SLUGS: ReadonlySet<string> = new Set(['jesus-son-of-joseph']);

/** True when `slug` is a prophecy-tagged person read in an Old Testament `book`: foretold there, not named. */
export function isForetoldIn(slug: string, book: string): boolean {
  return FORETOLD_SLUGS.has(slug) && isOldTestament(book);
}

/** "about 1921 BC", or "About 1921 BC" at the start of a line. */
export function formatAboutYear(display: string, { capitalized }: { capitalized: boolean }): string {
  return `${capitalized ? 'About' : 'about'} ${display}`;
}

export interface ChapterLineInput {
  yearDisplay: string | null | undefined;
  peopleCount: number;
  placeCount: number;
  firstEventTitle: string | null | undefined;
  primeval: boolean;
}

/** One-line chapter summary, e.g. "About 1921 BC · 3 people · 2 places · Abraham Enters Canaan". */
export function buildChapterLine({
  yearDisplay,
  peopleCount,
  placeCount,
  firstEventTitle,
  primeval,
}: ChapterLineInput): string | null {
  const pieces: string[] = [];
  if (yearDisplay && !primeval) pieces.push(formatAboutYear(yearDisplay, { capitalized: true }));
  if (peopleCount > 0) pieces.push(pluralize(peopleCount, 'person', 'people'));
  if (placeCount > 0) pieces.push(pluralize(placeCount, 'place'));
  if (firstEventTitle) pieces.push(firstEventTitle);
  return pieces.length > 0 ? pieces.join(' · ') : null;
}

/** True when an OSIS reference (e.g. "Gen.12.1") falls in the given chapter. */
export function isInChapter(osisRef: string, book: string, chapter: number): boolean {
  return osisRef.startsWith(`${book}.${chapter}.`);
}
