/**
 * Pure picker for the verse "currently being read" in a scroll container.
 * Row and container tops share one coordinate space (viewport coords from
 * getBoundingClientRect).
 */

export interface VerseRow {
  verse: number;
  top: number;
  height: number;
}

export interface PickCurrentVerseInput {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  containerTop: number;
  rows: VerseRow[];
  minVerse: number;
  maxVerse: number;
}

const EDGE_TOLERANCE_PX = 1;

export function pickCurrentVerse({
  scrollTop,
  clientHeight,
  scrollHeight,
  containerTop,
  rows,
  minVerse,
  maxVerse,
}: PickCurrentVerseInput): number | null {
  if (rows.length === 0) return null;

  const clamp = (v: number) => Math.min(Math.max(v, minVerse), maxVerse);

  if (scrollTop <= EDGE_TOLERANCE_PX) return minVerse;
  if (scrollTop + clientHeight >= scrollHeight - EDGE_TOLERANCE_PX) return maxVerse;

  const target = containerTop + clientHeight / 2;
  let best = rows[0];
  let bestDistance = Infinity;
  for (const row of rows) {
    const distance = Math.abs(row.top + row.height / 2 - target);
    if (distance < bestDistance || (distance === bestDistance && row.verse < best.verse)) {
      best = row;
      bestDistance = distance;
    }
  }
  return clamp(best.verse);
}
