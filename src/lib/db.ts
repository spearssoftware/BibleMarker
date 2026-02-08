/**
 * IndexedDB Database
 * 
 * Uses Dexie.js for a clean API over IndexedDB.
 * Stores annotations, preferences, and cached text.
 * Note: modules and moduleFiles tables are deprecated (Sword support removed)
 * but kept in schema for backwards compatibility.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { 
  Annotation, 
  SectionHeading, 
  ChapterTitle,
  Note,
  MarkingPreferences,
} from '@/types/annotation';
import type { KeyWordDefinition, MarkingPreset } from '@/types/keyWord';
import { keyWordToMarkingPreset } from '@/types/keyWord';
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
import {
  validateAnnotation,
  validateSectionHeading,
  validateChapterTitle,
  validateNote,
  validateMarkingPreset,
  validateStudy,
  validateMultiTranslationView,
  sanitizeData,
  ValidationError,
} from './validation';
import { isTauri } from './platform';

// ============================================================================
// SQLite Routing (Tauri/native platforms use SQLite for iCloud sync)
// ============================================================================

let _sqliteMod: typeof import('./sqlite-db') | null = null;

/** Lazy-load the SQLite module. Only called on Tauri (native) platforms. */
async function _sqlite() {
  if (!_sqliteMod) {
    _sqliteMod = await import('./sqlite-db');
  }
  return _sqliteMod;
}

/** API configuration for Bible APIs */
export interface ApiConfigRecord {
  provider: 'biblia' | 'esv' | 'getbible' | 'biblegateway';
  apiKey?: string;
  /** BibleGateway: account username */
  username?: string;
  /** BibleGateway: account password */
  password?: string;
  baseUrl?: string;
  enabled: boolean;
}

/** Cached chapter text for fast access */
interface ChapterCache {
  id: string;                    // moduleId:book:chapter
  moduleId: string;
  book: string;
  chapter: number;
  verses: Record<number, string>; // verse number -> text
  cachedAt: Date;
}

/** Cached translation list from getBible API */
interface TranslationCache {
  id: string;                    // 'getbible-translations'
  translations: unknown[];        // Array of translation objects
  cachedAt: Date;
}

/** Onboarding state */
export interface OnboardingState {
  hasSeenWelcome: boolean;        // Has user seen welcome screen
  hasCompletedTour: boolean;      // Has user completed guided tour
  dismissedTooltips: string[];     // Array of tooltip IDs that have been dismissed
}

/** Auto-backup configuration */
export interface AutoBackupConfig {
  enabled: boolean;
  intervalMinutes: number;  // Backup interval in minutes (default: 5)
  maxBackups: number;        // Maximum number of backups to keep (default: 10)
}

/** User preferences */
export interface UserPreferences {
  id: string;                    // 'main' for singleton
  currentModuleId?: string;
  currentBook?: string;
  currentChapter?: number;
  marking: MarkingPreferences;
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  theme: 'dark' | 'light' | 'auto';
  highContrast?: boolean;          // High contrast mode for accessibility
  apiConfigs?: ApiConfigRecord[];  // Bible API configurations
  favoriteTranslations?: string[];  // Array of translation IDs
  recentTranslations?: string[];    // Array of translation IDs (most recent first)
  recentBooks?: string[];           // Array of book IDs (most recent first)
  defaultTranslation?: string;      // Default translation ID to use when app starts
  apiResourcesEnabled?: boolean;     // When false, no translation/chapter fetches from APIs (cache-only)
  translationLanguageFilter?: string[];  // e.g. ['en'] for English only; omit or empty = all languages
  onboarding?: OnboardingState;    // Onboarding state for first-time users
  autoBackup?: AutoBackupConfig;    // Auto-backup configuration
  /** When false, app will not check GitHub for new releases (default true) */
  checkForUpdates?: boolean;
  /** ISO date string of last update check (used to throttle to once per 24h) */
  lastUpdateCheck?: string;
  debug?: {
    keywordMatching?: boolean;      // Enable debug logging for keyword matching
    verseText?: boolean;            // Enable debug logging for verse text rendering
  };
}

/** Reading history entry */
interface ReadingHistory {
  id: string;                    // Auto-generated
  moduleId: string;
  book: string;
  chapter: number;
  timestamp: Date;
}

/** ESV API rate limit state (persisted for compliance) */
export interface EsvRateLimitState {
  id: 'esv';
  requestTimestamps: number[];   // Unix ms of each request
}

/** @deprecated Sword module support removed - kept for backwards compatibility */
export interface ModuleRecord {
  id: string;
  status?: string;
}

/** @deprecated Sword module support removed - kept for backwards compatibility */
export interface ModuleFile {
  id: string;
  moduleId?: string;
}

/** Database schema */
class BibleMarkerDB extends Dexie {
  modules!: EntityTable<ModuleRecord, 'id'>;
  moduleFiles!: EntityTable<ModuleFile, 'id'>;
  chapterCache!: EntityTable<ChapterCache, 'id'>;
  translationCache!: EntityTable<TranslationCache, 'id'>;
  annotations!: EntityTable<Annotation, 'id'>;
  sectionHeadings!: EntityTable<SectionHeading, 'id'>;
  chapterTitles!: EntityTable<ChapterTitle, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  keyWords!: EntityTable<KeyWordDefinition, 'id'>;
  markingPresets!: EntityTable<MarkingPreset, 'id'>;
  preferences!: EntityTable<UserPreferences, 'id'>;
  readingHistory!: EntityTable<ReadingHistory, 'id'>;
  esvRateLimit!: EntityTable<EsvRateLimitState, 'id'>;
  studies!: EntityTable<Study, 'id'>;
  multiTranslationViews!: EntityTable<MultiTranslationView, 'id'>;
  observationLists!: EntityTable<ObservationList, 'id'>;
  fiveWAndH!: EntityTable<FiveWAndHEntry, 'id'>;
  contrasts!: EntityTable<Contrast, 'id'>;
  timeExpressions!: EntityTable<TimeExpression, 'id'>;
  places!: EntityTable<Place, 'id'>;
  conclusions!: EntityTable<Conclusion, 'id'>;
  interpretations!: EntityTable<InterpretationEntry, 'id'>;
  applications!: EntityTable<ApplicationEntry, 'id'>;

  constructor() {
    super('BibleMarkerDB');
    
    this.version(1).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      annotations: 'id, moduleId, type, createdAt',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
    });
    
    // Version 2: Add keyWords table
    this.version(2).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      annotations: 'id, moduleId, type, createdAt',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
    });
    
    // Version 3: Add translationCache table for getBible translations
    this.version(3).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
    });

    // Version 4: Marking presets (unified key words); presetId on annotations; migrate keyWords→markingPresets
    this.version(4).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt, presetId',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      markingPresets: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
    }).upgrade(async (tx) => {
      try {
        const kws = await tx.table('keyWords').toArray() as KeyWordDefinition[];
        if (kws.length > 0) {
          const presets = kws.map(kw => {
            try {
              return keyWordToMarkingPreset(kw);
            } catch (error) {
              console.warn(`[Migration v4] Failed to migrate keyWord ${kw.id}:`, error);
              return null;
            }
          }).filter((p): p is MarkingPreset => p !== null);
          
          if (presets.length > 0) {
            await tx.table('markingPresets').bulkPut(presets);
          }
        }
      } catch (error) {
        console.error('[Migration v4] Error during migration:', error);
        // Don't throw - allow migration to continue even if keyWord migration fails
      }
    });

    // Version 5: ESV API rate limit state for compliance
    this.version(5).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt, presetId',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      markingPresets: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
      esvRateLimit: 'id',
    });

    // Version 6: Studies and multi-translation views (Phase 3)
    this.version(6).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt, presetId',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      markingPresets: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
      esvRateLimit: 'id',
      studies: 'id',
      multiTranslationViews: 'id',
    });

    // Version 7: Observation lists (Phase 4)
    this.version(7).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt, presetId',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      markingPresets: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
      esvRateLimit: 'id',
      studies: 'id',
      multiTranslationViews: 'id',
      observationLists: 'id, keyWordId, studyId',
    });

    // Version 8: 5W+H worksheet entries (Phase 1 - Agent 1)
    this.version(8).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt, presetId',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      markingPresets: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
      esvRateLimit: 'id',
      studies: 'id',
      multiTranslationViews: 'id',
      observationLists: 'id, keyWordId, studyId',
      fiveWAndH: 'id',
    });

    // Version 9: Contrasts and comparisons tracker (Phase 1 - Agent 2)
    this.version(9).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt, presetId',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      markingPresets: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
      esvRateLimit: 'id',
      studies: 'id',
      multiTranslationViews: 'id',
      observationLists: 'id, keyWordId, studyId',
      fiveWAndH: 'id',
      contrasts: 'id',
    });

    // Version 10: Time expressions tracker (Phase 1 - Agent 3)
    this.version(10).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt, presetId',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      markingPresets: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
      esvRateLimit: 'id',
      studies: 'id',
      multiTranslationViews: 'id',
      observationLists: 'id, keyWordId, studyId',
      fiveWAndH: 'id',
      contrasts: 'id',
      timeExpressions: 'id',
    });

    // Version 11: Geographic locations tracker (Phase 1 - Agent 4)
    this.version(11).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt, presetId',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      markingPresets: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
      esvRateLimit: 'id',
      studies: 'id',
      multiTranslationViews: 'id',
      observationLists: 'id, keyWordId, studyId',
      fiveWAndH: 'id',
      contrasts: 'id',
      timeExpressions: 'id',
      places: 'id',
    });

    // Version 12: Conclusion terms tracker (Phase 1 - Agent 5)
    this.version(12).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt, presetId',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      markingPresets: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
      esvRateLimit: 'id',
      studies: 'id',
      multiTranslationViews: 'id',
      observationLists: 'id, keyWordId, studyId',
      fiveWAndH: 'id',
      contrasts: 'id',
      timeExpressions: 'id',
      places: 'id',
      conclusions: 'id',
    });

    // Version 13: Interpretation worksheet (Phase 2 - Agent 1)
    this.version(13).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt, presetId',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      markingPresets: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
      esvRateLimit: 'id',
      studies: 'id',
      multiTranslationViews: 'id',
      observationLists: 'id, keyWordId, studyId',
      fiveWAndH: 'id',
      contrasts: 'id',
      timeExpressions: 'id',
      places: 'id',
      conclusions: 'id',
      interpretations: 'id, studyId',
    });

    // Version 14: Application worksheet (Phase 2 - Agent 2)
    this.version(14).stores({
      modules: 'id, status',
      moduleFiles: 'id, moduleId',
      chapterCache: 'id, moduleId',
      translationCache: 'id',
      annotations: 'id, moduleId, type, createdAt, presetId',
      sectionHeadings: 'id, moduleId',
      chapterTitles: 'id, moduleId',
      notes: 'id, moduleId',
      keyWords: 'id, word, category',
      markingPresets: 'id, word, category',
      preferences: 'id',
      readingHistory: 'id, moduleId, timestamp',
      esvRateLimit: 'id',
      studies: 'id',
      multiTranslationViews: 'id',
      observationLists: 'id, keyWordId, studyId',
      fiveWAndH: 'id',
      contrasts: 'id',
      timeExpressions: 'id',
      places: 'id',
      conclusions: 'id',
      interpretations: 'id, studyId',
      applications: 'id',
    });
  }
}

export const db = new BibleMarkerDB();

// Expose db to window for debugging (browser console access)
if (typeof window !== 'undefined') {
  (window as Window & { db?: BibleMarkerDB }).db = db;
}

/**
 * Get or create user preferences
 */
export async function getPreferences(): Promise<UserPreferences> {
  const defaultPrefs: UserPreferences = {
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

  if (isTauri()) {
    const sqlite = await _sqlite();
    const prefs = await sqlite.sqliteGetPreferences();
    if (!prefs) {
      await sqlite.sqliteSavePreferences(defaultPrefs);
      return defaultPrefs;
    }
    if (!prefs.onboarding) {
      prefs.onboarding = { hasSeenWelcome: false, hasCompletedTour: false, dismissedTooltips: [] };
      await sqlite.sqliteSavePreferences(prefs);
    }
    return prefs;
  }

  const prefs = await db.preferences.get('main');
  if (!prefs) {
    await db.preferences.put(defaultPrefs);
    return defaultPrefs;
  }
  if (!prefs.onboarding) {
    prefs.onboarding = { hasSeenWelcome: false, hasCompletedTour: false, dismissedTooltips: [] };
    await db.preferences.put(prefs);
  }
  return prefs;
}

/**
 * Update user preferences
 */
export async function updatePreferences(
  updates: Partial<Omit<UserPreferences, 'id'>>
): Promise<void> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    const current = await sqlite.sqliteGetPreferences();
    if (current) {
      await sqlite.sqliteSavePreferences({ ...current, ...updates });
    }
    return;
  }
  await db.preferences.update('main', updates);
}

/**
 * Get annotations for a chapter
 */
export async function getChapterAnnotations(
  moduleId: string,
  book: string,
  chapter: number
): Promise<Annotation[]> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteGetChapterAnnotations(moduleId, book, chapter);
  }
  const allAnnotations = await db.annotations
    .where('moduleId')
    .equals(moduleId)
    .toArray();
  
  // Filter by chapter (handles both text annotations and symbol annotations)
  return allAnnotations.filter(ann => {
    if (ann.type === 'symbol') {
      return ann.ref.book === book && ann.ref.chapter === chapter;
    }
    return ann.startRef.book === book && ann.startRef.chapter === chapter;
  });
}

/**
 * Get section headings for a chapter
 */
export async function getChapterHeadings(
  moduleId: string | null | undefined, // Ignored - kept for backward compatibility
  book: string,
  chapter: number
): Promise<SectionHeading[]> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteGetChapterHeadings(book, chapter);
  }
  // Get all headings for this book/chapter (translation-agnostic)
  const allHeadings = await db.sectionHeadings.toArray();
  const matchingHeadings = allHeadings.filter(h => 
    h.beforeRef.book === book && 
    h.beforeRef.chapter === chapter
  );
  
  return matchingHeadings;
}

/**
 * Save an annotation
 */
export async function saveAnnotation(annotation: Annotation): Promise<string> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteSaveAnnotation(annotation);
  }
  try {
    const validated = sanitizeData(annotation, validateAnnotation);
    return await db.annotations.put(validated);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new Error(`Invalid annotation: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Delete an annotation
 */
export async function deleteAnnotation(id: string): Promise<void> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteDeleteAnnotation(id);
  }
  await db.annotations.delete(id);
}

/**
 * Save a section heading
 */
export async function saveSectionHeading(heading: SectionHeading): Promise<string> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteSaveSectionHeading(heading);
  }
  try {
    const validated = sanitizeData(heading, validateSectionHeading);
    return await db.sectionHeadings.put(validated);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new Error(`Invalid section heading: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Delete a section heading
 */
export async function deleteSectionHeading(id: string): Promise<void> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteDeleteSectionHeading(id);
  }
  await db.sectionHeadings.delete(id);
}

/**
 * Get chapter title for a chapter
 */
export async function getChapterTitle(
  moduleId: string | null | undefined, // Ignored - kept for backward compatibility
  book: string,
  chapter: number
): Promise<ChapterTitle | undefined> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteGetChapterTitle(book, chapter);
  }
  // Get title for this book/chapter (translation-agnostic)
  const allTitles = await db.chapterTitles.toArray();
  return allTitles.find(t => t.book === book && t.chapter === chapter);
}

/**
 * Save a chapter title
 */
export async function saveChapterTitle(title: ChapterTitle): Promise<string> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteSaveChapterTitle(title);
  }
  try {
    const validated = sanitizeData(title, validateChapterTitle);
    return await db.chapterTitles.put(validated);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new Error(`Invalid chapter title: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Delete a chapter title
 */
export async function deleteChapterTitle(id: string): Promise<void> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteDeleteChapterTitle(id);
  }
  await db.chapterTitles.delete(id);
}

/**
 * Get notes for a chapter
 */
export async function getChapterNotes(
  moduleId: string,
  book: string,
  chapter: number
): Promise<Note[]> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteGetChapterNotes(moduleId, book, chapter);
  }
  // Normalize moduleId to uppercase for case-insensitive matching
  const normalizedModuleId = moduleId.toUpperCase();
  
  // Get all notes and filter case-insensitively
  const allNotes = await db.notes.toArray();
  const matchingNotes = allNotes.filter(note => {
    const noteModuleIdMatches = note.moduleId.toUpperCase() === normalizedModuleId;
    if (note.range) {
      return noteModuleIdMatches &&
             note.range.start.book === book && 
             note.range.start.chapter === chapter;
    }
    return noteModuleIdMatches &&
           note.ref.book === book && 
           note.ref.chapter === chapter;
  });
  
  return matchingNotes;
}

/**
 * Save a note
 */
export async function saveNote(note: Note): Promise<string> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteSaveNote(note);
  }
  try {
    const validated = sanitizeData(note, validateNote);
    return await db.notes.put(validated);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new Error(`Invalid note: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Delete a note
 */
export async function deleteNote(id: string): Promise<void> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteDeleteNote(id);
  }
  await db.notes.delete(id);
}

/**
 * Add to reading history
 */
export async function addToHistory(
  moduleId: string,
  book: string,
  chapter: number
): Promise<void> {
  await db.readingHistory.put({
    id: crypto.randomUUID(),
    moduleId,
    book,
    chapter,
    timestamp: new Date(),
  });
  
  // Keep only last 100 entries
  const count = await db.readingHistory.count();
  if (count > 100) {
    const oldest = await db.readingHistory
      .orderBy('timestamp')
      .limit(count - 100)
      .primaryKeys();
    await db.readingHistory.bulkDelete(oldest);
  }
}


/**
 * Export all user data (annotations, headings, notes)
 */
export async function exportUserData(): Promise<{
  annotations: Annotation[];
  sectionHeadings: SectionHeading[];
  notes: Note[];
  preferences: UserPreferences;
}> {
  return {
    annotations: await db.annotations.toArray(),
    sectionHeadings: await db.sectionHeadings.toArray(),
    notes: await db.notes.toArray(),
    preferences: await getPreferences(),
  };
}

/**
 * Import user data
 */
export async function importUserData(data: {
  annotations?: Annotation[];
  sectionHeadings?: SectionHeading[];
  notes?: Note[];
}): Promise<void> {
  if (data.annotations) {
    await db.annotations.bulkPut(data.annotations);
  }
  if (data.sectionHeadings) {
    await db.sectionHeadings.bulkPut(data.sectionHeadings);
  }
  if (data.notes) {
    await db.notes.bulkPut(data.notes);
  }
}

/**
 * Clear all database stores (for testing/debugging)
 * Note: This does NOT clear preferences - use clearPreferences() separately if needed
 */
export async function clearDatabase(): Promise<void> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    await sqlite.sqliteClearDatabase();
    return;
  }
  await Promise.all([
    db.annotations.clear(),
    db.sectionHeadings.clear(),
    db.chapterTitles.clear(),
    db.notes.clear(),
    db.keyWords.clear(),
    db.markingPresets.clear(),
    db.chapterCache.clear(),
    db.readingHistory.clear(),
    db.studies.clear(),
    db.multiTranslationViews.clear(),
    db.observationLists.clear(),
    db.fiveWAndH.clear(),
    db.contrasts.clear(),
    db.timeExpressions.clear(),
    db.places.clear(),
    // Note: modules and moduleFiles tables are deprecated (Sword support removed)
    // but kept in schema for backwards compatibility
  ]);
  
  // Dispatch events to notify stores to reset
  window.dispatchEvent(new CustomEvent('databaseCleared'));
}

// ============================================================================
// Marking Preset Functions (unified key words + symbol/color presets)
// ============================================================================

export async function getAllMarkingPresets(): Promise<MarkingPreset[]> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteGetAllMarkingPresets();
  }
  return db.markingPresets.toArray();
}

export async function getMarkingPresetsByCategory(category: string): Promise<MarkingPreset[]> {
  if (isTauri()) {
    const all = await getAllMarkingPresets();
    return all.filter(p => p.category === category);
  }
  return db.markingPresets.where('category').equals(category).toArray();
}

export async function getMarkingPreset(id: string): Promise<MarkingPreset | undefined> {
  if (isTauri()) {
    const all = await getAllMarkingPresets();
    return all.find(p => p.id === id);
  }
  return db.markingPresets.get(id);
}

export async function saveMarkingPreset(preset: MarkingPreset): Promise<string> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteSaveMarkingPreset(preset);
  }
  try {
    const validated = sanitizeData(preset, validateMarkingPreset);
    return await db.markingPresets.put(validated);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('[saveMarkingPreset] Validation error:', error.message, error.field, error.value);
      throw new Error(`Invalid marking preset data: ${error.message}`);
    }
    throw error;
  }
}

export async function deleteMarkingPreset(id: string): Promise<void> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteDeleteMarkingPreset(id);
  }
  await db.markingPresets.delete(id);
}

export async function incrementMarkingPresetUsage(id: string): Promise<void> {
  if (isTauri()) {
    const preset = await getMarkingPreset(id);
    if (preset) {
      preset.usageCount = (preset.usageCount || 0) + 1;
      preset.updatedAt = new Date();
      await saveMarkingPreset(preset);
    }
    return;
  }
  const preset = await db.markingPresets.get(id);
  if (preset) {
    await db.markingPresets.update(id, {
      usageCount: (preset.usageCount || 0) + 1,
      updatedAt: new Date(),
    });
  }
}

/** Search presets by text (matches word or variants; presets without word are excluded) */
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

// ============================================================================
// Study Functions
// ============================================================================

export async function getAllStudies(): Promise<Study[]> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteGetAllStudies();
  }
  return db.studies.toArray();
}

export async function getStudy(id: string): Promise<Study | undefined> {
  if (isTauri()) {
    const all = await getAllStudies();
    return all.find(s => s.id === id);
  }
  return db.studies.get(id);
}

export async function saveStudy(study: Study): Promise<string> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteSaveStudy(study);
  }
  try {
    const validated = sanitizeData(study, validateStudy);
    return await db.studies.put(validated);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('[saveStudy] Validation error:', error.message, error.field, error.value);
      throw new Error(`Invalid study data: ${error.message}`);
    }
    throw error;
  }
}

export async function deleteStudy(id: string): Promise<void> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteDeleteStudy(id);
  }
  await db.studies.delete(id);
}

// ============================================================================
// Multi-Translation View Functions
// ============================================================================

export async function getMultiTranslationView(id: string = 'active'): Promise<MultiTranslationView | undefined> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    const views = await sqlite.sqliteGetAllFromTable<MultiTranslationView>('multi_translation_views');
    return views.find(v => v.id === id);
  }
  return db.multiTranslationViews.get(id);
}

export async function saveMultiTranslationView(view: MultiTranslationView): Promise<string> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteSaveToTable('multi_translation_views', view);
  }
  try {
    const validated = sanitizeData(view, validateMultiTranslationView);
    return await db.multiTranslationViews.put(validated);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('[saveMultiTranslationView] Validation error:', error.message, error.field, error.value);
      throw new Error(`Invalid multi-translation view data: ${error.message}`);
    }
    throw error;
  }
}

export async function deleteMultiTranslationView(id: string = 'active'): Promise<void> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    return sqlite.sqliteDeleteFromTable('multi_translation_views', id);
  }
  await db.multiTranslationViews.delete(id);
}

// ============================================================================
// Observation Data Functions (with SQLite routing for iCloud sync)
// ============================================================================

// --- Observation Lists ---
export async function getAllObservationLists(): Promise<ObservationList[]> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteGetAllFromTable<ObservationList>('observation_lists'); }
  return db.observationLists.toArray();
}
export async function saveObservationList(list: ObservationList): Promise<string> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteSaveToTable('observation_lists', list); }
  return db.observationLists.put(list);
}
export async function deleteObservationList(id: string): Promise<void> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteDeleteFromTable('observation_lists', id); }
  await db.observationLists.delete(id);
}

// --- 5W+H Entries ---
export async function getAllFiveWAndH(): Promise<FiveWAndHEntry[]> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteGetAllFromTable<FiveWAndHEntry>('five_w_and_h'); }
  return db.fiveWAndH.toArray();
}
export async function saveFiveWAndH(entry: FiveWAndHEntry): Promise<string> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteSaveToTable('five_w_and_h', entry); }
  return db.fiveWAndH.put(entry);
}
export async function deleteFiveWAndH(id: string): Promise<void> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteDeleteFromTable('five_w_and_h', id); }
  await db.fiveWAndH.delete(id);
}

// --- Contrasts ---
export async function getAllContrasts(): Promise<Contrast[]> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteGetAllFromTable<Contrast>('contrasts'); }
  return db.contrasts.toArray();
}
export async function saveContrast(entry: Contrast): Promise<string> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteSaveToTable('contrasts', entry); }
  return db.contrasts.put(entry);
}
export async function deleteContrast(id: string): Promise<void> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteDeleteFromTable('contrasts', id); }
  await db.contrasts.delete(id);
}

// --- Time Expressions ---
export async function getAllTimeExpressions(): Promise<TimeExpression[]> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteGetAllFromTable<TimeExpression>('time_expressions'); }
  return db.timeExpressions.toArray();
}
export async function saveTimeExpression(entry: TimeExpression): Promise<string> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteSaveToTable('time_expressions', entry); }
  return db.timeExpressions.put(entry);
}
export async function deleteTimeExpression(id: string): Promise<void> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteDeleteFromTable('time_expressions', id); }
  await db.timeExpressions.delete(id);
}

// --- Places ---
export async function getAllPlaces(): Promise<Place[]> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteGetAllFromTable<Place>('places'); }
  return db.places.toArray();
}
export async function savePlace(entry: Place): Promise<string> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteSaveToTable('places', entry); }
  return db.places.put(entry);
}
export async function deletePlace(id: string): Promise<void> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteDeleteFromTable('places', id); }
  await db.places.delete(id);
}

// --- Conclusions ---
export async function getAllConclusions(): Promise<Conclusion[]> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteGetAllFromTable<Conclusion>('conclusions'); }
  return db.conclusions.toArray();
}
export async function saveConclusion(entry: Conclusion): Promise<string> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteSaveToTable('conclusions', entry); }
  return db.conclusions.put(entry);
}
export async function deleteConclusion(id: string): Promise<void> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteDeleteFromTable('conclusions', id); }
  await db.conclusions.delete(id);
}

// --- Interpretations ---
export async function getAllInterpretations(): Promise<InterpretationEntry[]> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteGetAllFromTable<InterpretationEntry>('interpretations'); }
  return db.interpretations.toArray();
}
export async function saveInterpretation(entry: InterpretationEntry): Promise<string> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteSaveToTable('interpretations', entry); }
  return db.interpretations.put(entry);
}
export async function deleteInterpretation(id: string): Promise<void> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteDeleteFromTable('interpretations', id); }
  await db.interpretations.delete(id);
}

// --- Applications ---
export async function getAllApplications(): Promise<ApplicationEntry[]> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteGetAllFromTable<ApplicationEntry>('applications'); }
  return db.applications.toArray();
}
export async function saveApplication(entry: ApplicationEntry): Promise<string> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteSaveToTable('applications', entry); }
  return db.applications.put(entry);
}
export async function deleteApplication(id: string): Promise<void> {
  if (isTauri()) { const s = await _sqlite(); return s.sqliteDeleteFromTable('applications', id); }
  await db.applications.delete(id);
}

// ============================================================================
// Clear Book Annotations (Phase 3)
// ============================================================================

/**
 * Clear all annotations (highlights, symbols, underlines) for a book.
 * Preserves keyword definitions, notes, section headings, and chapter titles.
 */
export async function clearBookAnnotations(book: string, moduleId?: string): Promise<number> {
  if (isTauri()) {
    const sqlite = await _sqlite();
    const sqliteDb = await sqlite.getSqliteDb();
    // Get all annotations, filter by book (and optionally moduleId), delete matching
    const rows = await sqliteDb.select<{ id: string; data: string; module_id: string }[]>(
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
      await sqliteDb.execute(`DELETE FROM annotations WHERE id = ?`, [row.id]);
    }
    return toDelete.length;
  }

  const query = db.annotations.filter(ann => {
    if (ann.type === 'symbol') {
      return ann.ref.book === book;
    }
    return ann.startRef.book === book;
  });
  
  // Filter by moduleId if provided
  if (moduleId) {
    const allAnnotations = await query.toArray();
    const filtered = allAnnotations.filter(ann => ann.moduleId === moduleId);
    const ids = filtered.map(ann => ann.id);
    await db.annotations.bulkDelete(ids);
    return ids.length;
  }
  
  // Delete all annotations for the book
  const annotations = await query.toArray();
  const ids = annotations.map(ann => ann.id);
  await db.annotations.bulkDelete(ids);
  return ids.length;
}
