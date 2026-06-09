import { describe, it, expect } from 'vitest';
import { SYNCED_TABLES } from './sqlite-db';
import { SNAPSHOT_TABLE_KEYS, camelToSnakeTable } from './sync-engine';

/**
 * Regression guard: every synced table must be present in snapshots, or a
 * device that bootstraps from a snapshot (the primary new-device path) would
 * silently never receive that table's data. This caught `entity_notes` and
 * `keyword_exclusions` being dropped from snapshots/exports.
 */
describe('snapshot coverage', () => {
  it('covers every SYNCED_TABLES entry', () => {
    const covered = new Set<string>([
      ...SNAPSHOT_TABLE_KEYS.map(camelToSnakeTable),
      'preferences', // special-cased in writeSnapshot as a single-element array
    ]);

    const missing = [...SYNCED_TABLES].filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
  });
});
