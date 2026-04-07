/**
 * Backup and Restore Utilities
 * 
 * Handles exporting and importing all user data with:
 * - Tauri native file dialogs (when running in Tauri)
 * - File System Access API (when available in browser)
 * - Traditional download/upload fallback (for browsers without API support)
 */

import { exportAllData, importAllData, clearDatabase as clearAllDatabases, type UserPreferences } from './database';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { isTauri, isIOS } from './platform';
import type { Annotation, SectionHeading, ChapterTitle, Note } from '@/types';
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
  validateInterpretation,
  validatePlace,
  validatePerson,
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
    fiveWAndH?: unknown[];
    contrasts?: unknown[];
    timeExpressions: TimeExpression[];
    places: Place[];
    people: Person[];
    conclusions: Conclusion[];
    interpretations: InterpretationEntry[];
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

/** App version for backup compatibility (unified with package.json) */
const APP_VERSION = __APP_VERSION__;

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
export async function exportBackup(includeCache: boolean = false): Promise<string | void> {
  try {
    // Collect all data via database abstraction (routes to SQLite on native, IndexedDB on web)
    const allData = await exportAllData();

    // Ensure preferences exist
    const prefs = allData.preferences || {
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
    const cleanedMultiTranslationViews = allData.multiTranslationViews.map(view => {
      const { primaryTranslationId: _pt, ...cleanedView } = view as MultiTranslationView & { primaryTranslationId?: string };
      return cleanedView;
    });

    // Prepare backup data
    const backup: BackupData = {
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      data: {
        preferences: prefs,
        annotations: allData.annotations,
        sectionHeadings: allData.sectionHeadings,
        chapterTitles: allData.chapterTitles,
        notes: allData.notes,
        markingPresets: allData.markingPresets,
        studies: allData.studies,
        multiTranslationViews: cleanedMultiTranslationViews,
        observationLists: allData.observationLists,
        fiveWAndH: [],
        contrasts: [],
        timeExpressions: allData.timeExpressions,
        places: allData.places,
        people: allData.people,
        conclusions: allData.conclusions,
        interpretations: allData.interpretations,
        applications: allData.applications,
      },
    };

    // Include cached chapters if requested (cache is not part of the main data abstraction)
    if (includeCache && !isTauri()) {
      try {
        const { getAllCachedChapters } = await import('./database');
        const cachedChapters = await getAllCachedChapters();
        if (cachedChapters.length > 0) {
          backup.data.cachedChapters = cachedChapters.map(ch => ({
            id: ch.id,
            moduleId: ch.moduleId,
            book: ch.book,
            chapter: ch.chapter,
            verses: ch.verses,
            cachedAt: ch.cachedAt instanceof Date ? ch.cachedAt.toISOString() : new Date(ch.cachedAt).toISOString(),
          }));
        }
      } catch {
        // Cache export is non-critical, skip on error
      }
    }

    // Convert to JSON
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    // iOS: write to Documents folder (accessible via Files app)
    if (isTauri() && isIOS()) {
      try {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        const { documentDir } = await import('@tauri-apps/api/path');

        const dir = await documentDir();
        const filename = generateBackupFilename();
        const filePath = `${dir}/${filename}`;
        await writeTextFile(filePath, json);
        return filename;
      } catch (error: unknown) {
        throw new Error(`Failed to export backup: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
      }
    }

    // Desktop: use native file dialog
    if (isTauri()) {
      try {
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
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Export cancelled') {
          throw error;
        }
        throw new Error(`Failed to save backup: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
      }
    }

    // Use File System Access API if available (browser)
    if (isFileSystemAccessSupported()) {
      try {
        const w = window as Window & { showSaveFilePicker?: (options?: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }> };
        const fileHandle = await w.showSaveFilePicker!({
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
      } catch (error: unknown) {
        // User cancelled or error - fall through to download
        if (error instanceof Error && error.name === 'AbortError') {
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
interface BackupDataShape {
  version?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

export function validateBackup(data: unknown): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Backup data must be an object'], warnings: [] };
  }
  const d = data as BackupDataShape;

  if (typeof d.version !== 'string' || d.version.trim() === '') {
    errors.push('Backup must have a valid version string');
  }

  if (typeof d.timestamp !== 'string' || d.timestamp.trim() === '') {
    errors.push('Backup must have a valid timestamp string');
  }

  if (!d.data || typeof d.data !== 'object') {
    return { valid: false, errors: ['Backup must have a data object'], warnings: [] };
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
      if (!d.data.preferences || typeof d.data.preferences !== 'object') {
        errors.push('Backup must have preferences object');
      }
    } else {
      if (!Array.isArray(d.data[field])) {
        errors.push(`Backup must have ${field} as an array`);
      }
    }
  }

  // Validate individual records — invalid records are warnings, not errors.
  // The import step filters them out gracefully; we just report what will be skipped.
  const recordValidations: Array<{ label: string; data: unknown[]; validator: (entry: unknown) => unknown }> = [
    { label: 'Annotations', data: d.data.annotations as unknown[] ?? [], validator: validateAnnotation },
    { label: 'Section headings', data: d.data.sectionHeadings as unknown[] ?? [], validator: validateSectionHeading },
    { label: 'Chapter titles', data: d.data.chapterTitles as unknown[] ?? [], validator: validateChapterTitle },
    { label: 'Notes', data: d.data.notes as unknown[] ?? [], validator: validateNote },
    { label: 'Marking presets', data: d.data.markingPresets as unknown[] ?? [], validator: validateMarkingPreset },
    { label: 'Studies', data: d.data.studies as unknown[] ?? [], validator: validateStudy },
    { label: 'Multi-translation views', data: d.data.multiTranslationViews as unknown[] ?? [], validator: validateMultiTranslationView },
    { label: 'Observation lists', data: d.data.observationLists as unknown[] ?? [], validator: validateObservationList },
    { label: 'Time expressions', data: d.data.timeExpressions as unknown[] ?? [], validator: (entry: unknown) => {
      if (!entry || typeof entry !== 'object') throw new ValidationError('Time expression must be an object');
      const e = entry as { id: string };
      if (typeof e.id !== 'string' || e.id.trim() === '') throw new ValidationError('Time expression must have valid id');
      return entry;
    }},
    { label: 'Places', data: d.data.places as unknown[] ?? [], validator: validatePlace },
    { label: 'People', data: d.data.people as unknown[] ?? [], validator: validatePerson },
    { label: 'Conclusions', data: d.data.conclusions as unknown[] ?? [], validator: (entry: unknown) => {
      if (!entry || typeof entry !== 'object') throw new ValidationError('Conclusion must be an object');
      const e = entry as { id: string };
      if (typeof e.id !== 'string' || e.id.trim() === '') throw new ValidationError('Conclusion must have valid id');
      return entry;
    }},
    { label: 'Interpretations', data: d.data.interpretations as unknown[] ?? [], validator: validateInterpretation },
    { label: 'Applications', data: d.data.applications as unknown[] ?? [], validator: validateApplication },
  ];

  for (const { label, data, validator } of recordValidations) {
    if (Array.isArray(data) && data.length > 0) {
      const { errors: recordErrors } = validateArray(data, validator, label.toLowerCase());
      if (recordErrors.length > 0) {
        warnings.push(`${label}: ${recordErrors.length} invalid record(s) will be skipped`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
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
    timeExpressions: backup.data.timeExpressions?.length || 0,
    places: backup.data.places?.length || 0,
    people: backup.data.people?.length || 0,
    conclusions: backup.data.conclusions?.length || 0,
    interpretations: backup.data.interpretations?.length || 0,
    applications: backup.data.applications.length,
    cachedChapters: backup.data.cachedChapters?.length || 0,
  };
}

/**
 * Import backup from file (returns backup data for preview)
 */
export async function importBackup(): Promise<BackupData> {
  let _fileHandle: FileSystemFileHandle | null = null;  // Reserved for future use (e.g. close)
  let file: File;
  let text: string;

  try {
    // Use Tauri native file dialog if running in Tauri (iOS read access works via security-scoped URLs)
    if (isTauri()) {
      try {
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
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Import cancelled') {
          throw error;
        }
        throw new Error(`Failed to read backup file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (isFileSystemAccessSupported()) {
      // Use File System Access API if available (browser)
      try {
        const w = window as Window & { showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]> };
        const [handle] = await w.showOpenFilePicker!({
          types: [{
            description: 'BibleMarker Backup',
            accept: { 'application/json': ['.json'] },
          }],
          multiple: false,
        });

        _fileHandle = handle;
        file = await handle.getFile();
        text = await file.text();
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
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
 * Routes to the correct backend (SQLite on native, IndexedDB on web)
 */
export async function restoreBackup(backup: BackupData): Promise<void> {
  try {
    // --- Validate all data before clearing database ---

    // Validate annotations
    let validatedAnnotations: Annotation[] = [];
    if (backup.data.annotations.length > 0) {
      const { valid } = validateArray(backup.data.annotations, validateAnnotation, 'annotation');
      validatedAnnotations = valid;
    }

    // Validate section headings
    let validatedHeadings: SectionHeading[] = [];
    const headings = backup.data.sectionHeadings || [];
    if (headings.length > 0) {
      console.log(`Attempting to restore ${headings.length} section heading(s)...`);
      const { valid, errors: headingErrors } = validateArray(headings, validateSectionHeading, 'section heading');
      if (headingErrors.length > 0) {
        console.warn(`Failed to validate ${headingErrors.length} section heading(s):`, headingErrors.map(e => e.message));
      }
      if (valid.length === 0 && headings.length > 0) {
        throw new Error(`No valid section headings found. ${headings.length} heading(s) failed validation.`);
      }
      validatedHeadings = valid;
    }

    // Validate chapter titles
    let validatedTitles: ChapterTitle[] = [];
    const titles = backup.data.chapterTitles || [];
    if (titles.length > 0) {
      console.log(`Attempting to restore ${titles.length} chapter title(s)...`);
      const { valid, errors: titleErrors } = validateArray(titles, validateChapterTitle, 'chapter title');
      if (titleErrors.length > 0) {
        console.warn(`Failed to validate ${titleErrors.length} chapter title(s):`, titleErrors.map(e => e.message));
      }
      if (valid.length === 0 && titles.length > 0) {
        throw new Error(`No valid chapter titles found. ${titles.length} title(s) failed validation.`);
      }
      validatedTitles = valid;
    }

    // Validate notes
    let validatedNotes: Note[] = [];
    if (backup.data.notes.length > 0) {
      const { valid } = validateArray(backup.data.notes, validateNote, 'note');
      validatedNotes = valid;
    }

    // Validate marking presets
    let validatedPresets: MarkingPreset[] = [];
    if (backup.data.markingPresets.length > 0) {
      const { valid } = validateArray(backup.data.markingPresets, validateMarkingPreset, 'marking preset');
      validatedPresets = valid;
    }

    // Validate studies
    let validatedStudies: Study[] = [];
    if (backup.data.studies.length > 0) {
      const { valid } = validateArray(backup.data.studies, validateStudy, 'study');
      validatedStudies = valid;
    }

    // Validate multi-translation views
    let validatedViews: MultiTranslationView[] = [];
    if (backup.data.multiTranslationViews.length > 0) {
      const { valid } = validateArray(backup.data.multiTranslationViews, validateMultiTranslationView, 'multi-translation view');
      validatedViews = valid;
    }

    // Validate observation lists
    let validatedLists: ObservationList[] = [];
    if (backup.data.observationLists.length > 0) {
      const { valid } = validateArray(backup.data.observationLists, validateObservationList, 'observation list');
      validatedLists = valid;
    }

    // Validate places
    let validatedPlaces: Place[] = [];
    if (backup.data.places && backup.data.places.length > 0) {
      const { valid } = validateArray(backup.data.places, validatePlace, 'place');
      validatedPlaces = valid;
    }

    // Validate people
    let validatedPeople: Person[] = [];
    if (backup.data.people && backup.data.people.length > 0) {
      const { valid } = validateArray(backup.data.people, validatePerson, 'person');
      validatedPeople = valid;
    }

    // Validate interpretations
    let validatedInterpretations: InterpretationEntry[] = [];
    if (backup.data.interpretations && backup.data.interpretations.length > 0) {
      const { valid } = validateArray(backup.data.interpretations, validateInterpretation, 'interpretation entry');
      validatedInterpretations = valid;
    }

    // Validate application entries
    let validatedApplications: ApplicationEntry[] = [];
    if (backup.data.applications && backup.data.applications.length > 0) {
      const { valid } = validateArray(backup.data.applications, validateApplication, 'application entry');
      validatedApplications = valid;
    }

    // --- Create safety backup before clearing database ---
    try {
      const { performBackup } = await import('./autoBackup');
      await performBackup();
      console.log('[Restore] Safety backup created before restore');
    } catch (backupError) {
      console.warn('[Restore] Failed to create safety backup (proceeding with restore):', backupError);
    }

    // --- Clear and import via database abstraction (routes to correct backend) ---

    await clearAllDatabases();

    await importAllData({
      annotations: validatedAnnotations,
      sectionHeadings: validatedHeadings,
      chapterTitles: validatedTitles,
      notes: validatedNotes,
      markingPresets: validatedPresets,
      studies: validatedStudies,
      multiTranslationViews: validatedViews,
      observationLists: validatedLists,
      timeExpressions: backup.data.timeExpressions || [],
      places: validatedPlaces,
      people: validatedPeople,
      conclusions: backup.data.conclusions || [],
      interpretations: validatedInterpretations,
      applications: validatedApplications,
      preferences: backup.data.preferences || null,
    });

    // Restore cached chapters if present (cache is not part of the main abstraction)
    if (backup.data.cachedChapters && backup.data.cachedChapters.length > 0 && !isTauri()) {
      try {
        const { setCachedChapter } = await import('./database');
        await Promise.all(
          backup.data.cachedChapters.map(ch =>
            setCachedChapter(ch.moduleId, ch.book, ch.chapter, ch.verses)
          )
        );
      } catch {
        // Cache restore is non-critical
      }
    }
  } catch (error) {
    throw new Error(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
