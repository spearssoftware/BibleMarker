/**
 * Auto-Backup Service
 * 
 * Automatically backs up user data at regular intervals and manages backup rotation.
 * Backups are stored as local JSON files, separate from the database, providing
 * protection against database corruption. Uses existing restoreBackup function for recovery.
 */

import Dexie, { type EntityTable } from 'dexie';
import { db, type UserPreferences, type AutoBackupConfig } from './db';
import { type BackupData } from './backup';
import { isTauri, isCapacitor } from './platform';
import type { MultiTranslationView } from '@/types/multiTranslation';

/** Backup file metadata stored in IndexedDB */
export interface BackupFileMetadata {
  id: string;                // UUID
  filename: string;          // Backup filename
  filepath?: string;         // Full file path (Tauri/Capacitor) or undefined (web)
  timestamp: Date;           // When backup was created
  size: number;              // Backup size in bytes
}

/** Backup data stored in IndexedDB (for web fallback) */
interface BackupDataRecord {
  id: string;
  data: BackupData;
}

/** Metadata database for tracking backup files */
class BackupMetadataDB extends Dexie {
  backupFiles!: EntityTable<BackupFileMetadata, 'id'>;
  backupData!: EntityTable<BackupDataRecord, 'id'>;

  constructor() {
    super('BibleMarkerBackupMetadata');
    
    this.version(1).stores({
      backupFiles: 'id, timestamp',
      backupData: 'id',
    });
  }
}

const metadataDb = new BackupMetadataDB();

/** Default auto-backup configuration */
const DEFAULT_CONFIG: AutoBackupConfig = {
  enabled: true,
  intervalMinutes: 5,
  maxBackups: 10,
};

/** Get auto-backup configuration from preferences */
export async function getAutoBackupConfig(): Promise<AutoBackupConfig> {
  const prefs = await db.preferences.get('main');
  return prefs?.autoBackup || DEFAULT_CONFIG;
}

/** Update auto-backup configuration */
export async function updateAutoBackupConfig(config: Partial<AutoBackupConfig>): Promise<void> {
  const prefs = await db.preferences.get('main') || await getDefaultPreferences();
  const currentConfig = prefs.autoBackup || DEFAULT_CONFIG;
  const updatedConfig: AutoBackupConfig = { ...currentConfig, ...config };
  
  await db.preferences.update('main', {
    autoBackup: updatedConfig,
  });
}

/** Get default preferences (helper) */
async function getDefaultPreferences(): Promise<UserPreferences> {
  const { getPreferences } = await import('./db');
  return getPreferences();
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
  return `BibleMarker-auto-backup-${year}-${month}-${day}-${hours}${minutes}${seconds}.json`;
}

/**
 * Get backup directory path based on platform
 */
async function getBackupDirectory(): Promise<string | null> {
  if (isTauri()) {
    try {
      const { appDataDir } = await import('@tauri-apps/api/path');
      const { join } = await import('@tauri-apps/api/path');
      const baseDir = await appDataDir();
      const backupDir = await join(baseDir, 'backups');
      
      // Ensure directory exists
      const { exists, mkdir } = await import('@tauri-apps/plugin-fs');
      if (!(await exists(backupDir))) {
        await mkdir(backupDir, { recursive: true });
      }
      
      return backupDir;
    } catch (error) {
      console.error('[AutoBackup] Failed to get Tauri backup directory:', error);
      return null;
    }
  }
  
  if (isCapacitor()) {
    // For Capacitor, use Documents directory
    // This would need Capacitor Filesystem plugin
    console.warn('[AutoBackup] Capacitor backup directory not yet implemented');
    return null;
  }
  
  // Web: File System Access API requires user permission
  // We'll handle this differently - store files in IndexedDB as fallback
  return null;
}

/**
 * Get human-readable backup location description
 */
export async function getBackupLocation(): Promise<string> {
  if (isTauri()) {
    try {
      const backupDir = await getBackupDirectory();
      if (backupDir) {
        return backupDir;
      }
      return 'Unable to determine backup location';
    } catch {
      return 'Error getting backup location';
    }
  }
  
  if (isCapacitor()) {
    return 'Capacitor backup location not yet implemented';
  }
  
  // Web: stored in IndexedDB
  return 'IndexedDB (Browser storage)';
}

/**
 * Save backup to file (platform-specific)
 */
async function saveBackupToFile(backup: BackupData, filename: string): Promise<string | null> {
  const json = JSON.stringify(backup, null, 2);
  if (isTauri()) {
    try {
      const backupDir = await getBackupDirectory();
      if (!backupDir) {
        throw new Error('Failed to get backup directory');
      }
      
      const { join } = await import('@tauri-apps/api/path');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const filepath = await join(backupDir, filename);
      
      await writeTextFile(filepath, json);
      return filepath;
    } catch (error) {
      console.error('[AutoBackup] Failed to save backup file (Tauri):', error);
      return null;
    }
  }
  
  if (isCapacitor()) {
    // Capacitor implementation would go here
    console.warn('[AutoBackup] Capacitor file saving not yet implemented');
    return null;
  }
  
  // Web: Try File System Access API, fallback to IndexedDB
  if ('showDirectoryPicker' in window) {
    try {
      // For web, we'd need to request directory access
      // For now, fallback to IndexedDB storage
      console.warn('[AutoBackup] Web File System Access API requires user interaction - using IndexedDB fallback');
      return null;
    } catch (error) {
      console.error('[AutoBackup] Failed to save backup file (Web):', error);
      return null;
    }
  }
  
  // Fallback: Store in IndexedDB
  return null;
}

/**
 * Store backup data in IndexedDB as fallback (for web browsers)
 */
async function storeBackupInIndexedDB(backup: BackupData, metadataId: string): Promise<void> {
  try {
    // Store the actual backup data
    await metadataDb.backupData.put({
      id: metadataId,
      data: backup,
    });
  } catch (error) {
    console.error('[AutoBackup] Failed to store backup data in IndexedDB:', error);
    throw error;
  }
}

/**
 * Create backup data (reuses logic from backup.ts)
 */
async function createBackupData(): Promise<BackupData> {
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
    fiveWAndH,
    contrasts,
    timeExpressions,
    places,
    conclusions,
    interpretations,
    applications,
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
    db.fiveWAndH.toArray(),
    db.contrasts.toArray(),
    db.timeExpressions.toArray(),
    db.places.toArray(),
    db.conclusions.toArray(),
    db.interpretations.toArray(),
    db.applications.toArray(),
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
    const { primaryTranslationId: _, ...cleanedView } = view as MultiTranslationView & { primaryTranslationId?: string };
    return cleanedView;
  });

  // Prepare backup data
  const backup: BackupData = {
    version: __APP_VERSION__,
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
      fiveWAndH,
      contrasts,
      timeExpressions,
      places,
      conclusions,
      interpretations,
      applications,
    },
  };

  return backup;
}

/**
 * Rotate backup files - delete oldest backups beyond maxBackups limit
 */
async function rotateBackups(maxBackups: number): Promise<void> {
  const allBackups = await metadataDb.backupFiles
    .orderBy('timestamp')
    .reverse()
    .toArray();

  if (allBackups.length > maxBackups) {
    const backupsToDelete = allBackups.slice(maxBackups);
    
    for (const backup of backupsToDelete) {
      // Delete file if it exists (Tauri/Capacitor)
      if (backup.filepath && isTauri()) {
        try {
          const { remove } = await import('@tauri-apps/plugin-fs');
          await remove(backup.filepath);
        } catch (error) {
          console.warn(`[AutoBackup] Failed to delete backup file ${backup.filepath}:`, error);
        }
      }
      
      // Delete metadata and IndexedDB backup data
      await metadataDb.backupFiles.delete(backup.id);
      try {
        await metadataDb.backupData.delete(backup.id);
      } catch {
        // Ignore if doesn't exist
      }
    }
    
    console.log(`[AutoBackup] Rotated backups: deleted ${backupsToDelete.length} old backup(s), keeping ${maxBackups} most recent`);
  }
}

/**
 * Perform a single backup operation
 */
export async function performBackup(): Promise<BackupFileMetadata | null> {
  try {
    const config = await getAutoBackupConfig();
    if (!config.enabled) {
      return null;
    }

    console.log('[AutoBackup] Creating backup...');
    const backup = await createBackupData();
    const filename = generateBackupFilename();
    const json = JSON.stringify(backup);
    const size = new Blob([json]).size;

    // Try to save as file first
    let filepath: string | null = null;
    try {
      filepath = await saveBackupToFile(backup, filename);
    } catch (error) {
      console.warn('[AutoBackup] Failed to save as file, using IndexedDB fallback:', error);
    }

    // Create metadata first
    const metadata: BackupFileMetadata = {
      id: crypto.randomUUID(),
      filename,
      filepath: filepath || undefined,
      timestamp: new Date(),
      size,
    };

    // If file save failed (web browser), store in IndexedDB
    if (!filepath) {
      await storeBackupInIndexedDB(backup, metadata.id);
    }

    await metadataDb.backupFiles.put(metadata);
    console.log(`[AutoBackup] Backup created: ${filename} (${(size / 1024).toFixed(2)} KB)`);

    // Rotate backups
    await rotateBackups(config.maxBackups);

    return metadata;
  } catch (error) {
    console.error('[AutoBackup] Failed to create backup:', error);
    return null;
  }
}

/**
 * Get all stored backup metadata (sorted by timestamp, newest first)
 */
export async function getStoredBackups(): Promise<BackupFileMetadata[]> {
  try {
    return await metadataDb.backupFiles
      .orderBy('timestamp')
      .reverse()
      .toArray();
  } catch (error) {
    console.error('[AutoBackup] Failed to read backup metadata:', error);
    return [];
  }
}

/**
 * Get a specific backup by ID and load its data
 */
export async function getStoredBackup(id: string): Promise<BackupData | null> {
  try {
    const metadata = await metadataDb.backupFiles.get(id);
    if (!metadata) {
      return null;
    }

    // If filepath exists, read from file (Tauri/Capacitor)
    if (metadata.filepath && isTauri()) {
      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const json = await readTextFile(metadata.filepath);
        return JSON.parse(json) as BackupData;
      } catch (error) {
        console.error('[AutoBackup] Failed to read backup file:', error);
        // Fall through to IndexedDB
      }
    }

    // Read from IndexedDB fallback
    try {
      const stored = await metadataDb.backupData.get(id);
      return stored?.data || null;
    } catch (error) {
      console.error('[AutoBackup] Failed to read backup from IndexedDB:', error);
      return null;
    }
  } catch (error) {
    console.error('[AutoBackup] Failed to get backup:', error);
    return null;
  }
}

/**
 * Delete a stored backup
 */
export async function deleteStoredBackup(id: string): Promise<void> {
  const metadata = await metadataDb.backupFiles.get(id);
  if (!metadata) {
    return;
  }

  // Delete file if it exists
  if (metadata.filepath && isTauri()) {
    try {
      const { remove } = await import('@tauri-apps/plugin-fs');
      await remove(metadata.filepath);
    } catch (error) {
      console.warn(`[AutoBackup] Failed to delete backup file:`, error);
    }
  }

  // Delete metadata and IndexedDB data
  await metadataDb.backupFiles.delete(id);
  try {
    await metadataDb.backupData.delete(id);
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * Delete all stored backups
 */
export async function clearAllBackups(): Promise<void> {
  const backups = await metadataDb.backupFiles.toArray();
  
  // Delete all files
  for (const backup of backups) {
    if (backup.filepath && isTauri()) {
      try {
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(backup.filepath);
      } catch (err) {
        console.warn(`[AutoBackup] Failed to delete backup file:`, err);
      }
    }
  }
  
  // Clear metadata and data
  await metadataDb.backupFiles.clear();
  try {
    await metadataDb.backupData.clear();
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * Get total size of all backups
 */
export async function getTotalBackupSize(): Promise<number> {
  try {
    const backups = await metadataDb.backupFiles.toArray();
    return backups.reduce((total, backup) => total + backup.size, 0);
  } catch (error) {
    console.error('[AutoBackup] Failed to calculate backup size:', error);
    return 0;
  }
}

/**
 * Restore from the most recent auto-backup
 * Returns BackupData that can be used with restoreBackup()
 */
export async function restoreFromLatestBackup(): Promise<BackupData | null> {
  try {
    const backups = await getStoredBackups();
    if (backups.length === 0) {
      console.warn('[AutoBackup] No backups available to restore from');
      return null;
    }
    
    const latestBackup = backups[0];
    const backupData = await getStoredBackup(latestBackup.id);
    
    if (!backupData) {
      console.error('[AutoBackup] Failed to load backup data');
      return null;
    }
    
    console.log(`[AutoBackup] Restoring from backup: ${latestBackup.filename} (${new Date(latestBackup.timestamp).toLocaleString()})`);
    return backupData;
  } catch (error) {
    console.error('[AutoBackup] Failed to restore from backup:', error);
    return null;
  }
}

/** Auto-backup service instance */
class AutoBackupService {
  private intervalId: number | null = null;
  private isRunning: boolean = false;

  /** Start the auto-backup service */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[AutoBackup] Service is already running');
      return;
    }

    const config = await getAutoBackupConfig();
    if (!config.enabled) {
      console.log('[AutoBackup] Service disabled in preferences');
      return;
    }

    this.isRunning = true;
    const intervalMs = config.intervalMinutes * 60 * 1000;

    // Perform initial backup after a short delay (don't backup immediately on app start)
    setTimeout(() => {
      performBackup();
    }, 30000); // 30 seconds delay

    // Set up interval
    this.intervalId = window.setInterval(() => {
      performBackup();
    }, intervalMs);

    console.log(`[AutoBackup] Service started: backing up every ${config.intervalMinutes} minutes`);
  }

  /** Stop the auto-backup service */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[AutoBackup] Service stopped');
  }

  /** Restart the service (useful when config changes) */
  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  /** Check if service is running */
  isActive(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const autoBackupService = new AutoBackupService();

// Export type for UI components
export type StoredBackup = BackupFileMetadata;
