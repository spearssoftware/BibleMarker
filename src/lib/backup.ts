/**
 * Backup and Restore Utilities
 * 
 * Handles exporting and importing all user data with File System Access API support.
 * Falls back to traditional download/upload for browsers without API support.
 */

import { db, type UserPreferences } from './db';
import type { Annotation, SectionHeading, ChapterTitle, Note } from '@/types/annotation';
import type { MarkingPreset } from '@/types/keyWord';
import type { Study } from '@/types/study';
import type { MultiTranslationView } from '@/types/multiTranslation';
import type { ObservationList } from '@/types/list';

/** Backup data structure */
export interface BackupData {
  version: string;              // App version for compatibility checking
  timestamp: string;            // ISO timestamp of backup creation
  data: {
    preferences: UserPreferences;
    annotations: Annotation[];
    sectionHeadings: SectionHeading[];
    chapterTitles: ChapterTitle[];
    notes: Note[];
    markingPresets: MarkingPreset[];
    studies: Study[];
    multiTranslationViews: MultiTranslationView[];
    observationLists: ObservationList[];
    cachedChapters?: Array<{
      id: string;
      moduleId: string;
      book: string;
      chapter: number;
      verses: Record<number, string>;
      cachedAt: string;  // ISO string
    }>;
  };
}

/** App version for backup compatibility */
const APP_VERSION = '0.1.0';

/**
 * Check if File System Access API is available
 */
function isFileSystemAccessSupported(): boolean {
  return 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
}

/**
 * Generate backup filename with timestamp
 */
function generateBackupFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `biblestudy-backup-${year}-${month}-${day}-${hours}${minutes}${seconds}.json`;
}

/**
 * Export all user data to a backup file
 */
export async function exportBackup(includeCache: boolean = false): Promise<void> {
  try {
    // Collect all data
    const [
      preferences,
      annotations,
      sectionHeadings,
      chapterTitles,
      notes,
      markingPresets,
      studies,
      multiTranslationViews,
      observationLists,
      cachedChapters,
    ] = await Promise.all([
      db.preferences.get('main'),
      db.annotations.toArray(),
      db.sectionHeadings.toArray(),
      db.chapterTitles.toArray(),
      db.notes.toArray(),
      db.markingPresets.toArray(),
      db.studies.toArray(),
      db.multiTranslationViews.toArray(),
      db.observationLists.toArray(),
      includeCache ? db.chapterCache.toArray() : Promise.resolve([]),
    ]);

    // Ensure preferences exist
    const prefs = preferences || {
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
      theme: 'dark',
      favoriteTranslations: [],
      recentTranslations: [],
    };

    // Prepare backup data
    const backup: BackupData = {
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      data: {
        preferences: prefs,
        annotations,
        sectionHeadings,
        chapterTitles,
        notes,
        markingPresets,
        studies,
        multiTranslationViews,
        observationLists,
      },
    };

    // Include cached chapters if requested
    if (includeCache && cachedChapters.length > 0) {
      backup.data.cachedChapters = cachedChapters.map(ch => ({
        ...ch,
        cachedAt: ch.cachedAt instanceof Date ? ch.cachedAt.toISOString() : new Date(ch.cachedAt).toISOString(),
      }));
    }

    // Convert to JSON
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    // Use File System Access API if available
    if (isFileSystemAccessSupported()) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: generateBackupFilename(),
          types: [{
            description: 'Bible Study Backup',
            accept: { 'application/json': ['.json'] },
          }],
        });

        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (error: any) {
        // User cancelled or error - fall through to download
        if (error.name === 'AbortError') {
          throw new Error('Export cancelled');
        }
        console.warn('File System Access API failed, falling back to download:', error);
      }
    }

    // Fallback to browser download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generateBackupFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(`Failed to export backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate backup file structure
 */
export function validateBackup(data: any): data is BackupData {
  if (!data || typeof data !== 'object') {
    return false;
  }

  if (typeof data.version !== 'string' || typeof data.timestamp !== 'string') {
    return false;
  }

  if (!data.data || typeof data.data !== 'object') {
    return false;
  }

  // Check required data fields
  const requiredFields = [
    'preferences',
    'annotations',
    'sectionHeadings',
    'chapterTitles',
    'notes',
    'markingPresets',
    'studies',
    'multiTranslationViews',
    'observationLists',
  ];

  for (const field of requiredFields) {
    if (!Array.isArray(data.data[field]) && field !== 'preferences') {
      return false;
    }
  }

  return true;
}

/**
 * Get data counts from backup for preview
 */
export function getBackupPreview(backup: BackupData): Record<string, number> {
  return {
    preferences: 1,
    annotations: backup.data.annotations.length,
    sectionHeadings: backup.data.sectionHeadings.length,
    chapterTitles: backup.data.chapterTitles.length,
    notes: backup.data.notes.length,
    markingPresets: backup.data.markingPresets.length,
    studies: backup.data.studies.length,
    multiTranslationViews: backup.data.multiTranslationViews.length,
    observationLists: backup.data.observationLists.length,
    cachedChapters: backup.data.cachedChapters?.length || 0,
  };
}

/**
 * Import backup from file (returns backup data for preview)
 */
export async function importBackup(): Promise<BackupData> {
  let fileHandle: any = null;  // FileSystemFileHandle (browser API, not in TypeScript types)
  let file: File;

  try {
    // Use File System Access API if available
    if (isFileSystemAccessSupported()) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'Bible Study Backup',
            accept: { 'application/json': ['.json'] },
          }],
          multiple: false,
        });

        fileHandle = handle;
        file = await handle.getFile();
      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw new Error('Import cancelled');
        }
        throw error;
      }
    } else {
      // Fallback to file input
      file = await new Promise<File>((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            resolve(file);
          } else {
            reject(new Error('No file selected'));
          }
        };
        input.oncancel = () => {
          reject(new Error('Import cancelled'));
        };
        input.click();
      });
    }

    // Read file
    const text = await file.text();
    const backup = JSON.parse(text) as BackupData;

    // Validate backup
    if (!validateBackup(backup)) {
      throw new Error('Invalid backup file format');
    }

    return backup;
  } catch (error) {
    throw new Error(`Failed to import backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Restore data from backup to database
 */
export async function restoreBackup(
  backup: BackupData,
  restoreMode: 'replace' | 'merge' | 'selective',
  selectedTypes?: string[]
): Promise<void> {
  try {
    // Determine which data types to restore
    const typesToRestore = restoreMode === 'selective' && selectedTypes
      ? selectedTypes
      : [
          'preferences',
          'annotations',
          'sectionHeadings',
          'chapterTitles',
          'notes',
          'markingPresets',
          'studies',
          'multiTranslationViews',
          'observationLists',
          'cachedChapters',
        ];

    // Clear existing data if replacing
    if (restoreMode === 'replace') {
      if (typesToRestore.includes('annotations')) {
        await db.annotations.clear();
      }
      if (typesToRestore.includes('sectionHeadings')) {
        await db.sectionHeadings.clear();
      }
      if (typesToRestore.includes('chapterTitles')) {
        await db.chapterTitles.clear();
      }
      if (typesToRestore.includes('notes')) {
        await db.notes.clear();
      }
      if (typesToRestore.includes('markingPresets')) {
        await db.markingPresets.clear();
      }
      if (typesToRestore.includes('studies')) {
        await db.studies.clear();
      }
      if (typesToRestore.includes('multiTranslationViews')) {
        await db.multiTranslationViews.clear();
      }
      if (typesToRestore.includes('observationLists')) {
        await db.observationLists.clear();
      }
      if (typesToRestore.includes('cachedChapters')) {
        await db.chapterCache.clear();
      }
    }

    // Restore data
    if (typesToRestore.includes('preferences') && backup.data.preferences) {
      await db.preferences.put(backup.data.preferences);
    }

    if (typesToRestore.includes('annotations') && backup.data.annotations.length > 0) {
      await db.annotations.bulkPut(backup.data.annotations);
    }

    if (typesToRestore.includes('sectionHeadings') && backup.data.sectionHeadings.length > 0) {
      await db.sectionHeadings.bulkPut(backup.data.sectionHeadings);
    }

    if (typesToRestore.includes('chapterTitles') && backup.data.chapterTitles.length > 0) {
      await db.chapterTitles.bulkPut(backup.data.chapterTitles);
    }

    if (typesToRestore.includes('notes') && backup.data.notes.length > 0) {
      await db.notes.bulkPut(backup.data.notes);
    }

    if (typesToRestore.includes('markingPresets') && backup.data.markingPresets.length > 0) {
      await db.markingPresets.bulkPut(backup.data.markingPresets);
    }

    if (typesToRestore.includes('studies') && backup.data.studies.length > 0) {
      await db.studies.bulkPut(backup.data.studies);
    }

    if (typesToRestore.includes('multiTranslationViews') && backup.data.multiTranslationViews.length > 0) {
      await db.multiTranslationViews.bulkPut(backup.data.multiTranslationViews);
    }

    if (typesToRestore.includes('observationLists') && backup.data.observationLists.length > 0) {
      await db.observationLists.bulkPut(backup.data.observationLists);
    }

    if (typesToRestore.includes('cachedChapters') && backup.data.cachedChapters && backup.data.cachedChapters.length > 0) {
      const chapters = backup.data.cachedChapters.map(ch => ({
        ...ch,
        cachedAt: new Date(ch.cachedAt),
      }));
      await db.chapterCache.bulkPut(chapters);
    }
  } catch (error) {
    throw new Error(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
