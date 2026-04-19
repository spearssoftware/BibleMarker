/**
 * Database Layer
 *
 * Unified interface for all database operations.
 * Uses SQLite via @tauri-apps/plugin-sql (Tauri-only app).
 */

import type {
  Annotation,
  SectionHeading,
  ChapterTitle,
  Note,
} from '@/types';
import type { MarkingPreset } from '@/types';
import type { Study } from '@/types';
import type { MultiTranslationView } from '@/types';
import type { ObservationList } from '@/types';
import type { TimeExpression } from '@/types';
import type { Place } from '@/types';
import type { Person } from '@/types';
import type { Conclusion } from '@/types';
import type { InterpretationEntry } from '@/types';
import type { ApplicationEntry } from '@/types';
import type { UserPreferences } from '@/types';
import type { KeywordExclusion } from '@/types';

export type { UserPreferences, ApiConfigRecord, OnboardingState, AutoBackupConfig } from '@/types';

import { waitForTauriInternals } from './platform';

// Lazy-load sqlite-db module
let sqliteModule: typeof import('./sqlite-db') | null = null;

async function sqlite() {
  if (!sqliteModule) {
    sqliteModule = await import('./sqlite-db');
  }
  return sqliteModule;
}

/**
 * Record a change for sync after a write operation.
 * Captures the full row data so the sync journal can replay it on other devices.
 */
async function logChange(
  tableName: string,
  op: 'upsert' | 'delete',
  rowId: string,
  data?: unknown
): Promise<void> {
  try {
    const mod = await sqlite();
    await mod.recordChange(tableName, op, rowId, data ? JSON.stringify(data) : null);
  } catch (error) {
    // Don't fail the main operation if change logging fails
    console.error('[DB] Failed to log change:', error);
  }
}

// ============================================================================
// Database Lifecycle
// ============================================================================

export async function initDatabase(): Promise<void> {
  await waitForTauriInternals();
  const mod = await sqlite();
  await mod.getSqliteDb();
  await mod.sqliteCleanupOrphanedStudyRecords();
}

export async function closeDatabase(): Promise<void> {
  const mod = await sqlite();
  await mod.closeSqliteDb();
}

export type { SyncDiagnostics } from './sqlite-db';

export async function getSyncDiagnostics() {
  const mod = await sqlite();
  return mod.getSyncDiagnostics();
}

// ============================================================================
// Annotation Operations
// ============================================================================

export async function getChapterAnnotations(
  moduleId: string,
  book: string,
  chapter: number
): Promise<Annotation[]> {
  const mod = await sqlite();
  return mod.sqliteGetChapterAnnotations(moduleId, book, chapter);
}

export async function saveAnnotation(annotation: Annotation): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveAnnotation(annotation);
  await logChange('annotations', 'upsert', annotation.id, annotation);
  return result;
}

export async function deleteAnnotation(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteAnnotation(id);
  await logChange('annotations', 'delete', id);
}

/**
 * Prune any tracker records (places/people/time/conclusions) linked to this
 * preset whose tracker no longer matches the preset's current category. Used
 * when a preset's category changes so stale entries don't linger in trackers
 * the preset no longer belongs to.
 */
export async function pruneTrackersForPreset(presetId: string, currentCategory: string | undefined): Promise<void> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const trackers: Array<{ table: string; category: string }> = [
    { table: 'places', category: 'places' },
    { table: 'people', category: 'people' },
    { table: 'time_expressions', category: 'time' },
    { table: 'conclusions', category: 'conclusions' },
  ];
  for (const { table, category } of trackers) {
    if (currentCategory === category) continue;
    const rows = await db.select<{ id: string }[]>(
      `SELECT id FROM ${table} WHERE json_extract(data, '$.presetId') = ?`,
      [presetId],
    );
    for (const row of rows) {
      await db.execute(`DELETE FROM ${table} WHERE id = ?`, [row.id]);
      await logChange(table, 'delete', row.id);
    }
  }
}

/** Fetch a single annotation by id, or null if missing. */
export async function getAnnotationById(id: string): Promise<Annotation | null> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const rows = await db.select<{ data: string }[]>(
    `SELECT data FROM annotations WHERE id = ? LIMIT 1`,
    [id],
  );
  if (rows.length === 0) return null;
  return JSON.parse(rows[0].data) as Annotation;
}

/**
 * Find sister annotations across other translations — same presetId, same verse,
 * same selectedText (case-insensitive). Used by the cross-translation cascade
 * delete so removing a propagated mark cleans up its twins in other modules.
 */
export async function findSisterAnnotations(annotation: Annotation): Promise<string[]> {
  if (!annotation.presetId) return [];
  const verseRef = annotation.type === 'symbol' ? annotation.ref : annotation.startRef;
  const selectedText = (annotation.selectedText ?? '').trim().toLowerCase();
  if (!selectedText) return [];

  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const rows = await db.select<{ id: string; data: string; module_id: string }[]>(
    `SELECT id, data, module_id FROM annotations WHERE preset_id = ? AND id != ?`,
    [annotation.presetId, annotation.id],
  );
  return rows.filter(row => {
    const ann = JSON.parse(row.data) as Annotation;
    const ref = ann.type === 'symbol' ? ann.ref : ann.startRef;
    if (ref.book !== verseRef.book || ref.chapter !== verseRef.chapter || ref.verse !== verseRef.verse) {
      return false;
    }
    const sisterText = (ann.selectedText ?? '').trim().toLowerCase();
    return sisterText === selectedText;
  }).map(row => row.id);
}

/**
 * Delete all annotations (symbol + text) for a single verse across every module.
 * Useful as a dev cleanup when a misaligned propagation has scattered bad marks
 * across translations. Returns the number of rows deleted.
 */
export async function clearVerseAnnotations(book: string, chapter: number, verse: number): Promise<number> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const rows = await db.select<{ id: string; data: string }[]>(
    `SELECT id, data FROM annotations`
  );
  const toDelete = rows.filter(row => {
    const ann = JSON.parse(row.data) as Annotation;
    if (ann.type === 'symbol') {
      return ann.ref.book === book && ann.ref.chapter === chapter && ann.ref.verse === verse;
    }
    return ann.startRef.book === book && ann.startRef.chapter === chapter && ann.startRef.verse === verse;
  });
  for (const row of toDelete) {
    await db.execute(`DELETE FROM annotations WHERE id = ?`, [row.id]);
    await logChange('annotations', 'delete', row.id);
  }
  return toDelete.length;
}

export async function clearBookAnnotations(book: string, moduleId?: string): Promise<number> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const rows = await db.select<{ id: string; data: string; module_id: string }[]>(
    `SELECT id, data, module_id FROM annotations`
  );
  const toDelete = rows.filter(row => {
    const ann = JSON.parse(row.data) as Annotation;
    const bookMatch = ann.type === 'symbol' ? ann.ref.book === book : ann.startRef.book === book;
    if (!bookMatch) return false;
    if (moduleId) return row.module_id === moduleId;
    return true;
  });
  for (const row of toDelete) {
    await db.execute(`DELETE FROM annotations WHERE id = ?`, [row.id]);
    await logChange('annotations', 'delete', row.id);
  }
  return toDelete.length;
}

// ============================================================================
// Section Heading Operations
// ============================================================================

export async function getChapterHeadings(
  _moduleId: string | null | undefined,
  book: string,
  chapter: number,
  studyId?: string | null
): Promise<SectionHeading[]> {
  const mod = await sqlite();
  return mod.sqliteGetChapterHeadings(book, chapter, studyId);
}

export async function saveSectionHeading(heading: SectionHeading): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveSectionHeading(heading);
  await logChange('section_headings', 'upsert', heading.id, heading);
  return result;
}

export async function deleteSectionHeading(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteSectionHeading(id);
  await logChange('section_headings', 'delete', id);
}

export async function getAllSectionHeadings(): Promise<SectionHeading[]> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const rows = await db.select<{
    id: string;
    before_ref: string;
    title: string;
    covers_until: string | null;
    study_id: string | null;
    created_at: string;
    updated_at: string;
  }[]>(`SELECT * FROM section_headings`);
  return rows.map(row => ({
    id: row.id,
    beforeRef: JSON.parse(row.before_ref),
    title: row.title,
    coversUntil: row.covers_until ? JSON.parse(row.covers_until) : undefined,
    studyId: row.study_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

// ============================================================================
// Chapter Title Operations
// ============================================================================

export async function getChapterTitle(
  _moduleId: string | null | undefined,
  book: string,
  chapter: number,
  studyId?: string | null
): Promise<ChapterTitle | undefined> {
  const mod = await sqlite();
  return mod.sqliteGetChapterTitle(book, chapter, studyId);
}

export async function saveChapterTitle(title: ChapterTitle): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveChapterTitle(title);
  await logChange('chapter_titles', 'upsert', title.id, title);
  return result;
}

export async function deleteChapterTitle(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteChapterTitle(id);
  await logChange('chapter_titles', 'delete', id);
}

export async function getAllChapterTitles(): Promise<ChapterTitle[]> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const rows = await db.select<{
    id: string;
    book: string;
    chapter: number;
    title: string;
    theme: string | null;
    supporting_preset_ids: string | null;
    study_id: string | null;
    created_at: string;
    updated_at: string;
  }[]>(`SELECT * FROM chapter_titles`);
  return rows.map(row => ({
    id: row.id,
    book: row.book,
    chapter: row.chapter,
    title: row.title,
    theme: row.theme ?? undefined,
    supportingPresetIds: row.supporting_preset_ids ? JSON.parse(row.supporting_preset_ids) : undefined,
    studyId: row.study_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

// ============================================================================
// Note Operations
// ============================================================================

export async function getChapterNotes(
  moduleId: string,
  book: string,
  chapter: number
): Promise<Note[]> {
  const mod = await sqlite();
  return mod.sqliteGetChapterNotes(moduleId, book, chapter);
}

export async function saveNote(note: Note): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveNote(note);
  await logChange('notes', 'upsert', note.id, note);
  return result;
}

export async function deleteNote(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteNote(id);
  await logChange('notes', 'delete', id);
}

export async function getAllNotes(): Promise<Note[]> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const rows = await db.select<{
    id: string;
    module_id: string;
    ref: string;
    range: string | null;
    content: string;
    created_at: string;
    updated_at: string;
  }[]>(`SELECT id, module_id, ref, range, content, created_at, updated_at FROM notes`);
  return rows.map(row => ({
    id: row.id,
    moduleId: row.module_id,
    ref: JSON.parse(row.ref),
    range: row.range ? JSON.parse(row.range) : undefined,
    content: row.content,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

// ============================================================================
// Marking Preset Operations
// ============================================================================

export async function getAllMarkingPresets(): Promise<MarkingPreset[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllMarkingPresets();
}

export async function getMarkingPreset(id: string): Promise<MarkingPreset | undefined> {
  const all = await getAllMarkingPresets();
  return all.find(p => p.id === id);
}

export async function getMarkingPresetsByCategory(category: string): Promise<MarkingPreset[]> {
  const all = await getAllMarkingPresets();
  return all.filter(p => p.category === category);
}

export async function saveMarkingPreset(preset: MarkingPreset): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveMarkingPreset(preset);
  await logChange('marking_presets', 'upsert', preset.id, preset);
  return result;
}

export async function deleteMarkingPreset(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteMarkingPreset(id);
  await logChange('marking_presets', 'delete', id);
}

export async function searchMarkingPresets(text: string): Promise<MarkingPreset[]> {
  const all = await getAllMarkingPresets();
  const lower = text.toLowerCase().trim();
  return all.filter((p) => {
    if (!p.word) return false;
    if (p.word.toLowerCase() === lower) return true;
    return (p.variants || []).some((v) => {
      const variantText = typeof v === 'string' ? v : v.text;
      return variantText.toLowerCase() === lower;
    });
  });
}

export async function incrementMarkingPresetUsage(id: string): Promise<void> {
  const preset = await getMarkingPreset(id);
  if (preset) {
    preset.usageCount = (preset.usageCount || 0) + 1;
    preset.updatedAt = new Date();
    await saveMarkingPreset(preset);
  }
}

// ============================================================================
// Study Operations
// ============================================================================

export async function getAllStudies(): Promise<Study[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllStudies();
}

export async function saveStudy(study: Study): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveStudy(study);
  await logChange('studies', 'upsert', study.id, study);
  return result;
}

export async function deleteStudy(id: string): Promise<void> {
  const mod = await sqlite();

  // Find all scoped records so we can log sync changes before deleting
  const scopedRecords = await mod.sqliteFindStudyScopedIds(id);

  // Cascade-delete all scoped records + the study itself
  await mod.sqliteCascadeDeleteStudy(id);

  // Log sync changes for all deleted records
  for (const { table, ids } of scopedRecords) {
    for (const rowId of ids) {
      await logChange(table, 'delete', rowId);
    }
  }
  await logChange('studies', 'delete', id);
}

// ============================================================================
// Preferences Operations
// ============================================================================

const DEFAULT_PREFERENCES: UserPreferences = {
  id: 'main',
  marking: {
    recentColors: [],
    recentSymbols: [],
    defaultTool: 'highlight',
    defaultColor: 'yellow',
    defaultSymbol: 'cross',
    toolbarPosition: 'bottom',
    showToolbarByDefault: true,
  },
  fontSize: 'base',
  theme: 'auto',
  favoriteTranslations: [],
  recentTranslations: [],
  onboarding: {
    hasSeenWelcome: false,
    hasCompletedTour: false,
    dismissedTooltips: [],
  },
};

export async function getPreferences(): Promise<UserPreferences> {
  const mod = await sqlite();
  const prefs = await mod.sqliteGetPreferences();
  if (prefs) return prefs;
  await mod.sqliteSavePreferences(DEFAULT_PREFERENCES);
  return DEFAULT_PREFERENCES;
}

export async function updatePreferences(
  updates: Partial<Omit<UserPreferences, 'id'>>
): Promise<void> {
  const mod = await sqlite();
  const current = await mod.sqliteGetPreferences();
  if (current) {
    const merged = { ...current, ...updates };
    await mod.sqliteSavePreferences(merged);
    await logChange('preferences', 'upsert', 'main', merged);
  }
}

// ============================================================================
// Multi-Translation View Operations
// ============================================================================

export async function getMultiTranslationView(
  id: string = 'active'
): Promise<MultiTranslationView | undefined> {
  const mod = await sqlite();
  const views = await mod.sqliteGetAllFromTable<MultiTranslationView>('multi_translation_views');
  return views.find((v) => v.id === id);
}

export async function saveMultiTranslationView(view: MultiTranslationView): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveToTable('multi_translation_views', view);
  await logChange('multi_translation_views', 'upsert', view.id, view);
  return result;
}

export async function deleteMultiTranslationView(id: string = 'active'): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteFromTable('multi_translation_views', id);
  await logChange('multi_translation_views', 'delete', id);
}

// ============================================================================
// Observation Data Operations
// ============================================================================

export async function getAllObservationLists(): Promise<ObservationList[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<ObservationList>('observation_lists');
}

export async function saveObservationList(list: ObservationList): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveToTable('observation_lists', list);
  await logChange('observation_lists', 'upsert', list.id, list);
  return result;
}

export async function deleteObservationList(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteFromTable('observation_lists', id);
  await logChange('observation_lists', 'delete', id);
}

// Time Expression Operations
export async function getAllTimeExpressions(): Promise<TimeExpression[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<TimeExpression>('time_expressions');
}

export async function saveTimeExpression(entry: TimeExpression): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveToTable('time_expressions', entry);
  await logChange('time_expressions', 'upsert', entry.id, entry);
  return result;
}

export async function deleteTimeExpression(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteFromTable('time_expressions', id);
  await logChange('time_expressions', 'delete', id);
}

// Place Operations
export async function getAllPlaces(): Promise<Place[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<Place>('places');
}

export async function savePlace(entry: Place): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveToTable('places', entry);
  await logChange('places', 'upsert', entry.id, entry);
  return result;
}

export async function deletePlace(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteFromTable('places', id);
  await logChange('places', 'delete', id);
}

// Person Operations
export async function getAllPeople(): Promise<Person[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<Person>('people');
}

export async function savePerson(entry: Person): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveToTable('people', entry);
  await logChange('people', 'upsert', entry.id, entry);
  return result;
}

export async function deletePerson(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteFromTable('people', id);
  await logChange('people', 'delete', id);
}

// Keyword Exclusion Operations
export async function getAllKeywordExclusions(): Promise<KeywordExclusion[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<KeywordExclusion>('keyword_exclusions');
}

export async function saveKeywordExclusion(entry: KeywordExclusion): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveToTable('keyword_exclusions', entry);
  await logChange('keyword_exclusions', 'upsert', entry.id, entry);
  return result;
}

export async function deleteKeywordExclusion(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteFromTable('keyword_exclusions', id);
  await logChange('keyword_exclusions', 'delete', id);
}

export async function deleteKeywordExclusionsByPreset(presetId: string): Promise<void> {
  const all = await getAllKeywordExclusions();
  const linked = all.filter(e => e.presetId === presetId);
  await Promise.all(linked.map(e => deleteKeywordExclusion(e.id)));
}

// Conclusion Operations
export async function getAllConclusions(): Promise<Conclusion[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<Conclusion>('conclusions');
}

export async function saveConclusion(entry: Conclusion): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveToTable('conclusions', entry);
  await logChange('conclusions', 'upsert', entry.id, entry);
  return result;
}

export async function deleteConclusion(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteFromTable('conclusions', id);
  await logChange('conclusions', 'delete', id);
}

// Interpretation Operations
export async function getAllInterpretations(): Promise<InterpretationEntry[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<InterpretationEntry>('interpretations');
}

export async function saveInterpretation(entry: InterpretationEntry): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveToTable('interpretations', entry);
  await logChange('interpretations', 'upsert', entry.id, entry);
  return result;
}

export async function deleteInterpretation(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteFromTable('interpretations', id);
  await logChange('interpretations', 'delete', id);
}

// Application Operations
export async function getAllApplications(): Promise<ApplicationEntry[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<ApplicationEntry>('applications');
}

export async function saveApplication(entry: ApplicationEntry): Promise<string> {
  const mod = await sqlite();
  const result = await mod.sqliteSaveToTable('applications', entry);
  await logChange('applications', 'upsert', entry.id, entry);
  return result;
}

export async function deleteApplication(id: string): Promise<void> {
  const mod = await sqlite();
  await mod.sqliteDeleteFromTable('applications', id);
  await logChange('applications', 'delete', id);
}

// ============================================================================
// Clear Database
// ============================================================================

export async function clearDatabase(): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteClearDatabase();
}

// ============================================================================
// Export/Import for Backup
// ============================================================================

export interface DatabaseExportData {
  annotations: Annotation[];
  sectionHeadings: SectionHeading[];
  chapterTitles: ChapterTitle[];
  notes: Note[];
  markingPresets: MarkingPreset[];
  studies: Study[];
  multiTranslationViews: MultiTranslationView[];
  observationLists: ObservationList[];
  timeExpressions: TimeExpression[];
  places: Place[];
  people: Person[];
  conclusions: Conclusion[];
  interpretations: InterpretationEntry[];
  applications: ApplicationEntry[];
  preferences: UserPreferences | null;
}

export async function exportAllData(): Promise<DatabaseExportData> {
  const mod = await sqlite();
  return mod.sqliteExportAll();
}

export async function importAllData(data: DatabaseExportData): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteImportAll(data);
}

// ============================================================================
// Cache Operations
// ============================================================================

export async function getCachedChapter(
  moduleId: string,
  book: string,
  chapter: number
): Promise<{ verses: Record<number, string>; cachedAt: Date } | undefined> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const id = `${moduleId}:${book}:${chapter}`;
  const rows = await db.select<{ verses: string; cached_at: string }[]>(
    `SELECT verses, cached_at FROM chapter_cache WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) return undefined;
  return {
    verses: JSON.parse(rows[0].verses),
    cachedAt: new Date(rows[0].cached_at),
  };
}

export async function setCachedChapter(
  moduleId: string,
  book: string,
  chapter: number,
  verses: Record<number, string>
): Promise<void> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const id = `${moduleId}:${book}:${chapter}`;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT OR REPLACE INTO chapter_cache (id, module_id, book, chapter, verses, cached_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, moduleId, book, chapter, JSON.stringify(verses), now]
  );
}

export async function getAllCachedChapters(): Promise<Array<{
  id: string;
  moduleId: string;
  book: string;
  chapter: number;
  verses: Record<number, string>;
  cachedAt: Date;
}>> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const rows = await db.select<{ id: string; module_id: string; book: string; chapter: number; verses: string; cached_at: string }[]>(
    `SELECT id, module_id, book, chapter, verses, cached_at FROM chapter_cache`
  );
  return rows.map(row => ({
    id: row.id,
    moduleId: row.module_id,
    book: row.book,
    chapter: row.chapter,
    verses: JSON.parse(row.verses),
    cachedAt: new Date(row.cached_at),
  }));
}

/** Fetch all chapter titles for a book in one query (used by BookOverview). */
export async function getBookChapterTitles(
  book: string,
  studyId?: string | null
): Promise<ChapterTitle[]> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  type Row = { id: string; book: string; chapter: number; title: string; theme: string | null; supporting_preset_ids: string | null; study_id: string | null; created_at: string; updated_at: string };
  const rows = await db.select<Row[]>(
    studyId
      ? `SELECT * FROM chapter_titles WHERE book = ? AND (study_id IS NULL OR study_id = ?) ORDER BY chapter, CASE WHEN study_id = ? THEN 0 ELSE 1 END`
      : `SELECT * FROM chapter_titles WHERE book = ? AND study_id IS NULL ORDER BY chapter`,
    studyId ? [book, studyId, studyId] : [book]
  );
  // When a study is active, keep only the best row per chapter (study-scoped beats global)
  const best = new Map<number, Row>();
  for (const row of rows) {
    if (!best.has(row.chapter)) best.set(row.chapter, row);
  }
  return Array.from(best.values()).map(row => ({
    id: row.id,
    book: row.book,
    chapter: row.chapter,
    title: row.title,
    theme: row.theme ?? undefined,
    supportingPresetIds: row.supporting_preset_ids ? JSON.parse(row.supporting_preset_ids) : [],
    studyId: row.study_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

/** Fetch all section headings for a book in one query (used by BookOverview). */
export async function getBookSectionHeadings(
  book: string,
  studyId?: string | null
): Promise<SectionHeading[]> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const likePattern = `%"book":"${book}",%`;
  type Row = { id: string; before_ref: string; title: string; covers_until: string | null; study_id: string | null; created_at: string; updated_at: string };
  const rows = await db.select<Row[]>(
    studyId
      ? `SELECT * FROM section_headings WHERE before_ref LIKE ? AND (study_id IS NULL OR study_id = ?)`
      : `SELECT * FROM section_headings WHERE before_ref LIKE ? AND study_id IS NULL`,
    studyId ? [likePattern, studyId] : [likePattern]
  );
  return rows.map(row => ({
    id: row.id,
    beforeRef: JSON.parse(row.before_ref),
    title: row.title,
    coversUntil: row.covers_until ? JSON.parse(row.covers_until) : undefined,
    studyId: row.study_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

/** Fetch all cached chapters for a book/translation in one query (used by BookOverview). */
export async function getBookCachedChapters(
  moduleId: string,
  book: string
): Promise<Map<number, Record<number, string>>> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const rows = await db.select<{ chapter: number; verses: string }[]>(
    `SELECT chapter, verses FROM chapter_cache WHERE module_id = ? AND book = ?`,
    [moduleId, book]
  );
  const result = new Map<number, Record<number, string>>();
  for (const row of rows) {
    result.set(row.chapter, JSON.parse(row.verses));
  }
  return result;
}

export async function clearChapterCache(): Promise<void> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  await db.execute(`DELETE FROM chapter_cache`);
}

export async function getCachedTranslations(): Promise<unknown[] | undefined> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const rows = await db.select<{ translations: string }[]>(
    `SELECT translations FROM translation_cache WHERE id = 'getbible-translations'`
  );
  if (rows.length === 0) return undefined;
  return JSON.parse(rows[0].translations);
}

export async function setCachedTranslations(translations: unknown[]): Promise<void> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT OR REPLACE INTO translation_cache (id, translations, cached_at) VALUES (?, ?, ?)`,
    ['getbible-translations', JSON.stringify(translations), now]
  );
}

// ============================================================================
// ESV Rate Limit Operations
// ============================================================================

export async function getEsvRateLimitState(): Promise<{ requestTimestamps: number[] }> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const rows = await db.select<{ request_timestamps: string }[]>(
    `SELECT request_timestamps FROM esv_rate_limit WHERE id = 'esv'`
  );
  if (rows.length === 0) return { requestTimestamps: [] };
  return { requestTimestamps: JSON.parse(rows[0].request_timestamps) };
}

export async function saveEsvRateLimitState(timestamps: number[]): Promise<void> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  await db.execute(
    `INSERT OR REPLACE INTO esv_rate_limit (id, request_timestamps) VALUES ('esv', ?)`,
    [JSON.stringify(timestamps)]
  );
}

// ============================================================================
// Reading History Operations
// ============================================================================

export async function addReadingHistory(
  moduleId: string,
  book: string,
  chapter: number
): Promise<void> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO reading_history (id, module_id, book, chapter, timestamp) VALUES (?, ?, ?, ?, ?)`,
    [id, moduleId, book, chapter, new Date().toISOString()]
  );
}

// ============================================================================
// Raw SQL Access (for advanced queries in search, export, etc.)
// ============================================================================

export async function sqlSelect<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  return db.select<T[]>(sql, params);
}

export async function sqlExecute(sql: string, params?: unknown[]): Promise<void> {
  const mod = await sqlite();
  const db = await mod.getSqliteDb();
  await db.execute(sql, params);
}
