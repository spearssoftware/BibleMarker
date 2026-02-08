/**
 * SQLite Database Layer for Tauri (iOS/macOS)
 *
 * This module provides SQLite-based storage for native platforms,
 * enabling iCloud sync via the iCloud Documents container.
 *
 * The schema mirrors the Dexie/IndexedDB structure but uses SQLite
 * for better cross-platform sync support.
 */

import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import type {
  Annotation,
  SectionHeading,
  ChapterTitle,
  Note,
} from '@/types/annotation';
import type { MarkingPreset } from '@/types/keyWord';
import type { Study } from '@/types/study';
import type { MultiTranslationView } from '@/types/multiTranslation';
import type { ObservationList } from '@/types/list';
import type { FiveWAndHEntry } from '@/types/observation';
import type { Contrast } from '@/types/contrast';
import type { TimeExpression } from '@/types/timeExpression';
import type { Place } from '@/types/place';
import type { Conclusion } from '@/types/conclusion';
import type { InterpretationEntry } from '@/types/interpretation';
import type { ApplicationEntry } from '@/types/application';
import type { UserPreferences } from './db';
import { isApplePlatform } from './platform';

// ============================================================================
// Database Connection
// ============================================================================

let sqliteDb: Database | null = null;

/**
 * Get or initialize the SQLite database connection.
 * On Apple platforms (iOS/macOS), the database is stored in the iCloud
 * container for cross-device sync. On other platforms, uses local storage.
 */
export async function getSqliteDb(): Promise<Database> {
  if (sqliteDb) {
    return sqliteDb;
  }

  // Determine database path
  let dbPath = 'sqlite:biblemarker.db'; // Fallback for non-Apple platforms

  // Try to get iCloud path on Apple platforms
  if (isApplePlatform()) {
    try {
      const icloudPath = await invoke<string>('get_icloud_database_path');
      dbPath = `sqlite:${icloudPath}`;
      console.log('[SQLite] Using iCloud database path:', icloudPath);
    } catch (error) {
      console.warn('[SQLite] iCloud unavailable, using local storage:', error);
      // Fall back to local storage if iCloud is not available
    }
  }

  // Connect to SQLite database
  sqliteDb = await Database.load(dbPath);

  // Initialize schema
  await initializeSchema(sqliteDb);

  return sqliteDb;
}

/**
 * Close the database connection
 */
export async function closeSqliteDb(): Promise<void> {
  if (sqliteDb) {
    await sqliteDb.close();
    sqliteDb = null;
  }
}

// ============================================================================
// Schema Initialization
// ============================================================================

const SCHEMA_VERSION = 1;

async function initializeSchema(db: Database): Promise<void> {
  // Create schema version table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Check current version
  const result = await db.select<{ version: number }[]>(
    'SELECT version FROM schema_version WHERE id = 1'
  );
  const currentVersion = result[0]?.version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    await migrateSchema(db, currentVersion, SCHEMA_VERSION);
  }
}

async function migrateSchema(
  db: Database,
  fromVersion: number,
  toVersion: number
): Promise<void> {
  console.log(`[SQLite] Migrating schema from v${fromVersion} to v${toVersion}`);

  // Version 1: Initial schema
  if (fromVersion < 1) {
    await createInitialSchema(db);
  }

  // Update schema version
  await db.execute(
    `INSERT OR REPLACE INTO schema_version (id, version, updated_at) VALUES (1, ?, ?)`,
    [toVersion, new Date().toISOString()]
  );
}

async function createInitialSchema(db: Database): Promise<void> {
  // Annotations table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      preset_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_annotations_module ON annotations(module_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_annotations_preset ON annotations(preset_id)`);

  // Section headings table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS section_headings (
      id TEXT PRIMARY KEY,
      before_ref TEXT NOT NULL,
      title TEXT NOT NULL,
      covers_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);

  // Chapter titles table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS chapter_titles (
      id TEXT PRIMARY KEY,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      title TEXT NOT NULL,
      theme TEXT,
      supporting_preset_ids TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_chapter_titles_book ON chapter_titles(book, chapter)`);

  // Notes table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      ref TEXT NOT NULL,
      range TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_notes_module ON notes(module_id)`);

  // Marking presets table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS marking_presets (
      id TEXT PRIMARY KEY,
      word TEXT,
      variants TEXT NOT NULL,
      symbol TEXT,
      highlight TEXT,
      category TEXT,
      description TEXT,
      auto_suggest INTEGER NOT NULL DEFAULT 1,
      usage_count INTEGER NOT NULL DEFAULT 0,
      book_scope TEXT,
      chapter_scope INTEGER,
      module_scope TEXT,
      study_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_marking_presets_word ON marking_presets(word)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_marking_presets_category ON marking_presets(category)`);

  // Studies table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS studies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      book TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);

  // Multi-translation views table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS multi_translation_views (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);

  // Observation lists table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS observation_lists (
      id TEXT PRIMARY KEY,
      key_word_id TEXT,
      study_id TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_observation_lists_keyword ON observation_lists(key_word_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_observation_lists_study ON observation_lists(study_id)`);

  // 5W+H entries table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS five_w_and_h (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);

  // Contrasts table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS contrasts (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);

  // Time expressions table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS time_expressions (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);

  // Places table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);

  // Conclusions table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS conclusions (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);

  // Interpretations table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS interpretations (
      id TEXT PRIMARY KEY,
      study_id TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_interpretations_study ON interpretations(study_id)`);

  // Applications table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);

  // Preferences table (singleton)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS preferences (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT
    )
  `);

  // Reading history table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reading_history (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      timestamp TEXT NOT NULL
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_reading_history_module ON reading_history(module_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_reading_history_timestamp ON reading_history(timestamp)`);

  // Chapter cache table (local only, not synced)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS chapter_cache (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verses TEXT NOT NULL,
      cached_at TEXT NOT NULL
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_chapter_cache_module ON chapter_cache(module_id)`);

  // Translation cache table (local only, not synced)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS translation_cache (
      id TEXT PRIMARY KEY,
      translations TEXT NOT NULL,
      cached_at TEXT NOT NULL
    )
  `);

  // ESV rate limit state (local only, not synced)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS esv_rate_limit (
      id TEXT PRIMARY KEY,
      request_timestamps TEXT NOT NULL
    )
  `);

  console.log('[SQLite] Initial schema created');
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDeviceId(): string {
  // Generate or retrieve a unique device ID
  if (typeof window !== 'undefined') {
    let deviceId = localStorage.getItem('biblemarker_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('biblemarker_device_id', deviceId);
    }
    return deviceId;
  }
  return crypto.randomUUID();
}

function toISOString(date: Date | string | undefined): string {
  if (!date) return new Date().toISOString();
  if (typeof date === 'string') return date;
  return date.toISOString();
}

// ============================================================================
// Annotation Operations
// ============================================================================

export async function sqliteGetChapterAnnotations(
  moduleId: string,
  book: string,
  chapter: number
): Promise<Annotation[]> {
  const db = await getSqliteDb();
  const rows = await db.select<{ id: string; data: string }[]>(
    `SELECT id, data FROM annotations WHERE module_id = ?`,
    [moduleId]
  );

  return rows
    .map((row) => {
      const ann = JSON.parse(row.data) as Annotation;
      ann.createdAt = new Date(ann.createdAt);
      ann.updatedAt = new Date(ann.updatedAt);
      return ann;
    })
    .filter((ann) => {
      if (ann.type === 'symbol') {
        return ann.ref.book === book && ann.ref.chapter === chapter;
      }
      return ann.startRef.book === book && ann.startRef.chapter === chapter;
    });
}

export async function sqliteSaveAnnotation(annotation: Annotation): Promise<string> {
  const db = await getSqliteDb();
  const now = toISOString(new Date());
  const deviceId = getDeviceId();

  await db.execute(
    `INSERT OR REPLACE INTO annotations 
     (id, module_id, type, data, preset_id, created_at, updated_at, sync_status, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      annotation.id,
      annotation.moduleId,
      annotation.type,
      JSON.stringify(annotation),
      annotation.presetId ?? null,
      toISOString(annotation.createdAt),
      now,
      deviceId,
    ]
  );

  return annotation.id;
}

export async function sqliteDeleteAnnotation(id: string): Promise<void> {
  const db = await getSqliteDb();
  await db.execute(`DELETE FROM annotations WHERE id = ?`, [id]);
}

// ============================================================================
// Section Heading Operations
// ============================================================================

export async function sqliteGetChapterHeadings(
  book: string,
  chapter: number
): Promise<SectionHeading[]> {
  const db = await getSqliteDb();
  const rows = await db.select<
    {
      id: string;
      before_ref: string;
      title: string;
      covers_until: string | null;
      created_at: string;
      updated_at: string;
    }[]
  >(
    `SELECT * FROM section_headings WHERE before_ref LIKE ?`,
    [`%"book":"${book}","chapter":${chapter}%`]
  );

  return rows.map((row) => ({
    id: row.id,
    beforeRef: JSON.parse(row.before_ref),
    title: row.title,
    coversUntil: row.covers_until ? JSON.parse(row.covers_until) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

export async function sqliteSaveSectionHeading(heading: SectionHeading): Promise<string> {
  const db = await getSqliteDb();
  const now = toISOString(new Date());
  const deviceId = getDeviceId();

  await db.execute(
    `INSERT OR REPLACE INTO section_headings 
     (id, before_ref, title, covers_until, created_at, updated_at, sync_status, device_id)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      heading.id,
      JSON.stringify(heading.beforeRef),
      heading.title,
      heading.coversUntil ? JSON.stringify(heading.coversUntil) : null,
      toISOString(heading.createdAt),
      now,
      deviceId,
    ]
  );

  return heading.id;
}

export async function sqliteDeleteSectionHeading(id: string): Promise<void> {
  const db = await getSqliteDb();
  await db.execute(`DELETE FROM section_headings WHERE id = ?`, [id]);
}

// ============================================================================
// Chapter Title Operations
// ============================================================================

export async function sqliteGetChapterTitle(
  book: string,
  chapter: number
): Promise<ChapterTitle | undefined> {
  const db = await getSqliteDb();
  const rows = await db.select<
    {
      id: string;
      book: string;
      chapter: number;
      title: string;
      theme: string | null;
      supporting_preset_ids: string | null;
      created_at: string;
      updated_at: string;
    }[]
  >(
    `SELECT * FROM chapter_titles WHERE book = ? AND chapter = ?`,
    [book, chapter]
  );

  if (rows.length === 0) return undefined;

  const row = rows[0];
  return {
    id: row.id,
    book: row.book,
    chapter: row.chapter,
    title: row.title,
    theme: row.theme ?? undefined,
    supportingPresetIds: row.supporting_preset_ids
      ? JSON.parse(row.supporting_preset_ids)
      : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function sqliteSaveChapterTitle(title: ChapterTitle): Promise<string> {
  const db = await getSqliteDb();
  const now = toISOString(new Date());
  const deviceId = getDeviceId();

  await db.execute(
    `INSERT OR REPLACE INTO chapter_titles 
     (id, book, chapter, title, theme, supporting_preset_ids, created_at, updated_at, sync_status, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      title.id,
      title.book,
      title.chapter,
      title.title,
      title.theme ?? null,
      title.supportingPresetIds ? JSON.stringify(title.supportingPresetIds) : null,
      toISOString(title.createdAt),
      now,
      deviceId,
    ]
  );

  return title.id;
}

export async function sqliteDeleteChapterTitle(id: string): Promise<void> {
  const db = await getSqliteDb();
  await db.execute(`DELETE FROM chapter_titles WHERE id = ?`, [id]);
}

// ============================================================================
// Note Operations
// ============================================================================

export async function sqliteGetChapterNotes(
  moduleId: string,
  book: string,
  chapter: number
): Promise<Note[]> {
  const db = await getSqliteDb();
  const normalizedModuleId = moduleId.toUpperCase();

  const rows = await db.select<
    {
      id: string;
      module_id: string;
      ref: string;
      range: string | null;
      content: string;
      created_at: string;
      updated_at: string;
    }[]
  >(`SELECT * FROM notes WHERE UPPER(module_id) = ?`, [normalizedModuleId]);

  return rows
    .map((row) => ({
      id: row.id,
      moduleId: row.module_id,
      ref: JSON.parse(row.ref),
      range: row.range ? JSON.parse(row.range) : undefined,
      content: row.content,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }))
    .filter((note) => {
      if (note.range) {
        return note.range.start.book === book && note.range.start.chapter === chapter;
      }
      return note.ref.book === book && note.ref.chapter === chapter;
    });
}

export async function sqliteSaveNote(note: Note): Promise<string> {
  const db = await getSqliteDb();
  const now = toISOString(new Date());
  const deviceId = getDeviceId();

  await db.execute(
    `INSERT OR REPLACE INTO notes 
     (id, module_id, ref, range, content, created_at, updated_at, sync_status, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      note.id,
      note.moduleId,
      JSON.stringify(note.ref),
      note.range ? JSON.stringify(note.range) : null,
      note.content,
      toISOString(note.createdAt),
      now,
      deviceId,
    ]
  );

  return note.id;
}

export async function sqliteDeleteNote(id: string): Promise<void> {
  const db = await getSqliteDb();
  await db.execute(`DELETE FROM notes WHERE id = ?`, [id]);
}

// ============================================================================
// Marking Preset Operations
// ============================================================================

export async function sqliteGetAllMarkingPresets(): Promise<MarkingPreset[]> {
  const db = await getSqliteDb();
  const rows = await db.select<
    {
      id: string;
      word: string | null;
      variants: string;
      symbol: string | null;
      highlight: string | null;
      category: string | null;
      description: string | null;
      auto_suggest: number;
      usage_count: number;
      book_scope: string | null;
      chapter_scope: number | null;
      module_scope: string | null;
      study_id: string | null;
      created_at: string;
      updated_at: string;
    }[]
  >(`SELECT * FROM marking_presets`);

  return rows.map((row): MarkingPreset => ({
    id: row.id,
    word: row.word ?? undefined,
    variants: JSON.parse(row.variants),
    symbol: (row.symbol ?? undefined) as MarkingPreset['symbol'],
    highlight: row.highlight ? JSON.parse(row.highlight) : undefined,
    category: (row.category ?? undefined) as MarkingPreset['category'],
    description: row.description ?? undefined,
    autoSuggest: row.auto_suggest === 1,
    usageCount: row.usage_count,
    bookScope: row.book_scope ?? undefined,
    chapterScope: row.chapter_scope ?? undefined,
    moduleScope: row.module_scope ?? undefined,
    studyId: row.study_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

export async function sqliteSaveMarkingPreset(preset: MarkingPreset): Promise<string> {
  const db = await getSqliteDb();
  const now = toISOString(new Date());
  const deviceId = getDeviceId();

  await db.execute(
    `INSERT OR REPLACE INTO marking_presets 
     (id, word, variants, symbol, highlight, category, description, auto_suggest, usage_count,
      book_scope, chapter_scope, module_scope, study_id, created_at, updated_at, sync_status, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      preset.id,
      preset.word ?? null,
      JSON.stringify(preset.variants),
      preset.symbol ?? null,
      preset.highlight ? JSON.stringify(preset.highlight) : null,
      preset.category ?? null,
      preset.description ?? null,
      preset.autoSuggest ? 1 : 0,
      preset.usageCount,
      preset.bookScope ?? null,
      preset.chapterScope ?? null,
      preset.moduleScope ?? null,
      preset.studyId ?? null,
      toISOString(preset.createdAt),
      now,
      deviceId,
    ]
  );

  return preset.id;
}

export async function sqliteDeleteMarkingPreset(id: string): Promise<void> {
  const db = await getSqliteDb();
  await db.execute(`DELETE FROM marking_presets WHERE id = ?`, [id]);
}

// ============================================================================
// Study Operations
// ============================================================================

export async function sqliteGetAllStudies(): Promise<Study[]> {
  const db = await getSqliteDb();
  const rows = await db.select<
    {
      id: string;
      name: string;
      book: string | null;
      is_active: number;
      created_at: string;
      updated_at: string;
    }[]
  >(`SELECT * FROM studies`);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    book: row.book ?? undefined,
    isActive: row.is_active === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

export async function sqliteSaveStudy(study: Study): Promise<string> {
  const db = await getSqliteDb();
  const now = toISOString(new Date());
  const deviceId = getDeviceId();

  await db.execute(
    `INSERT OR REPLACE INTO studies 
     (id, name, book, is_active, created_at, updated_at, sync_status, device_id)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      study.id,
      study.name,
      study.book ?? null,
      study.isActive ? 1 : 0,
      toISOString(study.createdAt),
      now,
      deviceId,
    ]
  );

  return study.id;
}

export async function sqliteDeleteStudy(id: string): Promise<void> {
  const db = await getSqliteDb();
  await db.execute(`DELETE FROM studies WHERE id = ?`, [id]);
}

// ============================================================================
// Preferences Operations
// ============================================================================

export async function sqliteGetPreferences(): Promise<UserPreferences | null> {
  const db = await getSqliteDb();
  const rows = await db.select<{ id: string; data: string }[]>(
    `SELECT * FROM preferences WHERE id = 'main'`
  );

  if (rows.length === 0) return null;

  const prefs = JSON.parse(rows[0].data) as UserPreferences;
  return prefs;
}

export async function sqliteSavePreferences(prefs: UserPreferences): Promise<void> {
  const db = await getSqliteDb();
  const now = toISOString(new Date());
  const deviceId = getDeviceId();

  await db.execute(
    `INSERT OR REPLACE INTO preferences (id, data, updated_at, sync_status, device_id)
     VALUES ('main', ?, ?, 'pending', ?)`,
    [JSON.stringify(prefs), now, deviceId]
  );
}

// ============================================================================
// Generic Data Operations (for observation types)
// ============================================================================

// Whitelist of valid table names to prevent SQL injection
const VALID_TABLE_NAMES = new Set([
  'annotations',
  'section_headings',
  'chapter_titles',
  'notes',
  'marking_presets',
  'studies',
  'multi_translation_views',
  'observation_lists',
  'five_w_and_h',
  'contrasts',
  'time_expressions',
  'places',
  'conclusions',
  'preferences',
  'chapter_cache',
]);

function validateTableName(tableName: string): void {
  if (!VALID_TABLE_NAMES.has(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
}

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    console.error('[SQLite] Failed to parse JSON:', error);
    return fallback;
  }
}

export async function sqliteGetAllFromTable<T>(tableName: string): Promise<T[]> {
  validateTableName(tableName);
  const db = await getSqliteDb();
  const rows = await db.select<{ id: string; data: string }[]>(
    `SELECT id, data FROM ${tableName}`
  );

  return rows
    .map((row) => safeJsonParse<T | null>(row.data, null))
    .filter((item): item is T => item !== null);
}

export async function sqliteSaveToTable<T extends { id: string; createdAt?: Date }>(
  tableName: string,
  item: T
): Promise<string> {
  validateTableName(tableName);
  const db = await getSqliteDb();
  const now = toISOString(new Date());
  const deviceId = getDeviceId();
  // Preserve original createdAt if it exists, otherwise use current time
  const createdAt = item.createdAt ? toISOString(item.createdAt) : now;

  await db.execute(
    `INSERT OR REPLACE INTO ${tableName} (id, data, created_at, updated_at, sync_status, device_id)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
    [item.id, JSON.stringify(item), createdAt, now, deviceId]
  );

  return item.id;
}

export async function sqliteDeleteFromTable(tableName: string, id: string): Promise<void> {
  validateTableName(tableName);
  const db = await getSqliteDb();
  await db.execute(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
}

// ============================================================================
// Bulk Export/Import for Migration
// ============================================================================

export interface SqliteExportData {
  annotations: Annotation[];
  sectionHeadings: SectionHeading[];
  chapterTitles: ChapterTitle[];
  notes: Note[];
  markingPresets: MarkingPreset[];
  studies: Study[];
  multiTranslationViews: MultiTranslationView[];
  observationLists: ObservationList[];
  fiveWAndH: FiveWAndHEntry[];
  contrasts: Contrast[];
  timeExpressions: TimeExpression[];
  places: Place[];
  conclusions: Conclusion[];
  interpretations: InterpretationEntry[];
  applications: ApplicationEntry[];
  preferences: UserPreferences | null;
}

export async function sqliteExportAll(): Promise<SqliteExportData> {
  const db = await getSqliteDb();

  // Get annotations
  const annotationRows = await db.select<{ data: string }[]>(`SELECT data FROM annotations`);
  const annotations = annotationRows.map((r) => {
    const ann = JSON.parse(r.data) as Annotation;
    ann.createdAt = new Date(ann.createdAt);
    ann.updatedAt = new Date(ann.updatedAt);
    return ann;
  });

  // Get other data
  const markingPresets = await sqliteGetAllMarkingPresets();
  const studies = await sqliteGetAllStudies();
  const preferences = await sqliteGetPreferences();

  // Get observation data
  const fiveWAndH = await sqliteGetAllFromTable<FiveWAndHEntry>('five_w_and_h');
  const contrasts = await sqliteGetAllFromTable<Contrast>('contrasts');
  const timeExpressions = await sqliteGetAllFromTable<TimeExpression>('time_expressions');
  const places = await sqliteGetAllFromTable<Place>('places');
  const conclusions = await sqliteGetAllFromTable<Conclusion>('conclusions');
  const interpretations = await sqliteGetAllFromTable<InterpretationEntry>('interpretations');
  const applications = await sqliteGetAllFromTable<ApplicationEntry>('applications');
  const observationLists = await sqliteGetAllFromTable<ObservationList>('observation_lists');
  const multiTranslationViews = await sqliteGetAllFromTable<MultiTranslationView>('multi_translation_views');

  // Get headings and titles
  const headingRows = await db.select<
    {
      id: string;
      before_ref: string;
      title: string;
      covers_until: string | null;
      created_at: string;
      updated_at: string;
    }[]
  >(`SELECT * FROM section_headings`);
  const sectionHeadings = headingRows.map((row) => ({
    id: row.id,
    beforeRef: JSON.parse(row.before_ref),
    title: row.title,
    coversUntil: row.covers_until ? JSON.parse(row.covers_until) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));

  const titleRows = await db.select<
    {
      id: string;
      book: string;
      chapter: number;
      title: string;
      theme: string | null;
      supporting_preset_ids: string | null;
      created_at: string;
      updated_at: string;
    }[]
  >(`SELECT * FROM chapter_titles`);
  const chapterTitles = titleRows.map((row) => ({
    id: row.id,
    book: row.book,
    chapter: row.chapter,
    title: row.title,
    theme: row.theme ?? undefined,
    supportingPresetIds: row.supporting_preset_ids
      ? JSON.parse(row.supporting_preset_ids)
      : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));

  const noteRows = await db.select<
    {
      id: string;
      module_id: string;
      ref: string;
      range: string | null;
      content: string;
      created_at: string;
      updated_at: string;
    }[]
  >(`SELECT * FROM notes`);
  const notes = noteRows.map((row) => ({
    id: row.id,
    moduleId: row.module_id,
    ref: JSON.parse(row.ref),
    range: row.range ? JSON.parse(row.range) : undefined,
    content: row.content,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));

  return {
    annotations,
    sectionHeadings,
    chapterTitles,
    notes,
    markingPresets,
    studies,
    multiTranslationViews,
    observationLists,
    fiveWAndH,
    contrasts,
    timeExpressions,
    places,
    conclusions,
    interpretations,
    applications,
    preferences,
  };
}

export async function sqliteImportAll(data: SqliteExportData): Promise<void> {
  // Ensure database is initialized before importing
  await getSqliteDb();

  // Import in transaction for consistency
  // Note: tauri-plugin-sql doesn't support transactions directly,
  // so we'll just do sequential inserts

  // Import annotations
  for (const ann of data.annotations) {
    await sqliteSaveAnnotation(ann);
  }

  // Import section headings
  for (const heading of data.sectionHeadings) {
    await sqliteSaveSectionHeading(heading);
  }

  // Import chapter titles
  for (const title of data.chapterTitles) {
    await sqliteSaveChapterTitle(title);
  }

  // Import notes
  for (const note of data.notes) {
    await sqliteSaveNote(note);
  }

  // Import marking presets
  for (const preset of data.markingPresets) {
    await sqliteSaveMarkingPreset(preset);
  }

  // Import studies
  for (const study of data.studies) {
    await sqliteSaveStudy(study);
  }

  // Import observation data
  for (const item of data.fiveWAndH) {
    await sqliteSaveToTable('five_w_and_h', item);
  }
  for (const item of data.contrasts) {
    await sqliteSaveToTable('contrasts', item);
  }
  for (const item of data.timeExpressions) {
    await sqliteSaveToTable('time_expressions', item);
  }
  for (const item of data.places) {
    await sqliteSaveToTable('places', item);
  }
  for (const item of data.conclusions) {
    await sqliteSaveToTable('conclusions', item);
  }
  for (const item of data.interpretations) {
    await sqliteSaveToTable('interpretations', item);
  }
  for (const item of data.applications) {
    await sqliteSaveToTable('applications', item);
  }
  for (const item of data.observationLists) {
    await sqliteSaveToTable('observation_lists', item);
  }
  for (const item of data.multiTranslationViews) {
    await sqliteSaveToTable('multi_translation_views', item);
  }

  // Import preferences
  if (data.preferences) {
    await sqliteSavePreferences(data.preferences);
  }
}

// ============================================================================
// Clear Database
// ============================================================================

export async function sqliteClearDatabase(): Promise<void> {
  const db = await getSqliteDb();

  const tables = [
    'annotations',
    'section_headings',
    'chapter_titles',
    'notes',
    'marking_presets',
    'studies',
    'multi_translation_views',
    'observation_lists',
    'five_w_and_h',
    'contrasts',
    'time_expressions',
    'places',
    'conclusions',
    'interpretations',
    'applications',
    'reading_history',
    'chapter_cache',
    'translation_cache',
  ];

  for (const table of tables) {
    await db.execute(`DELETE FROM ${table}`);
  }

  // Dispatch event to notify stores
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('databaseCleared'));
  }
}
