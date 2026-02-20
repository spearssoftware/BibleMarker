/**
 * Backup and Restore Utilities
 * 
 * Handles exporting and importing all user data with:
 * - Tauri native file dialogs (when running in Tauri)
 * - File System Access API (when available in browser)
 * - Traditional download/upload fallback (for browsers without API support)
 */

import { exportAllData, importAllData, clearDatabase as clearAllDatabases, type UserPreferences } from './database';
import { isTauri } from './platform';
import type { Annotation, SectionHeading, ChapterTitle, Note } from '@/types';
import type { MarkingPreset } from '@/types';
import type { Study } from '@/types';
import type { MultiTranslationView } from '@/types';
import type { ObservationList } from '@/types';
import type { FiveWAndHEntry } from '@/types';
import type { Contrast } from '@/types';
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
  validateFiveWAndH,
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
    fiveWAndH: FiveWAndHEntry[];
    contrasts: Contrast[];
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
export async function exportBackup(includeCache: boolean = false): Promise<void> {
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
        fiveWAndH: allData.fiveWAndH,
        contrasts: allData.contrasts,
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
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Export cancelled') {
          throw error;
        }
        throw new Error(`Failed to save backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

export function validateBackup(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Backup data must be an object'] };
  }
  const d = data as BackupDataShape;

  if (typeof d.version !== 'string' || d.version.trim() === '') {
    errors.push('Backup must have a valid version string');
  }

  if (typeof d.timestamp !== 'string' || d.timestamp.trim() === '') {
    errors.push('Backup must have a valid timestamp string');
  }

  if (!d.data || typeof d.data !== 'object') {
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
      if (!d.data.preferences || typeof d.data.preferences !== 'object') {
        errors.push('Backup must have preferences object');
      }
    } else {
      if (!Array.isArray(d.data[field])) {
        errors.push(`Backup must have ${field} as an array`);
      }
    }
  }

  // Validate individual records if arrays exist
  if (Array.isArray(d.data.annotations)) {
    const { errors: annErrors } = validateArray(d.data.annotations, validateAnnotation, 'annotation');
    if (annErrors.length > 0) {
      errors.push(`Annotations validation errors: ${annErrors.length} invalid records`);
      // Include first few errors as examples
      errors.push(...annErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.sectionHeadings)) {
    const { errors: headingErrors } = validateArray(d.data.sectionHeadings, validateSectionHeading, 'section heading');
    if (headingErrors.length > 0) {
      errors.push(`Section headings validation errors: ${headingErrors.length} invalid records`);
      errors.push(...headingErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.chapterTitles)) {
    const { errors: titleErrors } = validateArray(d.data.chapterTitles, validateChapterTitle, 'chapter title');
    if (titleErrors.length > 0) {
      errors.push(`Chapter titles validation errors: ${titleErrors.length} invalid records`);
      errors.push(...titleErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.notes)) {
    const { errors: noteErrors } = validateArray(d.data.notes, validateNote, 'note');
    if (noteErrors.length > 0) {
      errors.push(`Notes validation errors: ${noteErrors.length} invalid records`);
      errors.push(...noteErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.markingPresets)) {
    const { errors: presetErrors } = validateArray(d.data.markingPresets, validateMarkingPreset, 'marking preset');
    if (presetErrors.length > 0) {
      errors.push(`Marking presets validation errors: ${presetErrors.length} invalid records`);
      errors.push(...presetErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.studies)) {
    const { errors: studyErrors } = validateArray(d.data.studies, validateStudy, 'study');
    if (studyErrors.length > 0) {
      errors.push(`Studies validation errors: ${studyErrors.length} invalid records`);
      errors.push(...studyErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.multiTranslationViews)) {
    const { errors: viewErrors } = validateArray(d.data.multiTranslationViews, validateMultiTranslationView, 'multi-translation view');
    if (viewErrors.length > 0) {
      errors.push(`Multi-translation views validation errors: ${viewErrors.length} invalid records`);
      errors.push(...viewErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.observationLists)) {
    const { errors: listErrors } = validateArray(d.data.observationLists, validateObservationList, 'observation list');
    if (listErrors.length > 0) {
      errors.push(`Observation lists validation errors: ${listErrors.length} invalid records`);
      errors.push(...listErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.fiveWAndH)) {
    const { errors: fiveWErrors } = validateArray(d.data.fiveWAndH, validateFiveWAndH, '5W+H entry');
    if (fiveWErrors.length > 0) {
      errors.push(`5W+H entries validation errors: ${fiveWErrors.length} invalid records`);
      errors.push(...fiveWErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.contrasts)) {
    const { errors: contrastErrors } = validateArray(d.data.contrasts, (entry: unknown) => {
      // Basic validation for contrasts (full validation would require importing validateContrast)
      if (!entry || typeof entry !== 'object') throw new ValidationError('Contrast must be an object');
      const e = entry as { id: string };
      if (typeof e.id !== 'string' || e.id.trim() === '') throw new ValidationError('Contrast must have valid id');
      return entry;
    }, 'contrast');
    if (contrastErrors.length > 0) {
      errors.push(`Contrasts validation errors: ${contrastErrors.length} invalid records`);
      errors.push(...contrastErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.timeExpressions)) {
    const { errors: timeErrors } = validateArray(d.data.timeExpressions, (entry: unknown) => {
      if (!entry || typeof entry !== 'object') throw new ValidationError('Time expression must be an object');
      const e = entry as { id: string };
      if (typeof e.id !== 'string' || e.id.trim() === '') throw new ValidationError('Time expression must have valid id');
      return entry;
    }, 'time expression');
    if (timeErrors.length > 0) {
      errors.push(`Time expressions validation errors: ${timeErrors.length} invalid records`);
      errors.push(...timeErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.places)) {
    const { errors: placeErrors } = validateArray(d.data.places, validatePlace, 'place');
    if (placeErrors.length > 0) {
      errors.push(`Places validation errors: ${placeErrors.length} invalid records`);
      errors.push(...placeErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.people)) {
    const { errors: peopleErrors } = validateArray(d.data.people, validatePerson, 'person');
    if (peopleErrors.length > 0) {
      errors.push(`People validation errors: ${peopleErrors.length} invalid records`);
      errors.push(...peopleErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.conclusions)) {
    const { errors: conclusionErrors } = validateArray(d.data.conclusions, (entry: unknown) => {
      if (!entry || typeof entry !== 'object') throw new ValidationError('Conclusion must be an object');
      const e = entry as { id: string };
      if (typeof e.id !== 'string' || e.id.trim() === '') throw new ValidationError('Conclusion must have valid id');
      return entry;
    }, 'conclusion');
    if (conclusionErrors.length > 0) {
      errors.push(`Conclusions validation errors: ${conclusionErrors.length} invalid records`);
      errors.push(...conclusionErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.interpretations)) {
    const { errors: interpErrors } = validateArray(d.data.interpretations, validateInterpretation, 'interpretation entry');
    if (interpErrors.length > 0) {
      errors.push(`Interpretation entries validation errors: ${interpErrors.length} invalid records`);
      errors.push(...interpErrors.slice(0, 3).map(e => `  - ${e.message}`));
    }
  }

  if (Array.isArray(d.data.applications)) {
    const { errors: appErrors } = validateArray(d.data.applications, validateApplication, 'application entry');
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
    fiveWAndH: backup.data.fiveWAndH?.length || 0,
    contrasts: backup.data.contrasts?.length || 0,
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

    // Validate 5W+H entries
    let validatedFiveW: FiveWAndHEntry[] = [];
    if (backup.data.fiveWAndH && backup.data.fiveWAndH.length > 0) {
      const { valid } = validateArray(backup.data.fiveWAndH, validateFiveWAndH, '5W+H entry');
      validatedFiveW = valid;
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
      fiveWAndH: validatedFiveW,
      contrasts: backup.data.contrasts || [],
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
