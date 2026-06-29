/**
 * Resolve a person's life-dates (birth/death) from the Gnosis knowledge graph.
 *
 * Mirrors how places auto-resolve coordinates via `resolveCoordinates` — when a
 * Person record is created we backfill `yearStart`/`yearEnd` from Gnosis so the
 * user doesn't have to re-enter dates Gnosis already knows. Conservative on
 * purpose: only an unambiguous exact name match is used, so shared names like
 * "Mary" are left for manual entry rather than guessed.
 */

import { isGnosisAvailable, getGnosisProvider } from '@/lib/gnosis';

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

// Cache by lowercased name so repeated lookups (same person across verses, or
// across create + load-backfill) only hit Gnosis once per session.
const cache = new Map<string, ResolvedPersonDates | null>();

export async function resolvePersonDates(name: string): Promise<ResolvedPersonDates | null> {
  if (!isGnosisAvailable()) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const key = trimmed.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;

  let resolved: ResolvedPersonDates | null = null;
  try {
    const { data } = await getGnosisProvider().searchPeople(trimmed, { limit: 25 });
    const exact = data.filter(p => p.name.trim().toLowerCase() === key);
    // Only resolve when the name maps to exactly one Gnosis person — otherwise
    // it's ambiguous and we'd risk attaching the wrong dates.
    if (exact.length === 1) {
      const start = toEraYear(exact[0].birthYear);
      const end = toEraYear(exact[0].deathYear);
      if (start || end) {
        resolved = {
          ...(start && { yearStart: start.year, yearStartEra: start.era }),
          ...(end && { yearEnd: end.year, yearEndEra: end.era }),
        };
      }
    }
  } catch (error) {
    console.error('[resolvePersonDates] Failed:', error);
    resolved = null;
  }

  cache.set(key, resolved);
  return resolved;
}
