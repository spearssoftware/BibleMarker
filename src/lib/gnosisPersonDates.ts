/**
 * Resolve a person's life-dates (birth/death) from the Gnosis knowledge graph.
 *
 * Mirrors how places auto-resolve coordinates via `resolveCoordinates` — when a
 * Person record is created we backfill `yearStart`/`yearEnd` from Gnosis so the
 * user doesn't have to re-enter dates Gnosis already knows. Conservative on
 * purpose: only an unambiguous exact name match is used, so shared names like
 * "Mary" are left for manual entry rather than guessed.
 */

import { isGnosisAvailable, getGnosisProvider, getGnosisMode } from '@/lib/gnosis';

export interface ResolvedPersonDates {
  yearStart?: number;
  yearStartEra?: 'BC' | 'AD';
  yearEnd?: number;
  yearEndEra?: 'BC' | 'AD';
}

// Gnosis stores years as a signed number (<= 0 means BC). Convert to our
// {year, era} pair, matching Timeline's `toNum` / `formatYearNum` conventions.
function toEraYear(signed: number | null): { year: number; era: 'BC' | 'AD' } | null {
  if (signed == null) return null;
  if (signed <= 0) return { year: Math.abs(signed) || 1, era: 'BC' };
  return { year: signed, era: 'AD' };
}

// Cache by mode + lowercased name so repeated lookups (same person across
// verses, or across create + load-backfill) only hit Gnosis once per session.
// Keying on the mode means a switch (e.g. local -> API, a richer dataset)
// naturally re-resolves names previously cached as null under the old mode.
const cache = new Map<string, ResolvedPersonDates | null>();

export async function resolvePersonDates(name: string): Promise<ResolvedPersonDates | null> {
  if (!isGnosisAvailable()) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const nameLower = trimmed.toLowerCase();
  const cacheKey = `${getGnosisMode()}:${nameLower}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  let resolved: ResolvedPersonDates | null = null;
  try {
    const { data } = await getGnosisProvider().searchPeople(trimmed, { limit: 25 });
    const exact = data.filter(p => p.name.trim().toLowerCase() === nameLower);
    // Map each exact match to dates, preferring precise birth/death years but
    // falling back to the span of years the person is mentioned (e.g. a
    // prophet's ministry) — many figures have only the latter.
    const dated = exact
      .map(p => {
        const start = toEraYear(p.birthYear) ?? toEraYear(p.earliestYearMentioned);
        const end = toEraYear(p.deathYear) ?? toEraYear(p.latestYearMentioned);
        if (!start && !end) return null;
        return {
          ...(start && { yearStart: start.year, yearStartEra: start.era }),
          ...(end && { yearEnd: end.year, yearEndEra: end.era }),
        } satisfies ResolvedPersonDates;
      })
      .filter((d): d is ResolvedPersonDates => d !== null);
    // Use the dates only when a single exact match carries them — if two
    // distinct people share the name and both have dates, it's ambiguous.
    if (dated.length === 1) resolved = dated[0];
  } catch (error) {
    console.error('[resolvePersonDates] Failed:', error);
    resolved = null;
  }

  cache.set(cacheKey, resolved);
  return resolved;
}
