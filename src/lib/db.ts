/**
 * IndexedDB Database
 * 
 * Uses Dexie.js for a clean API over IndexedDB.
 * Stores modules, annotations, preferences, and cached text.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { 
  SwordModuleConfig, 
  ModuleStatus,
  InstalledModule 
} from '@/types/sword';
import type { 
  Annotation, 
  SectionHeading, 
  ChapterTitle,
  Note,
  MarkingPreferences,
} from '@/types/annotation';

/** Installed module record */
interface ModuleRecord {
  id: string;                    // Module name (e.g., "ESV")
  config: SwordModuleConfig;
  status: ModuleStatus;
  installedAt: Date;
  updatedAt?: Date;
  size: number;
  error?: string;
}

/** Raw module file stored in IndexedDB */
interface ModuleFile {
  id: string;                    // moduleId:path
  moduleId: string;
  path: string;                  // Relative path within module
  data: ArrayBuffer;
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

/** User preferences */
interface UserPreferences {
  id: string;                    // 'main' for singleton
  currentModuleId?: string;
  currentBook?: string;
  currentChapter?: number;
  marking: MarkingPreferences;
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  theme: 'dark' | 'light' | 'auto';
}

/** Reading history entry */
interface ReadingHistory {
  id: string;                    // Auto-generated
  moduleId: string;
  book: string;
  chapter: number;
  timestamp: Date;
}

/** Database schema */
class BibleStudyDB extends Dexie {
  modules!: EntityTable<ModuleRecord, 'id'>;
  moduleFiles!: EntityTable<ModuleFile, 'id'>;
  chapterCache!: EntityTable<ChapterCache, 'id'>;
  annotations!: EntityTable<Annotation, 'id'>;
  sectionHeadings!: EntityTable<SectionHeading, 'id'>;
  chapterTitles!: EntityTable<ChapterTitle, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  preferences!: EntityTable<UserPreferences, 'id'>;
  readingHistory!: EntityTable<ReadingHistory, 'id'>;

  constructor() {
    super('BibleStudyDB');
    
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
  }
}

export const db = new BibleStudyDB();

/**
 * Get or create user preferences
 */
export async function getPreferences(): Promise<UserPreferences> {
  let prefs = await db.preferences.get('main');
  
  if (!prefs) {
    prefs = {
      id: 'main',
      marking: {
        favoriteColors: ['yellow', 'green', 'blue', 'pink'],
        favoriteSymbols: ['cross', 'triangle', 'circle', 'crown'],
        recentColors: [],
        recentSymbols: [],
        defaultTool: 'highlight',
        defaultColor: 'yellow',
        defaultSymbol: 'cross',
        toolbarPosition: 'bottom',
        showToolbarByDefault: true,
      },
      fontSize: 'base',
      theme: 'dark',
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
  moduleId: string,
  book: string,
  chapter: number
): Promise<SectionHeading[]> {
  const allHeadings = await db.sectionHeadings
    .where('moduleId')
    .equals(moduleId)
    .toArray();
  
  return allHeadings.filter(h => 
    h.beforeRef.book === book && h.beforeRef.chapter === chapter
  );
}

/**
 * Save an annotation
 */
export async function saveAnnotation(annotation: Annotation): Promise<string> {
  return db.annotations.put(annotation);
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
  return db.sectionHeadings.put(heading);
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
  moduleId: string,
  book: string,
  chapter: number
): Promise<ChapterTitle | undefined> {
  const allTitles = await db.chapterTitles
    .where('moduleId')
    .equals(moduleId)
    .toArray();
  
  return allTitles.find(t => t.book === book && t.chapter === chapter);
}

/**
 * Save a chapter title
 */
export async function saveChapterTitle(title: ChapterTitle): Promise<string> {
  return db.chapterTitles.put(title);
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
  const allNotes = await db.notes
    .where('moduleId')
    .equals(moduleId)
    .toArray();
  
  return allNotes.filter(note => 
    note.ref.book === book && note.ref.chapter === chapter
  );
}

/**
 * Save a note
 */
export async function saveNote(note: Note): Promise<string> {
  return db.notes.put(note);
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
 * Get installed modules
 */
export async function getInstalledModules(): Promise<InstalledModule[]> {
  const records = await db.modules.toArray();
  return records.map(r => ({
    config: r.config,
    status: r.status,
    installedAt: r.installedAt,
    updatedAt: r.updatedAt,
    size: r.size,
    error: r.error,
  }));
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
 */
export async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.annotations.clear(),
    db.sectionHeadings.clear(),
    db.chapterTitles.clear(),
    db.notes.clear(),
    db.chapterCache.clear(),
    db.moduleFiles.clear(),
    db.readingHistory.clear(),
    // Don't clear modules or preferences - those are system data
  ]);
}
