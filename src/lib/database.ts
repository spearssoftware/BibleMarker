/**
 * Database Abstraction Layer
 *
 * Provides a unified interface for database operations that routes to:
 * - SQLite on Tauri (iOS/macOS) for iCloud sync support
 * - IndexedDB (Dexie) on web browsers
 *
 * This abstraction allows the app to use the same API regardless of platform
 * while enabling platform-specific optimizations like iCloud sync.
 */

import { isTauri } from './platform';
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

// Re-export types from db.ts
export type { UserPreferences, ApiConfigRecord, OnboardingState, AutoBackupConfig } from './db';

// ============================================================================
// Database Backend Selection
// ============================================================================

/**
 * Check if SQLite should be used on Tauri (native apps) for iCloud sync support.
 * Returns false for web browsers, which use IndexedDB (Dexie).
 */
export function shouldUseSqlite(): boolean {
  return isTauri();
}

// Alias for backwards compatibility
export const useSqlite = shouldUseSqlite;

// ============================================================================
// Lazy imports to avoid loading unused backends
// ============================================================================

let sqliteModule: typeof import('./sqlite-db') | null = null;
let dexieModule: typeof import('./db') | null = null;

async function getSqliteModule() {
  if (!sqliteModule) {
    sqliteModule = await import('./sqlite-db');
  }
  return sqliteModule;
}

async function getDexieModule() {
  if (!dexieModule) {
    dexieModule = await import('./db');
  }
  return dexieModule;
}

// ============================================================================
// Unified Database Interface
// ============================================================================

/**
 * Initialize the database connection
 */
export async function initDatabase(): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    await sqlite.getSqliteDb();
  }
  // Dexie auto-initializes on first access
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    await sqlite.closeSqliteDb();
  }
  // Dexie doesn't need explicit closing
}

// ============================================================================
// Annotation Operations
// ============================================================================

export async function getChapterAnnotations(
  moduleId: string,
  book: string,
  chapter: number
): Promise<Annotation[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetChapterAnnotations(moduleId, book, chapter);
  }
  const dexie = await getDexieModule();
  return dexie.getChapterAnnotations(moduleId, book, chapter);
}

export async function saveAnnotation(annotation: Annotation): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveAnnotation(annotation);
  }
  const dexie = await getDexieModule();
  return dexie.saveAnnotation(annotation);
}

export async function deleteAnnotation(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteAnnotation(id);
  }
  const dexie = await getDexieModule();
  return dexie.deleteAnnotation(id);
}

// ============================================================================
// Section Heading Operations
// ============================================================================

export async function getChapterHeadings(
  moduleId: string | null | undefined,
  book: string,
  chapter: number
): Promise<SectionHeading[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetChapterHeadings(book, chapter);
  }
  const dexie = await getDexieModule();
  return dexie.getChapterHeadings(moduleId, book, chapter);
}

export async function saveSectionHeading(heading: SectionHeading): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveSectionHeading(heading);
  }
  const dexie = await getDexieModule();
  return dexie.saveSectionHeading(heading);
}

export async function deleteSectionHeading(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteSectionHeading(id);
  }
  const dexie = await getDexieModule();
  return dexie.deleteSectionHeading(id);
}

// ============================================================================
// Chapter Title Operations
// ============================================================================

export async function getChapterTitle(
  moduleId: string | null | undefined,
  book: string,
  chapter: number
): Promise<ChapterTitle | undefined> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetChapterTitle(book, chapter);
  }
  const dexie = await getDexieModule();
  return dexie.getChapterTitle(moduleId, book, chapter);
}

export async function saveChapterTitle(title: ChapterTitle): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveChapterTitle(title);
  }
  const dexie = await getDexieModule();
  return dexie.saveChapterTitle(title);
}

export async function deleteChapterTitle(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteChapterTitle(id);
  }
  const dexie = await getDexieModule();
  return dexie.deleteChapterTitle(id);
}

// ============================================================================
// Note Operations
// ============================================================================

export async function getChapterNotes(
  moduleId: string,
  book: string,
  chapter: number
): Promise<Note[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetChapterNotes(moduleId, book, chapter);
  }
  const dexie = await getDexieModule();
  return dexie.getChapterNotes(moduleId, book, chapter);
}

export async function saveNote(note: Note): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveNote(note);
  }
  const dexie = await getDexieModule();
  return dexie.saveNote(note);
}

export async function deleteNote(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteNote(id);
  }
  const dexie = await getDexieModule();
  return dexie.deleteNote(id);
}

// ============================================================================
// Marking Preset Operations
// ============================================================================

export async function getAllMarkingPresets(): Promise<MarkingPreset[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetAllMarkingPresets();
  }
  const dexie = await getDexieModule();
  return dexie.getAllMarkingPresets();
}

export async function saveMarkingPreset(preset: MarkingPreset): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveMarkingPreset(preset);
  }
  const dexie = await getDexieModule();
  return dexie.saveMarkingPreset(preset);
}

export async function deleteMarkingPreset(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteMarkingPreset(id);
  }
  const dexie = await getDexieModule();
  return dexie.deleteMarkingPreset(id);
}

// ============================================================================
// Study Operations
// ============================================================================

export async function getAllStudies(): Promise<Study[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetAllStudies();
  }
  const dexie = await getDexieModule();
  return dexie.getAllStudies();
}

export async function saveStudy(study: Study): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveStudy(study);
  }
  const dexie = await getDexieModule();
  return dexie.saveStudy(study);
}

export async function deleteStudy(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteStudy(id);
  }
  const dexie = await getDexieModule();
  return dexie.deleteStudy(id);
}

// ============================================================================
// Preferences Operations
// ============================================================================

export async function getPreferences(): Promise<import('./db').UserPreferences> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    const prefs = await sqlite.sqliteGetPreferences();
    if (prefs) return prefs;
    // Return default preferences if not found
    const defaultPrefs: import('./db').UserPreferences = {
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
    await sqlite.sqliteSavePreferences(defaultPrefs);
    return defaultPrefs;
  }
  const dexie = await getDexieModule();
  return dexie.getPreferences();
}

export async function updatePreferences(
  updates: Partial<Omit<import('./db').UserPreferences, 'id'>>
): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    const current = await sqlite.sqliteGetPreferences();
    if (current) {
      await sqlite.sqliteSavePreferences({ ...current, ...updates });
    }
    return;
  }
  const dexie = await getDexieModule();
  return dexie.updatePreferences(updates);
}

// ============================================================================
// Multi-Translation View Operations
// ============================================================================

export async function getMultiTranslationView(
  id: string = 'active'
): Promise<MultiTranslationView | undefined> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    const views = await sqlite.sqliteGetAllFromTable<MultiTranslationView>('multi_translation_views');
    return views.find((v) => v.id === id);
  }
  const dexie = await getDexieModule();
  return dexie.getMultiTranslationView(id);
}

export async function saveMultiTranslationView(view: MultiTranslationView): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveToTable('multi_translation_views', view);
  }
  const dexie = await getDexieModule();
  return dexie.saveMultiTranslationView(view);
}

export async function deleteMultiTranslationView(id: string = 'active'): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteFromTable('multi_translation_views', id);
  }
  const dexie = await getDexieModule();
  return dexie.deleteMultiTranslationView(id);
}

// ============================================================================
// Observation Data Operations
// ============================================================================

export async function getAllObservationLists(): Promise<ObservationList[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetAllFromTable<ObservationList>('observation_lists');
  }
  const dexie = await getDexieModule();
  return dexie.db.observationLists.toArray();
}

export async function saveObservationList(list: ObservationList): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveToTable('observation_lists', list);
  }
  const dexie = await getDexieModule();
  return dexie.db.observationLists.put(list);
}

export async function deleteObservationList(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteFromTable('observation_lists', id);
  }
  const dexie = await getDexieModule();
  await dexie.db.observationLists.delete(id);
}

// 5W+H Operations
export async function getAllFiveWAndH(): Promise<FiveWAndHEntry[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetAllFromTable<FiveWAndHEntry>('five_w_and_h');
  }
  const dexie = await getDexieModule();
  return dexie.db.fiveWAndH.toArray();
}

export async function saveFiveWAndH(entry: FiveWAndHEntry): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveToTable('five_w_and_h', entry);
  }
  const dexie = await getDexieModule();
  return dexie.db.fiveWAndH.put(entry);
}

export async function deleteFiveWAndH(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteFromTable('five_w_and_h', id);
  }
  const dexie = await getDexieModule();
  await dexie.db.fiveWAndH.delete(id);
}

// Contrast Operations
export async function getAllContrasts(): Promise<Contrast[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetAllFromTable<Contrast>('contrasts');
  }
  const dexie = await getDexieModule();
  return dexie.db.contrasts.toArray();
}

export async function saveContrast(entry: Contrast): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveToTable('contrasts', entry);
  }
  const dexie = await getDexieModule();
  return dexie.db.contrasts.put(entry);
}

export async function deleteContrast(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteFromTable('contrasts', id);
  }
  const dexie = await getDexieModule();
  await dexie.db.contrasts.delete(id);
}

// Time Expression Operations
export async function getAllTimeExpressions(): Promise<TimeExpression[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetAllFromTable<TimeExpression>('time_expressions');
  }
  const dexie = await getDexieModule();
  return dexie.db.timeExpressions.toArray();
}

export async function saveTimeExpression(entry: TimeExpression): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveToTable('time_expressions', entry);
  }
  const dexie = await getDexieModule();
  return dexie.db.timeExpressions.put(entry);
}

export async function deleteTimeExpression(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteFromTable('time_expressions', id);
  }
  const dexie = await getDexieModule();
  await dexie.db.timeExpressions.delete(id);
}

// Place Operations
export async function getAllPlaces(): Promise<Place[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetAllFromTable<Place>('places');
  }
  const dexie = await getDexieModule();
  return dexie.db.places.toArray();
}

export async function savePlace(entry: Place): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveToTable('places', entry);
  }
  const dexie = await getDexieModule();
  return dexie.db.places.put(entry);
}

export async function deletePlace(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteFromTable('places', id);
  }
  const dexie = await getDexieModule();
  await dexie.db.places.delete(id);
}

// Conclusion Operations
export async function getAllConclusions(): Promise<Conclusion[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetAllFromTable<Conclusion>('conclusions');
  }
  const dexie = await getDexieModule();
  return dexie.db.conclusions.toArray();
}

export async function saveConclusion(entry: Conclusion): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveToTable('conclusions', entry);
  }
  const dexie = await getDexieModule();
  return dexie.db.conclusions.put(entry);
}

export async function deleteConclusion(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteFromTable('conclusions', id);
  }
  const dexie = await getDexieModule();
  await dexie.db.conclusions.delete(id);
}

// Interpretation Operations
export async function getAllInterpretations(): Promise<InterpretationEntry[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetAllFromTable<InterpretationEntry>('interpretations');
  }
  const dexie = await getDexieModule();
  return dexie.db.interpretations.toArray();
}

export async function saveInterpretation(entry: InterpretationEntry): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveToTable('interpretations', entry);
  }
  const dexie = await getDexieModule();
  return dexie.db.interpretations.put(entry);
}

export async function deleteInterpretation(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteFromTable('interpretations', id);
  }
  const dexie = await getDexieModule();
  await dexie.db.interpretations.delete(id);
}

// Application Operations
export async function getAllApplications(): Promise<ApplicationEntry[]> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteGetAllFromTable<ApplicationEntry>('applications');
  }
  const dexie = await getDexieModule();
  return dexie.db.applications.toArray();
}

export async function saveApplication(entry: ApplicationEntry): Promise<string> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteSaveToTable('applications', entry);
  }
  const dexie = await getDexieModule();
  return dexie.db.applications.put(entry);
}

export async function deleteApplication(id: string): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteDeleteFromTable('applications', id);
  }
  const dexie = await getDexieModule();
  await dexie.db.applications.delete(id);
}

// ============================================================================
// Clear Database
// ============================================================================

export async function clearDatabase(): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteClearDatabase();
  }
  const dexie = await getDexieModule();
  return dexie.clearDatabase();
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
  preferences: import('./db').UserPreferences | null;
}

export async function exportAllData(): Promise<DatabaseExportData> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteExportAll();
  }

  // Export from Dexie
  const dexie = await getDexieModule();
  return {
    annotations: await dexie.db.annotations.toArray(),
    sectionHeadings: await dexie.db.sectionHeadings.toArray(),
    chapterTitles: await dexie.db.chapterTitles.toArray(),
    notes: await dexie.db.notes.toArray(),
    markingPresets: await dexie.db.markingPresets.toArray(),
    studies: await dexie.db.studies.toArray(),
    multiTranslationViews: await dexie.db.multiTranslationViews.toArray(),
    observationLists: await dexie.db.observationLists.toArray(),
    fiveWAndH: await dexie.db.fiveWAndH.toArray(),
    contrasts: await dexie.db.contrasts.toArray(),
    timeExpressions: await dexie.db.timeExpressions.toArray(),
    places: await dexie.db.places.toArray(),
    conclusions: await dexie.db.conclusions.toArray(),
    interpretations: await dexie.db.interpretations.toArray(),
    applications: await dexie.db.applications.toArray(),
    preferences: await dexie.getPreferences(),
  };
}

export async function importAllData(data: DatabaseExportData): Promise<void> {
  if (shouldUseSqlite()) {
    const sqlite = await getSqliteModule();
    return sqlite.sqliteImportAll(data);
  }

  // Import to Dexie
  const dexie = await getDexieModule();

  if (data.annotations.length) await dexie.db.annotations.bulkPut(data.annotations);
  if (data.sectionHeadings.length) await dexie.db.sectionHeadings.bulkPut(data.sectionHeadings);
  if (data.chapterTitles.length) await dexie.db.chapterTitles.bulkPut(data.chapterTitles);
  if (data.notes.length) await dexie.db.notes.bulkPut(data.notes);
  if (data.markingPresets.length) await dexie.db.markingPresets.bulkPut(data.markingPresets);
  if (data.studies.length) await dexie.db.studies.bulkPut(data.studies);
  if (data.multiTranslationViews.length) await dexie.db.multiTranslationViews.bulkPut(data.multiTranslationViews);
  if (data.observationLists.length) await dexie.db.observationLists.bulkPut(data.observationLists);
  if (data.fiveWAndH.length) await dexie.db.fiveWAndH.bulkPut(data.fiveWAndH);
  if (data.contrasts.length) await dexie.db.contrasts.bulkPut(data.contrasts);
  if (data.timeExpressions.length) await dexie.db.timeExpressions.bulkPut(data.timeExpressions);
  if (data.places.length) await dexie.db.places.bulkPut(data.places);
  if (data.conclusions.length) await dexie.db.conclusions.bulkPut(data.conclusions);
  if (data.interpretations.length) await dexie.db.interpretations.bulkPut(data.interpretations);
  if (data.applications.length) await dexie.db.applications.bulkPut(data.applications);
  if (data.preferences) await dexie.db.preferences.put(data.preferences);
}
