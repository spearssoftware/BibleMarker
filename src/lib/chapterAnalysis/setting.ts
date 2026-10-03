import { pluralize } from '@/lib/textUtils';

/** Entities excluded from "who's here" counts: present everywhere, so they say nothing about the chapter. */
export const DEITY_SLUGS: ReadonlySet<string> = new Set(['god', 'holy-spirit']);

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
