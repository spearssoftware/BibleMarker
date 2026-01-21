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
import {
  validateAnnotation,
  validateSectionHeading,
  validateChapterTitle,
  validateNote,
  validateMarkingPreset,
  validateStudy,
  validateMultiTranslationView,
  validateObservationList,
  sanitizeData,
  ValidationError,
} from './validation';

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
  translations: any[];            // Array of translation objects
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
  onboarding?: OnboardingState;    // Onboarding state for first-time users
  autoBackup?: AutoBackupConfig;    // Auto-backup configuration
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
  }
}

export const db = new BibleMarkerDB();

// Expose db to window for debugging (browser console access)
if (typeof window !== 'undefined') {
  (window as any).db = db;
}

/**
 * Get or create user preferences
 */
export async function getPreferences(): Promise<UserPreferences> {
  let prefs = await db.preferences.get('main');
  
  if (!prefs) {
    const newPrefs: UserPreferences = {
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
    await db.preferences.put(newPrefs);
    return newPrefs;
  }
  
  // Ensure onboarding state exists for existing users
  if (!prefs.onboarding) {
    prefs.onboarding = {
      hasSeenWelcome: false,
      hasCompletedTour: false,
      dismissedTooltips: [],
    };
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
  await db.annotations.delete(id);
}

/**
 * Save a section heading
 */
export async function saveSectionHeading(heading: SectionHeading): Promise<string> {
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
  // Get title for this book/chapter (translation-agnostic)
  const allTitles = await db.chapterTitles.toArray();
  const found = allTitles.find(t => t.book === book && t.chapter === chapter);
  
  if (!found) {
    console.log(`[getChapterTitle] No title found for book="${book}", chapter=${chapter}`);
    console.log(`[getChapterTitle] Available titles:`, allTitles.map(t => ({ book: t.book, chapter: t.chapter, title: t.title })));
  }
  return found;
}

/**
 * Save a chapter title
 */
export async function saveChapterTitle(title: ChapterTitle): Promise<string> {
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
  return db.markingPresets.toArray();
}

export async function getMarkingPresetsByCategory(category: string): Promise<MarkingPreset[]> {
  return db.markingPresets.where('category').equals(category).toArray();
}

export async function getMarkingPreset(id: string): Promise<MarkingPreset | undefined> {
  return db.markingPresets.get(id);
}

export async function saveMarkingPreset(preset: MarkingPreset): Promise<string> {
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
  await db.markingPresets.delete(id);
}

export async function incrementMarkingPresetUsage(id: string): Promise<void> {
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
  const all = await db.markingPresets.toArray();
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
  return db.studies.toArray();
}

export async function getStudy(id: string): Promise<Study | undefined> {
  return db.studies.get(id);
}

export async function saveStudy(study: Study): Promise<string> {
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
  await db.studies.delete(id);
}

// ============================================================================
// Multi-Translation View Functions
// ============================================================================

export async function getMultiTranslationView(id: string = 'active'): Promise<MultiTranslationView | undefined> {
  return db.multiTranslationViews.get(id);
}

export async function saveMultiTranslationView(view: MultiTranslationView): Promise<string> {
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
  await db.multiTranslationViews.delete(id);
}

// ============================================================================
// Clear Book Annotations (Phase 3)
// ============================================================================

/**
 * Clear all annotations (highlights, symbols, underlines) for a book.
 * Preserves keyword definitions, notes, section headings, and chapter titles.
 */
export async function clearBookAnnotations(book: string, moduleId?: string): Promise<number> {
  let query = db.annotations.filter(ann => {
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
