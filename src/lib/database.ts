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
import type { UserPreferences } from '@/types/preferences';

export type { UserPreferences, ApiConfigRecord, OnboardingState, AutoBackupConfig } from '@/types/preferences';

// Lazy-load sqlite-db module
let sqliteModule: typeof import('./sqlite-db') | null = null;

async function sqlite() {
  if (!sqliteModule) {
    sqliteModule = await import('./sqlite-db');
  }
  return sqliteModule;
}

// ============================================================================
// Database Lifecycle
// ============================================================================

export async function initDatabase(): Promise<void> {
  const mod = await sqlite();
  await mod.getSqliteDb();
}

export async function closeDatabase(): Promise<void> {
  const mod = await sqlite();
  await mod.closeSqliteDb();
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
  return mod.sqliteSaveAnnotation(annotation);
}

export async function deleteAnnotation(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteAnnotation(id);
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
  }
  return toDelete.length;
}

// ============================================================================
// Section Heading Operations
// ============================================================================

export async function getChapterHeadings(
  _moduleId: string | null | undefined,
  book: string,
  chapter: number
): Promise<SectionHeading[]> {
  const mod = await sqlite();
  return mod.sqliteGetChapterHeadings(book, chapter);
}

export async function saveSectionHeading(heading: SectionHeading): Promise<string> {
  const mod = await sqlite();
  return mod.sqliteSaveSectionHeading(heading);
}

export async function deleteSectionHeading(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteSectionHeading(id);
}

// ============================================================================
// Chapter Title Operations
// ============================================================================

export async function getChapterTitle(
  _moduleId: string | null | undefined,
  book: string,
  chapter: number
): Promise<ChapterTitle | undefined> {
  const mod = await sqlite();
  return mod.sqliteGetChapterTitle(book, chapter);
}

export async function saveChapterTitle(title: ChapterTitle): Promise<string> {
  const mod = await sqlite();
  return mod.sqliteSaveChapterTitle(title);
}

export async function deleteChapterTitle(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteChapterTitle(id);
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
  return mod.sqliteSaveNote(note);
}

export async function deleteNote(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteNote(id);
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
  return mod.sqliteSaveMarkingPreset(preset);
}

export async function deleteMarkingPreset(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteMarkingPreset(id);
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
  return mod.sqliteSaveStudy(study);
}

export async function deleteStudy(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteStudy(id);
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
    await mod.sqliteSavePreferences({ ...current, ...updates });
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
  return mod.sqliteSaveToTable('multi_translation_views', view);
}

export async function deleteMultiTranslationView(id: string = 'active'): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteFromTable('multi_translation_views', id);
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
  return mod.sqliteSaveToTable('observation_lists', list);
}

export async function deleteObservationList(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteFromTable('observation_lists', id);
}

// 5W+H Operations
export async function getAllFiveWAndH(): Promise<FiveWAndHEntry[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<FiveWAndHEntry>('five_w_and_h');
}

export async function saveFiveWAndH(entry: FiveWAndHEntry): Promise<string> {
  const mod = await sqlite();
  return mod.sqliteSaveToTable('five_w_and_h', entry);
}

export async function deleteFiveWAndH(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteFromTable('five_w_and_h', id);
}

// Contrast Operations
export async function getAllContrasts(): Promise<Contrast[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<Contrast>('contrasts');
}

export async function saveContrast(entry: Contrast): Promise<string> {
  const mod = await sqlite();
  return mod.sqliteSaveToTable('contrasts', entry);
}

export async function deleteContrast(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteFromTable('contrasts', id);
}

// Time Expression Operations
export async function getAllTimeExpressions(): Promise<TimeExpression[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<TimeExpression>('time_expressions');
}

export async function saveTimeExpression(entry: TimeExpression): Promise<string> {
  const mod = await sqlite();
  return mod.sqliteSaveToTable('time_expressions', entry);
}

export async function deleteTimeExpression(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteFromTable('time_expressions', id);
}

// Place Operations
export async function getAllPlaces(): Promise<Place[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<Place>('places');
}

export async function savePlace(entry: Place): Promise<string> {
  const mod = await sqlite();
  return mod.sqliteSaveToTable('places', entry);
}

export async function deletePlace(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteFromTable('places', id);
}

// Conclusion Operations
export async function getAllConclusions(): Promise<Conclusion[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<Conclusion>('conclusions');
}

export async function saveConclusion(entry: Conclusion): Promise<string> {
  const mod = await sqlite();
  return mod.sqliteSaveToTable('conclusions', entry);
}

export async function deleteConclusion(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteFromTable('conclusions', id);
}

// Interpretation Operations
export async function getAllInterpretations(): Promise<InterpretationEntry[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<InterpretationEntry>('interpretations');
}

export async function saveInterpretation(entry: InterpretationEntry): Promise<string> {
  const mod = await sqlite();
  return mod.sqliteSaveToTable('interpretations', entry);
}

export async function deleteInterpretation(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteFromTable('interpretations', id);
}

// Application Operations
export async function getAllApplications(): Promise<ApplicationEntry[]> {
  const mod = await sqlite();
  return mod.sqliteGetAllFromTable<ApplicationEntry>('applications');
}

export async function saveApplication(entry: ApplicationEntry): Promise<string> {
  const mod = await sqlite();
  return mod.sqliteSaveToTable('applications', entry);
}

export async function deleteApplication(id: string): Promise<void> {
  const mod = await sqlite();
  return mod.sqliteDeleteFromTable('applications', id);
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
  fiveWAndH: FiveWAndHEntry[];
  contrasts: Contrast[];
  timeExpressions: TimeExpression[];
  places: Place[];
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
