/**
 * Sync Engine — File-Based Change Journal
 *
 * Syncs data between devices using small JSON journal files stored in a
 * cloud-synced folder (iCloud Drive, OneDrive, Dropbox, etc.).
 *
 * Architecture:
 * - Each device keeps its own local SQLite database
 * - Writes are recorded in a local change_log table
 * - Periodically, changes are flushed to journal files in the sync folder
 * - Each device reads other devices' journal files and applies changes locally
 * - Conflict resolution: newest wins (by updated_at timestamp)
 *
 * Folder structure:
 *   sync_folder/
 *     {device_id}/
 *       meta.json           — device info + last seq
 *       {max_seq}.json      — journal batch file
 *     snapshots/
 *       {device_id}_{seq}.json — full database snapshot
 */

import {
  readDir,
  readTextFile,
  mkdir,
  exists,
  remove,
} from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import {
  getUnflushedChanges,
  markChangesFlushed,
  pruneChangeLog,
  getSyncWatermark,
  setSyncWatermark,
  getSyncConfig,
  setSyncConfig,
  applyRemoteChange,
  sqliteExportAll,
  SYNCED_TABLES,
} from './sqlite-db';

// ============================================================================
// Types
// ============================================================================

/** A single change entry in a journal file */
export interface ChangeEntry {
  seq: number;
  ts: string;
  device: string;
  table: string;
  op: 'upsert' | 'delete';
  id: string;
  data?: unknown;
}

/** A journal batch file written by a device */
interface JournalFile {
  version: 1;
  device: string;
  entries: ChangeEntry[];
}

/** Device metadata stored in sync_folder/{device_id}/meta.json */
interface DeviceMeta {
  deviceId: string;
  deviceName: string;
  platform: string;
  lastSeq: number;
  createdAt: string;
  updatedAt: string;
}

/** A full database snapshot for bootstrapping new devices */
interface SnapshotFile {
  version: 1;
  device: string;
  atSeq: number;
  createdAt: string;
  tables: Record<string, unknown[]>;
}

/** Current state of the sync engine */
export type SyncEngineState = 'idle' | 'syncing' | 'disabled' | 'error' | 'no-folder';

export interface SyncEngineStatus {
  state: SyncEngineState;
  syncFolderPath: string | null;
  lastSyncTime: string | null;
  pendingChanges: number;
  connectedDevices: string[];
  error: string | null;
}

/** Listener for sync engine status changes */
type StatusListener = (status: SyncEngineStatus) => void;

// ============================================================================
// Sync Engine
// ============================================================================

/** Flush interval in milliseconds (30 seconds) */
const FLUSH_INTERVAL_MS = 30_000;

/** Compaction threshold: compact when journal files exceed this count per device */
const COMPACTION_THRESHOLD = 100;

let syncFolderPath: string | null = null;
let deviceId: string = '';
let flushTimer: ReturnType<typeof setInterval> | null = null;
let currentStatus: SyncEngineStatus = {
  state: 'disabled',
  syncFolderPath: null,
  lastSyncTime: null,
  pendingChanges: 0,
  connectedDevices: [],
  error: null,
};
const statusListeners = new Set<StatusListener>();

function notifyStatusChange(updates: Partial<SyncEngineStatus>): void {
  currentStatus = { ...currentStatus, ...updates };
  statusListeners.forEach(fn => {
    try { fn(currentStatus); } catch (e) { console.error('[SyncEngine] listener error:', e); }
  });
}

/**
 * Subscribe to sync engine status changes.
 * Returns an unsubscribe function.
 */
export function onSyncEngineStatusChange(listener: StatusListener): () => void {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => statusListeners.delete(listener);
}

/** Get current sync engine status */
export function getSyncEngineStatus(): SyncEngineStatus {
  return { ...currentStatus };
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the sync engine.
 * Loads config, sets up the device identity, and starts the flush timer.
 */
export async function initSyncEngine(): Promise<void> {
  // Load device ID from SQLite (not localStorage, which iCloud syncs across devices)
  deviceId = await getLocalDeviceId();

  // Load configured sync folder
  const savedPath = await getSyncConfig('sync_folder_path');
  const enabled = await getSyncConfig('sync_enabled');

  if (savedPath && enabled === 'true') {
    try {
      const folderExists = await exists(savedPath);
      if (folderExists) {
        syncFolderPath = savedPath;
        notifyStatusChange({
          state: 'idle',
          syncFolderPath: savedPath,
        });
        await ensureDeviceFolder();
        // Refresh meta.json on every startup so the device folder is non-empty
        // (iCloud won't sync empty folders) and other devices can see this device.
        try {
          const currentSeq = await getCurrentMaxSeq();
          await writeDeviceMeta(currentSeq);
        } catch (err) {
          console.error('[SyncEngine] Failed to write meta on init (non-fatal):', err);
        }
        startFlushTimer();
        // Do an initial sync
        await sync();
      } else {
        notifyStatusChange({
          state: 'no-folder',
          syncFolderPath: savedPath,
          error: 'Sync folder not found',
        });
      }
    } catch (error) {
      notifyStatusChange({
        state: 'error',
        error: `Failed to access sync folder: ${error}`,
      });
    }
  } else {
    notifyStatusChange({ state: 'disabled', syncFolderPath: null });
  }
}

/**
 * Configure the sync folder path and enable sync.
 */
export async function configureSyncFolder(folderPath: string): Promise<void> {
  // Ensure the folder exists
  const folderExists = await exists(folderPath);
  if (!folderExists) {
    await mkdir(folderPath, { recursive: true });
  }

  syncFolderPath = folderPath;
  await setSyncConfig('sync_folder_path', folderPath);
  await setSyncConfig('sync_enabled', 'true');

  await ensureDeviceFolder();
  // Write initial meta.json so the device folder is non-empty (iCloud won't sync empty folders)
  await writeDeviceMeta(0);
  startFlushTimer();

  notifyStatusChange({
    state: 'idle',
    syncFolderPath: folderPath,
    error: null,
  });

  // Initial sync: write snapshot so other devices can bootstrap.
  // Wrapped in try/catch — snapshot failure shouldn't block sync from running.
  try {
    await writeSnapshot();
  } catch (err) {
    console.error('[SyncEngine] Failed to write initial snapshot (non-fatal):', err);
  }
  await sync();
}

/**
 * Disable sync.
 */
export async function disableSync(): Promise<void> {
  stopFlushTimer();
  syncFolderPath = null;
  await setSyncConfig('sync_enabled', 'false');
  notifyStatusChange({
    state: 'disabled',
    syncFolderPath: null,
    connectedDevices: [],
    error: null,
  });
}

/**
 * Stop the sync engine (app shutdown).
 */
export async function stopSyncEngine(): Promise<void> {
  stopFlushTimer();
  // Flush any remaining changes before shutdown
  if (syncFolderPath) {
    try {
      await flushChanges();
    } catch (error) {
      console.error('[SyncEngine] Failed to flush on shutdown:', error);
    }
  }
}

// ============================================================================
// Sync Operations
// ============================================================================

/**
 * Run a full sync cycle: flush local changes, then pull remote changes.
 */
export async function sync(): Promise<void> {
  if (!syncFolderPath) return;

  try {
    notifyStatusChange({ state: 'syncing' });

    // 1. Flush local changes to journal files
    await flushChanges();

    // 2. Pull and apply changes from other devices
    const { applied, tables } = await pullChanges();

    // 3. Check if compaction is needed
    await maybeCompact();

    // 4. Update status
    const devices = await listConnectedDevices();
    notifyStatusChange({
      state: 'idle',
      lastSyncTime: new Date().toISOString(),
      pendingChanges: 0,
      connectedDevices: devices,
      error: null,
    });

    if (applied > 0) {
      console.log(`[SyncEngine] Applied ${applied} remote changes`);
      // Notify the app that data has changed
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('syncDataChanged', {
          detail: { applied, tables: Array.from(tables) },
        }));
      }
    }
  } catch (error) {
    console.error('[SyncEngine] Sync failed:', error);
    notifyStatusChange({
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Journal Writer
// ============================================================================

/**
 * Flush pending changes from change_log to a journal file in the sync folder.
 */
async function flushChanges(): Promise<void> {
  if (!syncFolderPath) return;

  const changes = await getUnflushedChanges();
  if (changes.length === 0) return;

  const entries: ChangeEntry[] = changes.map(c => ({
    seq: c.seq,
    ts: c.updated_at,
    device: c.device_id,
    table: c.table_name,
    op: c.op as 'upsert' | 'delete',
    id: c.row_id,
    data: c.data ? JSON.parse(c.data) : undefined,
  }));

  const maxSeq = changes[changes.length - 1].seq;

  const journal: JournalFile = {
    version: 1,
    device: deviceId,
    entries,
  };

  // Write journal file named by max seq
  const deviceFolder = `${syncFolderPath}/${deviceId}`;
  const filePath = `${deviceFolder}/${String(maxSeq).padStart(10, '0')}.json`;

  await invoke('write_sync_file', { path: filePath, content: JSON.stringify(journal) });

  // Mark changes as flushed in local DB
  await markChangesFlushed(maxSeq);

  // Update device meta
  await writeDeviceMeta(maxSeq);

  notifyStatusChange({ pendingChanges: 0 });
  console.log(`[SyncEngine] Flushed ${entries.length} changes to ${filePath}`);
}

// ============================================================================
// Journal Reader
// ============================================================================

/** Result of pulling changes from remote devices */
interface PullResult {
  applied: number;
  tables: Set<string>;
}

/**
 * Pull and apply changes from all other devices' journal files.
 * Returns the number of changes applied and which tables were updated.
 */
async function pullChanges(): Promise<PullResult> {
  if (!syncFolderPath) return { applied: 0, tables: new Set() };

  let totalApplied = 0;
  const allTables = new Set<string>();
  const deviceFolders = await listDeviceFolders();

  for (const remoteDevice of deviceFolders) {
    if (remoteDevice === deviceId) continue;

    try {
      const result = await pullFromDevice(remoteDevice);
      totalApplied += result.applied;
      result.tables.forEach((t) => allTables.add(t));
    } catch (error) {
      console.error(`[SyncEngine] Failed to pull from device ${remoteDevice}:`, error);
    }
  }

  return { applied: totalApplied, tables: allTables };
}

/**
 * Pull and apply changes from a single remote device.
 */
async function pullFromDevice(remoteDevice: string): Promise<PullResult> {
  if (!syncFolderPath) return { applied: 0, tables: new Set() };

  // First check if there's a snapshot we should bootstrap from
  const watermark = await getSyncWatermark(remoteDevice);

  if (watermark === 0) {
    // New device — try to load from snapshot first
    const bootstrapped = await bootstrapFromSnapshot(remoteDevice);
    if (bootstrapped.applied > 0) {
      return bootstrapped;
    }
  }

  const deviceFolder = `${syncFolderPath}/${remoteDevice}`;
  const folderExists = await exists(deviceFolder);
  if (!folderExists) return { applied: 0, tables: new Set() };

  // List journal files and sort by name (seq order)
  const entries = await readDir(deviceFolder);
  const journalFiles = entries
    .filter(e => e.name?.endsWith('.json') && e.name !== 'meta.json')
    .map(e => e.name!)
    .sort();

  let applied = 0;
  const tables = new Set<string>();

  for (const fileName of journalFiles) {
    // Parse the seq from filename (e.g., "0000000050.json" → 50)
    const fileSeq = parseInt(fileName.replace('.json', ''), 10);
    if (isNaN(fileSeq) || fileSeq <= watermark) continue;

    try {
      const content = await readTextFile(`${deviceFolder}/${fileName}`);
      const journal = JSON.parse(content) as JournalFile;

      if (journal.version !== 1) {
        console.warn(`[SyncEngine] Skipping unsupported journal version: ${journal.version}`);
        continue;
      }

      for (const entry of journal.entries) {
        if (entry.seq <= watermark) continue;
        if (!SYNCED_TABLES.has(entry.table)) continue;
        if (entry.op !== 'upsert' && entry.op !== 'delete') continue;

        const wasApplied = await applyRemoteChange(
          entry.table,
          entry.op,
          entry.id,
          entry.data ? JSON.stringify(entry.data) : null,
          entry.ts,
          entry.device
        );

        if (wasApplied) {
          applied++;
          tables.add(entry.table);
        }
      }

      // Update watermark after processing each file
      await setSyncWatermark(remoteDevice, fileSeq);
    } catch (error) {
      console.error(`[SyncEngine] Failed to process journal ${fileName}:`, error);
      // Skip corrupted/partial files, will retry on next sync
    }
  }

  return { applied, tables };
}

// ============================================================================
// Snapshots
// ============================================================================

/**
 * Write a full database snapshot for bootstrapping new devices.
 */
async function writeSnapshot(): Promise<void> {
  if (!syncFolderPath) return;

  const exportData = await sqliteExportAll();

  // Get current max seq from change_log
  const seqRows = await sqlSelect<{ max_seq: number }>(
    'SELECT MAX(seq) as max_seq FROM change_log'
  );
  const maxSeq = seqRows[0]?.max_seq ?? 0;

  const snapshot: SnapshotFile = {
    version: 1,
    device: deviceId,
    atSeq: maxSeq,
    createdAt: new Date().toISOString(),
    tables: {
      annotations: exportData.annotations,
      sectionHeadings: exportData.sectionHeadings,
      chapterTitles: exportData.chapterTitles,
      notes: exportData.notes,
      markingPresets: exportData.markingPresets,
      studies: exportData.studies,
      multiTranslationViews: exportData.multiTranslationViews,
      observationLists: exportData.observationLists,
      fiveWAndH: exportData.fiveWAndH,
      contrasts: exportData.contrasts,
      timeExpressions: exportData.timeExpressions,
      places: exportData.places,
      people: exportData.people,
      conclusions: exportData.conclusions,
      interpretations: exportData.interpretations,
      applications: exportData.applications,
      preferences: exportData.preferences ? [exportData.preferences] : [],
    },
  };

  const snapshotsDir = `${syncFolderPath}/snapshots`;
  if (!(await exists(snapshotsDir))) {
    await mkdir(snapshotsDir, { recursive: true });
  }

  const snapshotPath = `${snapshotsDir}/${deviceId}_${maxSeq}.json`;
  await invoke('write_sync_file', { path: snapshotPath, content: JSON.stringify(snapshot) });

  await setSyncConfig('last_snapshot_seq', String(maxSeq));
  console.log(`[SyncEngine] Wrote snapshot at seq ${maxSeq}`);
}

/**
 * Bootstrap local database from a remote device's snapshot.
 * Returns the number of records applied and which tables were updated.
 */
async function bootstrapFromSnapshot(remoteDevice: string): Promise<PullResult> {
  if (!syncFolderPath) return { applied: 0, tables: new Set() };

  const snapshotsDir = `${syncFolderPath}/snapshots`;
  if (!(await exists(snapshotsDir))) return { applied: 0, tables: new Set() };

  // Find the latest snapshot from this device
  const entries = await readDir(snapshotsDir);
  const deviceSnapshots = entries
    .filter(e => e.name?.startsWith(`${remoteDevice}_`) && e.name?.endsWith('.json'))
    .map(e => e.name!)
    .sort()
    .reverse();

  if (deviceSnapshots.length === 0) return { applied: 0, tables: new Set() };

  const latestSnapshot = deviceSnapshots[0];

  try {
    const content = await readTextFile(`${snapshotsDir}/${latestSnapshot}`);
    const snapshot = JSON.parse(content) as SnapshotFile;

    if (snapshot.version !== 1) return { applied: 0, tables: new Set() };

    let applied = 0;
    const tables = new Set<string>();

    // Apply each table's data
    for (const [tableName, records] of Object.entries(snapshot.tables)) {
      // Map camelCase table names to snake_case
      const dbTableName = camelToSnakeTable(tableName);
      if (!SYNCED_TABLES.has(dbTableName)) continue;

      for (const record of records as Array<Record<string, unknown>>) {
        const recordId = (record.id as string) ?? 'main';
        const updatedAt = (record.updatedAt as string) ?? snapshot.createdAt;

        const wasApplied = await applyRemoteChange(
          dbTableName,
          'upsert',
          recordId,
          JSON.stringify(record),
          typeof updatedAt === 'string' ? updatedAt : new Date(updatedAt as number).toISOString(),
          snapshot.device
        );

        if (wasApplied) {
          applied++;
          tables.add(dbTableName);
        }
      }
    }

    // Set watermark to the snapshot's seq
    await setSyncWatermark(remoteDevice, snapshot.atSeq);

    console.log(`[SyncEngine] Bootstrapped ${applied} records from ${remoteDevice} snapshot`);
    return { applied, tables };
  } catch (error) {
    console.error(`[SyncEngine] Failed to load snapshot ${latestSnapshot}:`, error);
    return { applied: 0, tables: new Set() };
  }
}

// ============================================================================
// Compaction
// ============================================================================

/**
 * Check if compaction is needed and run it.
 */
async function maybeCompact(): Promise<void> {
  if (!syncFolderPath) return;

  const deviceFolder = `${syncFolderPath}/${deviceId}`;
  const folderExists = await exists(deviceFolder);
  if (!folderExists) return;

  const entries = await readDir(deviceFolder);
  const journalFiles = entries.filter(e => e.name?.endsWith('.json') && e.name !== 'meta.json');

  if (journalFiles.length < COMPACTION_THRESHOLD) return;

  console.log(`[SyncEngine] Compacting (${journalFiles.length} journal files)...`);
  await compact();
}

/**
 * Compact: write a snapshot, then delete old journal files.
 */
async function compact(): Promise<void> {
  if (!syncFolderPath) return;

  // Write a fresh snapshot
  await writeSnapshot();

  const lastSnapshotSeq = parseInt(await getSyncConfig('last_snapshot_seq') ?? '0', 10);
  if (lastSnapshotSeq === 0) return;

  // Delete journal files up to the snapshot seq
  const deviceFolder = `${syncFolderPath}/${deviceId}`;
  const entries = await readDir(deviceFolder);

  for (const entry of entries) {
    if (!entry.name?.endsWith('.json') || entry.name === 'meta.json') continue;
    const fileSeq = parseInt(entry.name.replace('.json', ''), 10);
    if (!isNaN(fileSeq) && fileSeq <= lastSnapshotSeq) {
      try {
        await remove(`${deviceFolder}/${entry.name}`);
      } catch { /* ignore */ }
    }
  }

  // Prune local change_log too
  await pruneChangeLog(lastSnapshotSeq);

  // Clean up old snapshots (keep only latest per device)
  await cleanOldSnapshots();

  console.log(`[SyncEngine] Compaction done, pruned up to seq ${lastSnapshotSeq}`);
}

/**
 * Remove old snapshot files, keeping only the latest per device.
 */
async function cleanOldSnapshots(): Promise<void> {
  if (!syncFolderPath) return;

  const snapshotsDir = `${syncFolderPath}/snapshots`;
  if (!(await exists(snapshotsDir))) return;

  const entries = await readDir(snapshotsDir);
  const byDevice = new Map<string, string[]>();

  for (const entry of entries) {
    if (!entry.name?.endsWith('.json')) continue;
    const parts = entry.name.replace('.json', '').split('_');
    if (parts.length < 2) continue;
    const devId = parts.slice(0, -1).join('_');
    if (!byDevice.has(devId)) byDevice.set(devId, []);
    byDevice.get(devId)!.push(entry.name);
  }

  for (const [, files] of byDevice) {
    if (files.length <= 1) continue;
    files.sort();
    // Delete all but the latest
    for (let i = 0; i < files.length - 1; i++) {
      try {
        await remove(`${snapshotsDir}/${files[i]}`);
      } catch { /* ignore */ }
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function getLocalDeviceId(): Promise<string> {
  const { getSqliteDb, getDeviceId } = await import('./sqlite-db');
  await getSqliteDb(); // ensure DB is initialized and cachedDeviceId is set
  return getDeviceId();
}

function getDeviceName(): string {
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Android/.test(ua)) return 'Android';
  }
  return 'Unknown Device';
}

function getPlatformName(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Mac/.test(ua)) return 'macos';
  if (/Windows/.test(ua)) return 'windows';
  if (/Android/.test(ua)) return 'android';
  return 'unknown';
}

async function ensureDeviceFolder(): Promise<void> {
  if (!syncFolderPath) return;
  const folder = `${syncFolderPath}/${deviceId}`;
  if (!(await exists(folder))) {
    await mkdir(folder, { recursive: true });
  }
}

async function writeDeviceMeta(lastSeq: number): Promise<void> {
  if (!syncFolderPath) return;

  const meta: DeviceMeta = {
    deviceId,
    deviceName: getDeviceName(),
    platform: getPlatformName(),
    lastSeq,
    createdAt: (await getSyncConfig('device_created_at')) ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await invoke('write_sync_file', {
    path: `${syncFolderPath}/${deviceId}/meta.json`,
    content: JSON.stringify(meta, null, 2),
  });

  if (!meta.createdAt) {
    await setSyncConfig('device_created_at', meta.createdAt);
  }
}

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function listDeviceFolders(): Promise<string[]> {
  if (!syncFolderPath) return [];
  try {
    const entries = await readDir(syncFolderPath);
    return entries
      .filter(e => e.isDirectory && e.name !== 'snapshots')
      .map(e => e.name!)
      .filter(name => DEVICE_ID_RE.test(name));
  } catch {
    return [];
  }
}

async function listConnectedDevices(): Promise<string[]> {
  const folders = await listDeviceFolders();
  const names: string[] = [];

  for (const folder of folders) {
    if (folder === deviceId) continue;
    try {
      const metaPath = `${syncFolderPath}/${folder}/meta.json`;
      if (await exists(metaPath)) {
        const content = await readTextFile(metaPath);
        const meta = JSON.parse(content) as DeviceMeta;
        names.push(meta.deviceName || folder);
      } else {
        names.push(folder);
      }
    } catch {
      names.push(folder);
    }
  }

  return names;
}

/** Map camelCase export table names to snake_case DB table names */
function camelToSnakeTable(name: string): string {
  const map: Record<string, string> = {
    annotations: 'annotations',
    sectionHeadings: 'section_headings',
    chapterTitles: 'chapter_titles',
    notes: 'notes',
    markingPresets: 'marking_presets',
    studies: 'studies',
    multiTranslationViews: 'multi_translation_views',
    observationLists: 'observation_lists',
    fiveWAndH: 'five_w_and_h',
    contrasts: 'contrasts',
    timeExpressions: 'time_expressions',
    places: 'places',
    people: 'people',
    conclusions: 'conclusions',
    interpretations: 'interpretations',
    applications: 'applications',
    preferences: 'preferences',
  };
  return map[name] ?? name;
}

function startFlushTimer(): void {
  stopFlushTimer();
  flushTimer = setInterval(async () => {
    try {
      await sync();
    } catch (error) {
      console.error('[SyncEngine] Periodic sync failed:', error);
    }
  }, FLUSH_INTERVAL_MS);
}

function stopFlushTimer(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

// ============================================================================
// Exports for use by sqlite-db (avoiding circular dependency)
// ============================================================================

/**
 * Direct SQL select (re-exported to avoid circular import).
 * Used internally by writeSnapshot.
 */
async function sqlSelect<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const { getSqliteDb } = await import('./sqlite-db');
  const db = await getSqliteDb();
  return db.select<T[]>(sql, params);
}

async function getCurrentMaxSeq(): Promise<number> {
  try {
    const rows = await sqlSelect<{ max_seq: number }>(
      'SELECT MAX(seq) as max_seq FROM change_log'
    );
    return rows[0]?.max_seq ?? 0;
  } catch {
    return 0;
  }
}
