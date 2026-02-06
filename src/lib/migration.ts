/**
 * Database Migration Module
 *
 * Handles migration of data from IndexedDB (Dexie) to SQLite
 * when users upgrade from web to native app or when iCloud sync is enabled.
 */

import { isTauri } from './platform';

// Migration status stored in localStorage
const MIGRATION_KEY = 'biblemarker_migration_status';

export interface MigrationStatus {
  /** Whether migration from IndexedDB to SQLite has been completed */
  indexedDbToSqlite: boolean;
  /** Timestamp of last migration */
  lastMigration?: string;
  /** Version of migration performed */
  migrationVersion?: number;
  /** Any errors during migration */
  lastError?: string;
}

/**
 * Get current migration status
 */
export function getMigrationStatus(): MigrationStatus {
  if (typeof localStorage === 'undefined') {
    return { indexedDbToSqlite: false };
  }

  const stored = localStorage.getItem(MIGRATION_KEY);
  if (!stored) {
    return { indexedDbToSqlite: false };
  }

  try {
    return JSON.parse(stored);
  } catch {
    return { indexedDbToSqlite: false };
  }
}

/**
 * Update migration status
 */
function setMigrationStatus(status: Partial<MigrationStatus>): void {
  if (typeof localStorage === 'undefined') return;

  const current = getMigrationStatus();
  const updated = { ...current, ...status };
  localStorage.setItem(MIGRATION_KEY, JSON.stringify(updated));
}

/**
 * Check if IndexedDB has any data
 */
async function hasIndexedDbData(): Promise<boolean> {
  try {
    // Dynamic import to avoid loading Dexie when not needed
    const { db } = await import('./db');

    // Check if any of the main tables have data
    const annotationCount = await db.annotations.count();
    const presetCount = await db.markingPresets.count();
    const noteCount = await db.notes.count();
    const studyCount = await db.studies.count();

    return annotationCount > 0 || presetCount > 0 || noteCount > 0 || studyCount > 0;
  } catch (error) {
    console.warn('[Migration] Error checking IndexedDB:', error);
    return false;
  }
}

/**
 * Check if migration is needed
 * Migration is needed when:
 * 1. Running in Tauri (native app)
 * 2. IndexedDB has data
 * 3. Migration hasn't been completed
 */
export async function needsMigration(): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  const status = getMigrationStatus();
  if (status.indexedDbToSqlite) {
    return false;
  }

  return await hasIndexedDbData();
}

/**
 * Export all data from IndexedDB (Dexie)
 */
async function exportFromIndexedDb() {
  const { db, getPreferences } = await import('./db');

  return {
    annotations: await db.annotations.toArray(),
    sectionHeadings: await db.sectionHeadings.toArray(),
    chapterTitles: await db.chapterTitles.toArray(),
    notes: await db.notes.toArray(),
    markingPresets: await db.markingPresets.toArray(),
    studies: await db.studies.toArray(),
    multiTranslationViews: await db.multiTranslationViews.toArray(),
    observationLists: await db.observationLists.toArray(),
    fiveWAndH: await db.fiveWAndH.toArray(),
    contrasts: await db.contrasts.toArray(),
    timeExpressions: await db.timeExpressions.toArray(),
    places: await db.places.toArray(),
    conclusions: await db.conclusions.toArray(),
    interpretations: await db.interpretations.toArray(),
    applications: await db.applications.toArray(),
    preferences: await getPreferences(),
  };
}

/**
 * Import all data to SQLite
 */
async function importToSqlite(data: Awaited<ReturnType<typeof exportFromIndexedDb>>) {
  const sqlite = await import('./sqlite-db');

  await sqlite.sqliteImportAll(data);
}

/**
 * Perform migration from IndexedDB to SQLite
 *
 * @returns Migration result with success status and any errors
 */
export async function migrateIndexedDbToSqlite(): Promise<{
  success: boolean;
  recordCount: number;
  error?: string;
}> {
  console.log('[Migration] Starting IndexedDB to SQLite migration...');

  try {
    // Export all data from IndexedDB
    const data = await exportFromIndexedDb();

    // Count records
    const recordCount =
      data.annotations.length +
      data.sectionHeadings.length +
      data.chapterTitles.length +
      data.notes.length +
      data.markingPresets.length +
      data.studies.length +
      data.multiTranslationViews.length +
      data.observationLists.length +
      data.fiveWAndH.length +
      data.contrasts.length +
      data.timeExpressions.length +
      data.places.length +
      data.conclusions.length +
      data.interpretations.length +
      data.applications.length +
      (data.preferences ? 1 : 0);

    console.log(`[Migration] Exporting ${recordCount} records from IndexedDB...`);

    // Import to SQLite
    await importToSqlite(data);

    console.log('[Migration] Import to SQLite complete');

    // Update migration status
    setMigrationStatus({
      indexedDbToSqlite: true,
      lastMigration: new Date().toISOString(),
      migrationVersion: 1,
      lastError: undefined,
    });

    console.log('[Migration] Migration completed successfully');

    return { success: true, recordCount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Migration] Migration failed:', errorMessage);

    setMigrationStatus({
      lastError: errorMessage,
    });

    return { success: false, recordCount: 0, error: errorMessage };
  }
}

/**
 * Reset migration status (for debugging/testing)
 */
export function resetMigrationStatus(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(MIGRATION_KEY);
  }
}

/**
 * Initialize database with migration check
 *
 * This should be called when the app starts to:
 * 1. Check if migration is needed
 * 2. Perform migration if needed
 * 3. Initialize the appropriate database backend
 */
export async function initializeWithMigration(): Promise<{
  migrated: boolean;
  recordCount: number;
  error?: string;
}> {
  // Check if migration is needed
  const migrationNeeded = await needsMigration();

  if (migrationNeeded) {
    console.log('[Migration] Migration needed, starting...');
    const result = await migrateIndexedDbToSqlite();
    return {
      migrated: result.success,
      recordCount: result.recordCount,
      error: result.error,
    };
  }

  // Initialize database (will use appropriate backend based on platform)
  const { initDatabase } = await import('./database');
  await initDatabase();

  return { migrated: false, recordCount: 0 };
}

/**
 * Verify data integrity after migration
 *
 * Compares record counts between IndexedDB and SQLite
 */
export async function verifyMigration(): Promise<{
  valid: boolean;
  indexedDbCount: number;
  sqliteCount: number;
  differences: string[];
}> {
  const differences: string[] = [];

  try {
    // Get IndexedDB counts
    const { db } = await import('./db');
    const indexedDbCounts = {
      annotations: await db.annotations.count(),
      markingPresets: await db.markingPresets.count(),
      notes: await db.notes.count(),
      studies: await db.studies.count(),
      sectionHeadings: await db.sectionHeadings.count(),
      chapterTitles: await db.chapterTitles.count(),
    };

    // Get SQLite counts
    const sqlite = await import('./sqlite-db');
    const sqliteData = await sqlite.sqliteExportAll();
    const sqliteCounts = {
      annotations: sqliteData.annotations.length,
      markingPresets: sqliteData.markingPresets.length,
      notes: sqliteData.notes.length,
      studies: sqliteData.studies.length,
      sectionHeadings: sqliteData.sectionHeadings.length,
      chapterTitles: sqliteData.chapterTitles.length,
    };

    // Compare counts
    for (const [table, indexedDbCount] of Object.entries(indexedDbCounts)) {
      const sqliteCount = sqliteCounts[table as keyof typeof sqliteCounts];
      if (indexedDbCount !== sqliteCount) {
        differences.push(
          `${table}: IndexedDB=${indexedDbCount}, SQLite=${sqliteCount}`
        );
      }
    }

    const indexedDbTotal = Object.values(indexedDbCounts).reduce((a, b) => a + b, 0);
    const sqliteTotal = Object.values(sqliteCounts).reduce((a, b) => a + b, 0);

    return {
      valid: differences.length === 0,
      indexedDbCount: indexedDbTotal,
      sqliteCount: sqliteTotal,
      differences,
    };
  } catch (error) {
    console.error('[Migration] Verification failed:', error);
    return {
      valid: false,
      indexedDbCount: 0,
      sqliteCount: 0,
      differences: [error instanceof Error ? error.message : String(error)],
    };
  }
}
