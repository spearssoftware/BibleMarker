/**
 * Era bands for the Discover "you are here" strip.
 *
 * Years use the Gnosis `chapter_timeline.year` convention: astronomical
 * years, so -4003 is 4004 BC and 1 is AD 1. Those years follow Ussher's
 * traditional chronology. Bands are contiguous and both ends are
 * inclusive: each `startYear` is the previous band's `endYear + 1`.
 *
 * Boundaries are pinned to the chapter years in the bundled data:
 * — Patriarchs starts at Genesis 12 (-1920), Abram's call.
 * — Exodus & Wilderness starts at Exodus 1 (-1635) and runs through
 *   Deuteronomy 34 (-1451).
 * — Judges starts at Joshua 1 (-1450); the conquest sits with the judges
 *   because the land, not the wilderness, is now the setting.
 * — Kingdom starts with Saul (1 Samuel 9, -1095).
 * — Exile starts with the first deportation (Daniel 1, -605), so the last
 *   kings of Judah, from that deportation on, fall in Exile.
 * — Return starts with Cyrus's decree (Ussher's 536 BC, -535) and spans
 *   the quiet centuries after Malachi.
 * — Jesus & the Church starts at Luke 1 (-4).
 */

export interface EraBand {
  label: string;
  startYear: number;
  endYear: number;
}

export const ERA_BANDS: readonly EraBand[] = [
  { label: 'Beginnings', startYear: -4003, endYear: -1921 },
  { label: 'Patriarchs', startYear: -1920, endYear: -1636 },
  { label: 'Exodus & Wilderness', startYear: -1635, endYear: -1451 },
  { label: 'Judges', startYear: -1450, endYear: -1096 },
  { label: 'Kingdom', startYear: -1095, endYear: -606 },
  { label: 'Exile', startYear: -605, endYear: -536 },
  { label: 'Return', startYear: -535, endYear: -5 },
  { label: 'Jesus & the Church', startYear: -4, endYear: 96 },
];

/** Locate a year within the era bands; `fraction` is in [0, 1) across the band. */
export function eraPosition(year: number): { index: number; fraction: number } | null {
  const index = ERA_BANDS.findIndex(b => year >= b.startYear && year <= b.endYear);
  if (index === -1) return null;
  const { startYear, endYear } = ERA_BANDS[index];
  return { index, fraction: (year - startYear) / (endYear - startYear + 1) };
}

/** Genesis 1–11 predates any datable chronology, so it carries no year. */
export function isPrimeval(book: string, chapter: number): boolean {
  return book === 'Gen' && chapter >= 1 && chapter <= 11;
}
