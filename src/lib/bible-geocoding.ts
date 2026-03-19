/**
 * Bible Place Geocoding
 *
 * Offline geocoding for biblical places using bundled OpenBible.info data.
 */

import biblePlacesData from '@/data/bible-places.json';

// Build lookup map: normalized name → [lat, lon]
const coordMap = new Map<string, [number, number]>();
for (const entry of biblePlacesData as [string, number, number][]) {
  const [name, lat, lon] = entry;
  coordMap.set(name.toLowerCase(), [lat, lon]);
}

// Build array of all names for prefix/word matching
const allNames = (biblePlacesData as [string, number, number][]).map(([name]) => name);

interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Resolve coordinates for a biblical place name.
 * Matching strategy: exact → prefix → word-subset
 */
export function resolveCoordinates(name: string): Coordinates | null {
  const normalized = name.toLowerCase().trim();
  if (!normalized) return null;

  // 1. Exact match
  const exact = coordMap.get(normalized);
  if (exact) return { latitude: exact[0], longitude: exact[1] };

  // 2. Prefix match — find first entry whose name starts with the query
  for (const candidate of allNames) {
    if (candidate.toLowerCase().startsWith(normalized)) {
      const coords = coordMap.get(candidate.toLowerCase());
      if (coords) return { latitude: coords[0], longitude: coords[1] };
    }
  }

  // 3. Word-subset match — all words in query appear in a candidate name
  const queryWords = normalized.split(/[\s-]+/).filter(Boolean);
  if (queryWords.length > 0) {
    for (const candidate of allNames) {
      const candidateLower = candidate.toLowerCase();
      if (queryWords.every(w => candidateLower.includes(w))) {
        const coords = coordMap.get(candidateLower);
        if (coords) return { latitude: coords[0], longitude: coords[1] };
      }
    }
  }

  return null;
}
