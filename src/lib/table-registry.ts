/**
 * Single source of truth for database table metadata.
 *
 * Every per-table list in the codebase (valid CRUD names, synced tables, study
 * cascade columns, clear-on-reset, snapshot keys, camelCase↔snake_case mapping)
 * is DERIVED from this registry. Adding a table used to mean updating ~6 hand-
 * maintained lists in lockstep; missing one caused silent data bugs (e.g. the
 * study_id sync loss fixed in the v11 migration). Add a row here instead, and a
 * coverage test (table-registry.test.ts) enforces the invariants.
 */

export interface TableSpec {
  /** snake_case database table name */
  table: string;
  /**
   * camelCase key used in SqliteExportData / snapshot files. Present for every
   * table that is exported/synced (all synced tables + none of the cache tables).
   */
  camelKey?: string;
  /** Allowed through generic CRUD (validateTableName / VALID_TABLE_NAMES). */
  genericCrud?: boolean;
  /** Logged to change_log and synced between devices (SYNCED_TABLES). */
  synced?: boolean;
  /**
   * Has a real `study_id` column, so study cascade delete / orphan cleanup
   * filter it with `WHERE study_id = ?` (the cascade `directTables`).
   */
  studyColumn?: boolean;
  /**
   * Generic JSON-data table that ALSO maintains a `study_id` column. These use
   * `sqliteSaveToTableWithStudyId` so every write path populates the column
   * (STUDY_COLUMN_DATA_TABLES). A subset of `studyColumn` tables — the others
   * (marking_presets, section_headings, chapter_titles) have bespoke savers.
   */
  studyDataTable?: boolean;
  /** Wiped by sqliteClearDatabase (all data + caches except preferences). */
  clearedOnReset?: boolean;
}

/**
 * The registry. Order is canonical and preserved by every derivation below
 * (matters for clearDatabase / export ordering only, not correctness).
 */
export const TABLE_REGISTRY: readonly TableSpec[] = [
  { table: 'annotations', camelKey: 'annotations', genericCrud: true, synced: true, clearedOnReset: true },
  { table: 'section_headings', camelKey: 'sectionHeadings', genericCrud: true, synced: true, studyColumn: true, clearedOnReset: true },
  { table: 'chapter_titles', camelKey: 'chapterTitles', genericCrud: true, synced: true, studyColumn: true, clearedOnReset: true },
  { table: 'notes', camelKey: 'notes', genericCrud: true, synced: true, clearedOnReset: true },
  { table: 'marking_presets', camelKey: 'markingPresets', genericCrud: true, synced: true, studyColumn: true, clearedOnReset: true },
  { table: 'studies', camelKey: 'studies', genericCrud: true, synced: true, clearedOnReset: true },
  { table: 'multi_translation_views', camelKey: 'multiTranslationViews', genericCrud: true, synced: true, clearedOnReset: true },
  { table: 'observation_lists', camelKey: 'observationLists', genericCrud: true, synced: true, studyColumn: true, studyDataTable: true, clearedOnReset: true },
  { table: 'time_expressions', camelKey: 'timeExpressions', genericCrud: true, synced: true, clearedOnReset: true },
  { table: 'places', camelKey: 'places', genericCrud: true, synced: true, clearedOnReset: true },
  { table: 'people', camelKey: 'people', genericCrud: true, synced: true, clearedOnReset: true },
  { table: 'conclusions', camelKey: 'conclusions', genericCrud: true, synced: true, clearedOnReset: true },
  { table: 'interpretations', camelKey: 'interpretations', genericCrud: true, synced: true, studyColumn: true, studyDataTable: true, clearedOnReset: true },
  { table: 'applications', camelKey: 'applications', genericCrud: true, synced: true, studyColumn: true, studyDataTable: true, clearedOnReset: true },
  { table: 'entity_notes', camelKey: 'entityNotes', genericCrud: true, synced: true, studyColumn: true, studyDataTable: true, clearedOnReset: true },
  { table: 'keyword_exclusions', camelKey: 'keywordExclusions', genericCrud: true, synced: true, clearedOnReset: true },
  // Synced singleton, but intentionally preserved across a database clear.
  { table: 'preferences', camelKey: 'preferences', genericCrud: true, synced: true },
  // Caches / history: local-only, wiped on reset. chapter_cache is also exposed
  // through generic CRUD; reading_history and translation_cache are not.
  { table: 'chapter_cache', genericCrud: true, clearedOnReset: true },
  { table: 'reading_history', clearedOnReset: true },
  { table: 'translation_cache', clearedOnReset: true },
];

const tablesWhere = (pred: (t: TableSpec) => boolean | undefined): string[] =>
  TABLE_REGISTRY.filter((t) => pred(t)).map((t) => t.table);

/** Tables allowed through generic CRUD (validateTableName). */
export const VALID_TABLE_NAMES: ReadonlySet<string> = new Set(
  tablesWhere((t) => t.genericCrud)
);

/** Tables logged to change_log and synced between devices. */
export const SYNCED_TABLES: ReadonlySet<string> = new Set(
  tablesWhere((t) => t.synced)
);

/** Generic JSON-data tables that also maintain a study_id column. */
export const STUDY_COLUMN_DATA_TABLES: ReadonlySet<string> = new Set(
  tablesWhere((t) => t.studyDataTable)
);

/** All tables with a real study_id column, for study cascade delete. */
export const STUDY_SCOPED_COLUMN_TABLES: readonly string[] = tablesWhere(
  (t) => t.studyColumn
);

/** Tables wiped by sqliteClearDatabase (everything except preferences). */
export const CLEARED_TABLES: readonly string[] = tablesWhere(
  (t) => t.clearedOnReset
);

/**
 * camelCase snapshot/export keys for synced data tables, excluding preferences
 * (which is special-cased as a single-element array in snapshots).
 */
export const SNAPSHOT_TABLE_KEYS: readonly string[] = TABLE_REGISTRY.filter(
  (t) => t.synced && t.camelKey && t.table !== 'preferences'
).map((t) => t.camelKey as string);

const CAMEL_TO_SNAKE: Record<string, string> = Object.fromEntries(
  TABLE_REGISTRY.filter((t) => t.camelKey).map((t) => [t.camelKey as string, t.table])
);

/** Map a camelCase export/snapshot key to its snake_case DB table name. */
export function camelToSnakeTable(name: string): string {
  return CAMEL_TO_SNAKE[name] ?? name;
}
