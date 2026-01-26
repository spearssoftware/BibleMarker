/**
 * Backup and Restore Utilities
 * 
 * Handles exporting and importing all user data with:
 * - Tauri native file dialogs (when running in Tauri)
 * - File System Access API (when available in browser)
 * - Traditional download/upload fallback (for browsers without API support)
 */

import { db, type UserPreferences } from './db';
import { isTauri } from './platform';
import type { Annotation, SectionHeading, ChapterTitle, Note } from '@/types/annotation';
import type { MarkingPreset } from '@/types/keyWord';
import type { Study } from '@/types/study';
import type { MultiTranslationView } from '@/types/multiTranslation';
import type { ObservationList } from '@/types/list';
import type { ApplicationEntry } from '@/types/application';
import {
  validateAnnotation,
  validateSectionHeading,
  validateChapterTitle,
  validateNote,
  validateMarkingPreset,
  validateStudy,
  validateMultiTranslationView,
  validateObservationList,
  validateApplication,
  validateArray,
  ValidationError,
} from './validation';

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
    applications: ApplicationEntry[];
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
  return `BibleMarker-backup-${year}-${month}-${day}-${hours}${minutes}${seconds}.json`;
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
      applications,
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
      db.applications.toArray(),
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

    // Clean up multi-translation views - remove primaryTranslationId if present (it's computed dynamically)
    const cleanedMultiTranslationViews = multiTranslationViews.map(view => {
      const { primaryTranslationId, ...cleanedView } = view as MultiTranslationView & { primaryTranslationId?: string };
      return cleanedView;
    });

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
        multiTranslationViews: cleanedMultiTranslationViews,
        observationLists,
        applications,
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

    // Use Tauri native file dialog if running in Tauri
    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        
        const filePath = await save({
          defaultPath: generateBackupFilename(),
          filters: [{
            name: 'BibleMarker Backup',
            extensions: ['json'],
          }],
        });

        if (!filePath) {
          throw new Error('Export cancelled');
        }

        await writeTextFile(filePath, json);
        return;
      } catch (error: any) {
        if (error.message === 'Export cancelled') {
          throw error;
        }
        throw new Error(`Failed to save backup: ${error.message || 'Unknown error'}`);
      }
    }

    // Use File System Access API if available (browser)
    if (isFileSystemAccessSupported()) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: generateBackupFilename(),
          types: [{
            description: 'BibleMarker Backup',
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
 * Validate backup file structure with detailed validation
 */
export function validateBackup(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Backup data must be an object'] };
  }

  if (typeof data.version !== 'string' || data.version.trim() === '') {
    errors.push('Backup must have a valid version string');
  }

  if (typeof data.timestamp !== 'string' || data.timestamp.trim() === '') {
    errors.push('Backup must have a valid timestamp string');
  }

  if (!data.data || typeof data.data !== 'object') {
    return { valid: false, errors: ['Backup must have a data object'] };
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
    'applications',
  ];

  for (const field of requiredFields) {
    if (field === 'preferences') {
      if (!data.data.preferences || typeof data.data.preferences !== 'object') {
        errors.push('Backup must have preferences object');
      }
    } else {
      if (!Array.isArray(data.data[field])) {
        errors.push(`Backup must have ${field} as an array`);
      }
    }
  }

  // Validate individual records if arrays exist
  if (Array.isArray(data.data.annotations)) {
    const { errors: annErrors } = validateArray(data.data.annotations, validateAnnotation, 'annotation');
    if (annErrors.length > 0) {
      errors.push(`Annotations validation errors: ${annErrors.length} invalid records`);
      // Include first few errors as examples
      errors.push(...annErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(data.data.sectionHeadings)) {
    const { errors: headingErrors } = validateArray(data.data.sectionHeadings, validateSectionHeading, 'section heading');
    if (headingErrors.length > 0) {
      errors.push(`Section headings validation errors: ${headingErrors.length} invalid records`);
      errors.push(...headingErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(data.data.chapterTitles)) {
    const { errors: titleErrors } = validateArray(data.data.chapterTitles, validateChapterTitle, 'chapter title');
    if (titleErrors.length > 0) {
      errors.push(`Chapter titles validation errors: ${titleErrors.length} invalid records`);
      errors.push(...titleErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(data.data.notes)) {
    const { errors: noteErrors } = validateArray(data.data.notes, validateNote, 'note');
    if (noteErrors.length > 0) {
      errors.push(`Notes validation errors: ${noteErrors.length} invalid records`);
      errors.push(...noteErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(data.data.markingPresets)) {
    const { errors: presetErrors } = validateArray(data.data.markingPresets, validateMarkingPreset, 'marking preset');
    if (presetErrors.length > 0) {
      errors.push(`Marking presets validation errors: ${presetErrors.length} invalid records`);
      errors.push(...presetErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(data.data.studies)) {
    const { errors: studyErrors } = validateArray(data.data.studies, validateStudy, 'study');
    if (studyErrors.length > 0) {
      errors.push(`Studies validation errors: ${studyErrors.length} invalid records`);
      errors.push(...studyErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(data.data.multiTranslationViews)) {
    const { errors: viewErrors } = validateArray(data.data.multiTranslationViews, validateMultiTranslationView, 'multi-translation view');
    if (viewErrors.length > 0) {
      errors.push(`Multi-translation views validation errors: ${viewErrors.length} invalid records`);
      errors.push(...viewErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(data.data.observationLists)) {
    const { errors: listErrors } = validateArray(data.data.observationLists, validateObservationList, 'observation list');
    if (listErrors.length > 0) {
      errors.push(`Observation lists validation errors: ${listErrors.length} invalid records`);
      errors.push(...listErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(data.data.applications)) {
    const { errors: appErrors } = validateArray(data.data.applications, validateApplication, 'application entry');
    if (appErrors.length > 0) {
      errors.push(`Application entries validation errors: ${appErrors.length} invalid records`);
      errors.push(...appErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  return { valid: errors.length === 0, errors };
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
    applications: backup.data.applications.length,
    cachedChapters: backup.data.cachedChapters?.length || 0,
  };
}

/**
 * Import backup from file (returns backup data for preview)
 */
export async function importBackup(): Promise<BackupData> {
  let fileHandle: any = null;  // FileSystemFileHandle (browser API, not in TypeScript types)
  let file: File;
  let text: string;

  try {
    // Use Tauri native file dialog if running in Tauri
    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        
        const filePath = await open({
          multiple: false,
          filters: [{
            name: 'BibleMarker Backup',
            extensions: ['json'],
          }],
        });

        if (!filePath || typeof filePath !== 'string') {
          throw new Error('Import cancelled');
        }

        text = await readTextFile(filePath);
      } catch (error: any) {
        if (error.message === 'Import cancelled') {
          throw error;
        }
        throw new Error(`Failed to read backup file: ${error.message || 'Unknown error'}`);
      }
    } else if (isFileSystemAccessSupported()) {
      // Use File System Access API if available (browser)
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'BibleMarker Backup',
            accept: { 'application/json': ['.json'] },
          }],
          multiple: false,
        });

        fileHandle = handle;
        file = await handle.getFile();
        text = await file.text();
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
      text = await file.text();
    }

    // Parse and validate backup
    let backup: BackupData;
    
    try {
      backup = JSON.parse(text) as BackupData;
    } catch (error) {
      throw new Error('Invalid JSON file: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }

    // Validate backup with detailed error messages
    const validation = validateBackup(backup);
    if (!validation.valid) {
      const errorMessage = validation.errors.length > 0
        ? `Invalid backup file format:\n${validation.errors.join('\n')}`
        : 'Invalid backup file format';
      throw new Error(errorMessage);
    }

    return backup;
  } catch (error) {
    // Preserve cancellation errors without wrapping
    if (error instanceof Error && error.message === 'Import cancelled') {
      throw error;
    }
    throw new Error(`Failed to import backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Restore data from backup to database (replaces all existing data)
 */
export async function restoreBackup(backup: BackupData): Promise<void> {
  try {
    // Clear all existing data (full replace)
    await db.annotations.clear();
    await db.sectionHeadings.clear();
    await db.chapterTitles.clear();
    await db.notes.clear();
    await db.markingPresets.clear();
    await db.studies.clear();
    await db.multiTranslationViews.clear();
    await db.observationLists.clear();
    await db.applications.clear();
    await db.chapterCache.clear();

    // Restore preferences
    if (backup.data.preferences) {
      await db.preferences.put(backup.data.preferences);
    }

    // Restore annotations
    if (backup.data.annotations.length > 0) {
      const { valid: validatedAnnotations } = validateArray(backup.data.annotations, validateAnnotation, 'annotation');
      if (validatedAnnotations.length > 0) {
        await db.annotations.bulkPut(validatedAnnotations);
      }
    }

    // Restore section headings
    const headings = backup.data.sectionHeadings || [];
    if (headings.length > 0) {
      console.log(`Attempting to restore ${headings.length} section heading(s)...`);
      const { valid: validatedHeadings, errors: headingErrors } = validateArray(headings, validateSectionHeading, 'section heading');
      if (headingErrors.length > 0) {
        console.warn(`Failed to validate ${headingErrors.length} section heading(s):`, headingErrors.map(e => e.message));
      }
      if (validatedHeadings.length > 0) {
        try {
          await db.sectionHeadings.bulkPut(validatedHeadings);
          const savedCount = await db.sectionHeadings.count();
          console.log(`✓ Successfully restored ${validatedHeadings.length} section heading(s). Total in database: ${savedCount}`);
        } catch (error) {
          console.error('Error saving section headings:', error);
          throw new Error(`Failed to save section headings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else if (headings.length > 0) {
        const errorMsg = `No valid section headings found. ${headings.length} heading(s) failed validation.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    }

    // Restore chapter titles
    const titles = backup.data.chapterTitles || [];
    if (titles.length > 0) {
      console.log(`Attempting to restore ${titles.length} chapter title(s)...`);
      const { valid: validatedTitles, errors: titleErrors } = validateArray(titles, validateChapterTitle, 'chapter title');
      if (titleErrors.length > 0) {
        console.warn(`Failed to validate ${titleErrors.length} chapter title(s):`, titleErrors.map(e => e.message));
      }
      if (validatedTitles.length > 0) {
        try {
          await db.chapterTitles.bulkPut(validatedTitles);
          const savedCount = await db.chapterTitles.count();
          console.log(`✓ Successfully restored ${validatedTitles.length} chapter title(s). Total in database: ${savedCount}`);
        } catch (error) {
          console.error('Error saving chapter titles:', error);
          throw new Error(`Failed to save chapter titles: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else if (titles.length > 0) {
        const errorMsg = `No valid chapter titles found. ${titles.length} title(s) failed validation.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    }

    // Restore notes
    if (backup.data.notes.length > 0) {
      const { valid: validatedNotes } = validateArray(backup.data.notes, validateNote, 'note');
      if (validatedNotes.length > 0) {
        await db.notes.bulkPut(validatedNotes);
      }
    }

    // Restore marking presets
    if (backup.data.markingPresets.length > 0) {
      const { valid: validatedPresets } = validateArray(backup.data.markingPresets, validateMarkingPreset, 'marking preset');
      if (validatedPresets.length > 0) {
        await db.markingPresets.bulkPut(validatedPresets);
      }
    }

    // Restore studies
    if (backup.data.studies.length > 0) {
      const { valid: validatedStudies } = validateArray(backup.data.studies, validateStudy, 'study');
      if (validatedStudies.length > 0) {
        await db.studies.bulkPut(validatedStudies);
      }
    }

    // Restore multi-translation views
    if (backup.data.multiTranslationViews.length > 0) {
      const { valid: validatedViews } = validateArray(backup.data.multiTranslationViews, validateMultiTranslationView, 'multi-translation view');
      if (validatedViews.length > 0) {
        await db.multiTranslationViews.bulkPut(validatedViews);
      }
    }

    // Restore observation lists
    if (backup.data.observationLists.length > 0) {
      const { valid: validatedLists } = validateArray(backup.data.observationLists, validateObservationList, 'observation list');
      if (validatedLists.length > 0) {
        await db.observationLists.bulkPut(validatedLists);
      }
    }

    // Restore application entries
    if (backup.data.applications && backup.data.applications.length > 0) {
      const { valid: validatedApplications } = validateArray(backup.data.applications, validateApplication, 'application entry');
      if (validatedApplications.length > 0) {
        await db.applications.bulkPut(validatedApplications);
      }
    }

    // Restore cached chapters
    if (backup.data.cachedChapters && backup.data.cachedChapters.length > 0) {
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
