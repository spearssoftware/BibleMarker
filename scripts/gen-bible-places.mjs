#!/usr/bin/env node
/**
 * One-time script to generate src/data/bible-places.json from OpenBible.info data.
 * Not shipped in the app.
 *
 * Usage: curl -sL "https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data/ancient.jsonl" | node scripts/gen-bible-places.mjs > src/data/bible-places.json
 */
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin });
const results = [];
const seen = new Set();

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    const name = obj.friendly_id;
    if (!name) return;

    const names = new Set([name]);
    if (obj.translation_name_counts) {
      for (const tname of Object.keys(obj.translation_name_counts)) {
        names.add(tname);
      }
    }

    const id0 = obj.identifications?.[0];
    if (!id0?.resolutions?.length) return;
    const res0 = id0.resolutions[0];
    const lonlat = res0.lonlat;
    if (!lonlat) return;

    const [lonStr, latStr] = lonlat.split(',');
    const lon = parseFloat(lonStr);
    const lat = parseFloat(latStr);
    if (isNaN(lon) || isNaN(lat)) return;

    for (const n of names) {
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push([n, Math.round(lat * 10000) / 10000, Math.round(lon * 10000) / 10000]);
    }
  } catch {
    // skip malformed lines
  }
});

rl.on('close', () => {
  results.sort((a, b) => a[0].localeCompare(b[0]));
  process.stdout.write(JSON.stringify(results));
});
