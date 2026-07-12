import { describe, it, expect } from 'vitest';
import {
  TABLE_REGISTRY,
  VALID_TABLE_NAMES,
  SYNCED_TABLES,
  STUDY_COLUMN_DATA_TABLES,
  STUDY_SCOPED_COLUMN_TABLES,
  CLEARED_TABLES,
  SNAPSHOT_TABLE_KEYS,
  camelToSnakeTable,
} from './table-registry';

/**
 * These tests enforce the invariants that used to be maintained by hand across
 * ~6 separate lists. A study/synced table silently missing from one of them was
 * the root cause of the study_id sync loss fixed by the v11 migration; the
 * registry + these assertions make that class of bug a test failure.
 */
describe('table registry', () => {
  it('has no duplicate table names', () => {
    const names = TABLE_REGISTRY.map((t) => t.table);
    expect(names.length).toBe(new Set(names).size);
  });

  it('derives the exact set of generic-CRUD tables', () => {
    expect([...VALID_TABLE_NAMES].sort()).toEqual(
      [
        'annotations', 'applications', 'chapter_cache', 'chapter_titles',
        'conclusions', 'entity_notes', 'interpretations', 'keyword_exclusions',
        'marking_presets', 'multi_translation_views', 'notes', 'observation_lists',
        'people', 'places', 'preferences', 'section_headings', 'studies',
        'time_expressions',
      ].sort()
    );
  });

  it('derives the exact set of synced tables', () => {
    expect([...SYNCED_TABLES].sort()).toEqual(
      [
        'annotations', 'applications', 'chapter_titles', 'conclusions',
        'entity_notes', 'interpretations', 'keyword_exclusions', 'marking_presets',
        'multi_translation_views', 'notes', 'observation_lists', 'people',
        'places', 'preferences', 'section_headings', 'studies', 'time_expressions',
      ].sort()
    );
  });

  it('derives the study cascade column tables', () => {
    expect([...STUDY_SCOPED_COLUMN_TABLES].sort()).toEqual(
      [
        'applications', 'chapter_titles', 'entity_notes', 'interpretations',
        'marking_presets', 'observation_lists', 'section_headings',
      ].sort()
    );
  });

  it('derives the generic study-data tables', () => {
    expect([...STUDY_COLUMN_DATA_TABLES].sort()).toEqual(
      ['applications', 'entity_notes', 'interpretations', 'observation_lists'].sort()
    );
  });

  it('clears every table except preferences', () => {
    expect(CLEARED_TABLES).not.toContain('preferences');
    // Caches / history are cleared but not synced.
    expect(CLEARED_TABLES).toContain('chapter_cache');
    expect(CLEARED_TABLES).toContain('reading_history');
    expect(CLEARED_TABLES).toContain('translation_cache');
  });

  // --- structural invariants (catch a mis-flagged new table) ---

  it('every generic study-data table also has a real study_id column', () => {
    const columnTables = new Set(STUDY_SCOPED_COLUMN_TABLES);
    for (const t of STUDY_COLUMN_DATA_TABLES) {
      expect(columnTables.has(t), `${t} is a studyDataTable but not a studyColumn table`).toBe(true);
    }
  });

  it('every synced table has a camelKey for export/snapshot', () => {
    for (const spec of TABLE_REGISTRY) {
      if (spec.synced) {
        expect(spec.camelKey, `synced table ${spec.table} is missing a camelKey`).toBeTruthy();
      }
    }
  });

  it('snapshot keys map onto exactly the synced tables minus preferences', () => {
    const mapped = SNAPSHOT_TABLE_KEYS.map(camelToSnakeTable).sort();
    const expected = [...SYNCED_TABLES].filter((t) => t !== 'preferences').sort();
    expect(mapped).toEqual(expected);
  });

  it('camelToSnakeTable round-trips every registry camelKey', () => {
    for (const spec of TABLE_REGISTRY) {
      if (spec.camelKey) {
        expect(camelToSnakeTable(spec.camelKey)).toBe(spec.table);
      }
    }
  });

  it('passes through unknown keys unchanged', () => {
    expect(camelToSnakeTable('not_a_table')).toBe('not_a_table');
  });
});
