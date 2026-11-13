/**
 * Sync Engine — Change Journal over the HTTP sync backend
 *
 * Syncs data between devices via the HTTP sync backend.
 *
 * Architecture:
 * - Each device keeps its own local SQLite database
 * - Writes are recorded in a local change_log table
 * - Periodically, changes are flushed to journal blobs on the sync backend
 * - Each device reads other devices' journals and applies changes locally
 * - Conflict resolution: newest wins (by updated_at timestamp)
 */

import { HttpStorageBackend, type StorageBackend } from './storage-backend';
import { getSignedInAccount, clearLocalSession, isSyncError } from './sync-account';
import {
  getUnflushedChanges,
  markChangesFlushed,
  pruneChangeLog,
  getSyncWatermark,
  hasSyncWatermarks,
  setSyncWatermark,
  getSyncConfig,
  setSyncConfig,
  applyRemoteChange,
  sqliteExportAll,
  SYNCED_TABLES,
} from './sqlite-db';
import {
  SNAPSHOT_TABLE_KEYS,
  CAUGHT_UP_TABLES_CONFIG_KEY,
  TABLES_SYNCED_BEFORE_V12,
  camelToSnakeTable,
} from './table-registry';

// Re-exported so existing importers (snapshot-coverage.test) keep their
// `from './sync-engine'` path. The single source of truth is table-registry.
export { SNAPSHOT_TABLE_KEYS, camelToSnakeTable } from './table-registry';

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

/** Device metadata stored at {device_id}/meta.json */
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
export type SyncEngineState = 'idle' | 'syncing' | 'disabled' | 'error' | 'signed-out' | 'auth-expired';

export interface SyncEngineStatus {
  state: SyncEngineState;
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

/** Backoff intervals for repeated failures: 30s → 1m → 5m */
const BACKOFF_INTERVALS_MS = [30_000, 60_000, 300_000];

/** Compaction threshold: compact when journal files exceed this count per device */
const COMPACTION_THRESHOLD = 100;

/** A failed catch-up is retried after 1 minute, doubling per failure up to 1 hour. */
const CATCH_UP_RETRY_BASE_MS = 60_000;
const CATCH_UP_RETRY_MAX_MS = 3_600_000;

let backend: StorageBackend | null = null;
let deviceId: string = '';
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let consecutiveFailures = 0;
let catchUpFailures = 0;
let catchUpRetryAt = 0;
let onlineListener: (() => void) | null = null;
let currentStatus: SyncEngineStatus = {
  state: 'disabled',
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
 * HTTP is the only backend. Checks for a signed-in account and wires up
 * HttpStorageBackend when found; otherwise reports signed-out.
 */
export async function initSyncEngine(): Promise<void> {
  deviceId = await getLocalDeviceId();

  const accountId = await getSignedInAccount();
  if (accountId) {
    await activateHttpBackend({ snapshot: false });
  } else {
    notifyStatusChange({ state: 'signed-out', error: null });
  }
}

/**
 * Wire up the HTTP backend after a successful sign-in.
 * Called by sync.ts after verifySignInCode resolves.
 */
export async function configureHttpBackend(): Promise<void> {
  await activateHttpBackend({ snapshot: true });
}

/**
 * Activate the HTTP backend: tear down any prior backend/timer, start fresh
 * timers/listeners, optionally write an initial snapshot (sign-in only), then
 * run an initial sync. Shared by `initSyncEngine` and `configureHttpBackend`.
 */
async function activateHttpBackend({ snapshot }: { snapshot: boolean }): Promise<void> {
  stopFlushTimer();
  stopOnlineListener();
  inFlight = false;
  consecutiveFailures = 0;
  resetCatchUpBackoff();
  backend = new HttpStorageBackend();
  startFlushTimer();
  startOnlineListener();
  notifyStatusChange({ state: 'idle', error: null });
  if (snapshot) {
    try {
      await writeSnapshot();
    } catch (err) {
      console.error('[SyncEngine] Failed to write initial snapshot (non-fatal):', err);
    }
  }
  await sync();
}

/**
 * Disable sync (sign-out or account deletion). Leaves the engine in the
 * 'signed-out' state — same as a fresh launch with no account — so the UI keeps
 * offering a way to sign back in. ('disabled' is reserved for sync being gated
 * off entirely, e.g. dev/beta builds or the remote kill-switch.)
 */
export async function disableSync(): Promise<void> {
  stopFlushTimer();
  stopOnlineListener();
  inFlight = false;
  consecutiveFailures = 0;
  resetCatchUpBackoff();
  backend = null;
  notifyStatusChange({
    state: 'signed-out',
    connectedDevices: [],
    error: null,
  });
}

/**
 * Stop the sync engine (app shutdown).
 */
export async function stopSyncEngine(): Promise<void> {
  stopFlushTimer();
  stopOnlineListener();
  if (backend) {
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
  if (!backend) return;
  // Guard against overlapping runs from any caller (timer tick, initial sync,
  // manual "Sync Now", online event) — concurrent runs race journal flushes and
  // watermark writes. The guard lives here so it covers direct callers too.
  if (inFlight) return;
  inFlight = true;

  try {
    notifyStatusChange({ state: 'syncing' });

    // 1. Flush local changes to journal files
    await flushChanges();

    // 2. Pull and apply changes from other devices. Whether this device had any
    // sync history is read first: the pull itself creates watermarks.
    const hadSyncHistory = await hasSyncWatermarks();
    const pulled = await pullChanges();

    // 3. Replay synced tables this device did not know when it last synced
    const caughtUp = await catchUpNewTables(hadSyncHistory);
    const applied = pulled.applied + caughtUp.applied;
    const tables = new Set([...pulled.tables, ...caughtUp.tables]);

    // 4. Check if compaction is needed
    await maybeCompact();

    // 5. Update status
    consecutiveFailures = 0;
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
    // Auth error (session expired/revoked): clear token and stop — do not retry.
    // Match any 'auth'-kind error, not just 401, so a revoked-but-403 session
    // can't fall through to the generic branch and retry forever.
    if (isSyncError(error) && error.kind === 'auth') {
      backend = null;
      stopFlushTimer();
      stopOnlineListener();
      consecutiveFailures = 0;
      resetCatchUpBackoff();
      // Await so a failed token-clear is logged rather than silently leaving a
      // stale token that would 401 again on next launch.
      try {
        await clearLocalSession();
      } catch (clearErr) {
        console.error('[SyncEngine] Failed to clear session token after auth error:', clearErr);
      }
      notifyStatusChange({
        state: 'auth-expired',
        connectedDevices: [],
        error: 'Session expired — sign in again to resume sync',
      });
      return;
    }
    consecutiveFailures++;
    console.error('[SyncEngine] Sync failed:', error);
    notifyStatusChange({
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    inFlight = false;
  }
}

// ============================================================================
// Journal Writer
// ============================================================================

/**
 * Flush pending changes from change_log to a journal file in the sync folder.
 */
async function flushChanges(): Promise<void> {
  if (!backend) return;

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
  const filePath = `${deviceId}/${String(maxSeq).padStart(10, '0')}.json`;

  await backend.write(filePath, JSON.stringify(journal));

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
  if (!backend) return { applied: 0, tables: new Set() };

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
      if (isSyncError(error) && error.kind === 'auth') throw error; // 401 → propagate to sync()
      console.error(`[SyncEngine] Failed to pull from device ${remoteDevice}:`, error);
    }
  }

  return { applied: totalApplied, tables: allTables };
}

/**
 * Pull and apply changes from a single remote device.
 */
async function pullFromDevice(remoteDevice: string): Promise<PullResult> {
  if (!backend) return { applied: 0, tables: new Set() };

  // First check if there's a snapshot we should bootstrap from
  const watermark = await getSyncWatermark(remoteDevice);

  if (watermark === 0) {
    // New device — try to load from snapshot first
    const bootstrapped = await bootstrapFromSnapshot(remoteDevice);
    if (bootstrapped.applied > 0) {
      return bootstrapped;
    }
  }

  // List journal files and sort by name (seq order). A missing device folder
  // lists as empty, so no explicit existence check is needed.
  const entries = await backend.list(remoteDevice);
  const journalFiles = entries
    .filter(e => e.name.endsWith('.json') && e.name !== 'meta.json')
    .map(e => e.name)
    .sort();

  let applied = 0;
  const tables = new Set<string>();

  for (const fileName of journalFiles) {
    // Parse the seq from filename (e.g., "0000000050.json" → 50)
    const fileSeq = parseInt(fileName.replace('.json', ''), 10);
    if (isNaN(fileSeq) || fileSeq <= watermark) continue;

    try {
      const content = await backend.readText(`${remoteDevice}/${fileName}`);
      if (content === null) continue; // vanished since listing — retry next sync
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
      if (isSyncError(error) && error.kind === 'auth') throw error; // 401 → propagate up
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
  if (!backend) return;

  const exportData = await sqliteExportAll();

  // Get current max seq from change_log
  const seqRows = await sqlSelect<{ max_seq: number }>(
    'SELECT MAX(seq) as max_seq FROM change_log'
  );
  const maxSeq = seqRows[0]?.max_seq ?? 0;

  // Build the snapshot tables from SNAPSHOT_TABLE_KEYS so coverage of SYNCED_TABLES
  // stays enforceable by a single test (see snapshot-coverage.test.ts). Adding a synced
  // table without listing it here would silently drop it from snapshots/bootstrap.
  const tables: Record<string, unknown[]> = {};
  for (const key of SNAPSHOT_TABLE_KEYS) {
    tables[key] = exportData[key as keyof typeof exportData] as unknown[];
  }
  tables.preferences = exportData.preferences ? [exportData.preferences] : [];

  const snapshot: SnapshotFile = {
    version: 1,
    device: deviceId,
    atSeq: maxSeq,
    createdAt: new Date().toISOString(),
    tables,
  };

  const snapshotPath = `snapshots/${deviceId}_${maxSeq}.json`;
  await backend.write(snapshotPath, JSON.stringify(snapshot));

  await setSyncConfig('last_snapshot_seq', String(maxSeq));
  console.log(`[SyncEngine] Wrote snapshot at seq ${maxSeq}`);
}

/**
 * Snapshots are named `<deviceId>_<seq>.json` with an unpadded seq, so text
 * order is not seq order (`_95` sorts after `_120`). Always compare `seq`.
 */
function parseSnapshotName(name: string): { device: string; seq: number } | null {
  const match = /^(.+)_(\d+)\.json$/.exec(name);
  return match ? { device: match[1], seq: Number(match[2]) } : null;
}

/** The highest-seq snapshot per device, picked numerically. */
function latestSnapshotsByDevice(names: readonly string[]): Map<string, { name: string; seq: number }> {
  const latest = new Map<string, { name: string; seq: number }>();
  for (const name of names) {
    const parsed = parseSnapshotName(name);
    if (!parsed) continue;
    if (parsed.seq > (latest.get(parsed.device)?.seq ?? -1)) {
      latest.set(parsed.device, { name, seq: parsed.seq });
    }
  }
  return latest;
}

/** One change to apply through applyRemoteChange. */
interface PendingChange {
  table: string;
  id: string;
  op: 'upsert' | 'delete';
  data: unknown;
  ts: string;
  device: string;
}

/** A snapshot record as an upsert, with the id and timestamp bootstrap uses. */
function snapshotRecordChange(
  table: string,
  record: Record<string, unknown>,
  snapshot: SnapshotFile
): PendingChange {
  const updatedAt = (record.updatedAt as string) ?? snapshot.createdAt;
  return {
    table,
    id: (record.id as string) ?? 'main',
    op: 'upsert',
    data: record,
    ts: typeof updatedAt === 'string' ? updatedAt : new Date(updatedAt as number).toISOString(),
    device: snapshot.device,
  };
}

function applyPendingChange(change: PendingChange): Promise<boolean> {
  return applyRemoteChange(
    change.table,
    change.op,
    change.id,
    change.data ? JSON.stringify(change.data) : null,
    change.ts,
    change.device
  );
}

/** Apply one snapshot record as an upsert through the normal newest-wins path. */
function applySnapshotRecord(
  table: string,
  record: Record<string, unknown>,
  snapshot: SnapshotFile
): Promise<boolean> {
  return applyPendingChange(snapshotRecordChange(table, record, snapshot));
}

/**
 * Bootstrap local database from a remote device's snapshot.
 * Returns the number of records applied and which tables were updated.
 */
async function bootstrapFromSnapshot(remoteDevice: string): Promise<PullResult> {
  if (!backend) return { applied: 0, tables: new Set() };

  // Find the latest snapshot from this device (missing dir lists as empty)
  const entries = await backend.list('snapshots');
  const latest = latestSnapshotsByDevice(entries.map(e => e.name)).get(remoteDevice);

  if (!latest) return { applied: 0, tables: new Set() };

  const latestSnapshot = latest.name;

  try {
    const content = await backend.readText(`snapshots/${latestSnapshot}`);
    if (content === null) return { applied: 0, tables: new Set() };
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
        const wasApplied = await applySnapshotRecord(dbTableName, record, snapshot);

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
    if (isSyncError(error) && error.kind === 'auth') throw error; // 401 → propagate up
    console.error(`[SyncEngine] Failed to load snapshot ${latestSnapshot}:`, error);
    return { applied: 0, tables: new Set() };
  }
}

// ============================================================================
// Catch-up for newly known synced tables
// ============================================================================

/**
 * An older app version skips entries of synced tables it does not know yet and
 * still advances its watermark past them, and compaction may since have folded
 * them into a peer's snapshot. So the device records which synced tables it has
 * caught up on (seeded by the schema migration), and any synced table missing
 * from that set is replayed once. The replay gathers every peer's latest
 * snapshot and journal entries for those tables, keeps only the newest change
 * per row across all peers, and applies that through applyRemoteChange, so a
 * delete on one peer is not undone by an older upsert from another. Watermarks
 * are never touched, so nothing else is re-applied. A table is recorded only
 * after the whole replay succeeded; a failure leaves it unrecorded and the next
 * sync after a growing delay retries.
 */
async function catchUpNewTables(hadSyncHistory: boolean): Promise<PullResult> {
  const result: PullResult = { applied: 0, tables: new Set() };

  let recorded = parseCaughtUpTables(await getSyncConfig(CAUGHT_UP_TABLES_CONFIG_KEY));
  if (!recorded) {
    if (!hadSyncHistory) {
      // No sync history: nothing can have been skipped, so start tracking.
      await setSyncConfig(CAUGHT_UP_TABLES_CONFIG_KEY, JSON.stringify([...SYNCED_TABLES].sort()));
      return result;
    }
    // This device has synced before, so it may have skipped tables added since
    // the migration that seeds the record; assume it knew only the older ones.
    recorded = new Set(TABLES_SYNCED_BEFORE_V12);
  }

  const pending = new Set([...SYNCED_TABLES].filter((table) => !recorded.has(table)));
  if (pending.size === 0) return result;
  if (Date.now() < catchUpRetryAt) return result;

  try {
    await applyNewestChanges(await collectPendingChanges(pending), result);
    await setSyncConfig(
      CAUGHT_UP_TABLES_CONFIG_KEY,
      JSON.stringify([...new Set([...recorded, ...pending])].sort())
    );
    resetCatchUpBackoff();
    console.log(`[SyncEngine] Caught up on ${[...pending].join(', ')}`);
  } catch (error) {
    if (isSyncError(error) && error.kind === 'auth') throw error; // 401 → propagate to sync()
    catchUpFailures++;
    const delay = Math.min(CATCH_UP_RETRY_BASE_MS * 2 ** (catchUpFailures - 1), CATCH_UP_RETRY_MAX_MS);
    catchUpRetryAt = Date.now() + delay;
    console.error(`[SyncEngine] Catch-up on new synced tables failed, retrying in ${delay / 1000}s:`, error);
  }
  return result;
}

function resetCatchUpBackoff(): void {
  catchUpFailures = 0;
  catchUpRetryAt = 0;
}

function parseCaughtUpTables(raw: string | null): Set<string> | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((table) => typeof table === 'string')) {
      return new Set(parsed);
    }
  } catch {
    // Unparseable: treated like a missing value.
  }
  return null;
}

/**
 * Gather every peer's change for the `pending` tables, keeping per (table, row)
 * only the newest. Each peer's journals are read before the snapshots are
 * listed: a peer compacting in between has then already written the snapshot
 * that holds what its removed journals carried, whereas the other order could
 * miss rows in both places.
 */
async function collectPendingChanges(pending: ReadonlySet<string>): Promise<Map<string, PendingChange>> {
  const changes = new Map<string, PendingChange>();
  if (!backend) return changes;

  const folders = (await listDeviceFolders()).filter((peer) => peer !== deviceId);
  for (const peer of folders) await collectJournalChanges(peer, pending, changes);

  // A peer may have only a snapshot left (its folder gone after compaction).
  const latest = latestSnapshotsByDevice((await backend.list('snapshots')).map((e) => e.name));
  for (const [peer, { name }] of latest) {
    if (peer === deviceId || !DEVICE_ID_RE.test(peer)) continue;
    await collectSnapshotChanges(name, pending, changes);
  }
  return changes;
}

/** Keep `change` unless the row already has a newer one; on a tie a delete wins. */
function keepNewest(changes: Map<string, PendingChange>, change: PendingChange): void {
  // Table names hold no ':', so the key is unambiguous even for ids like "plan-1:1".
  const key = `${change.table}:${change.id}`;
  const current = changes.get(key);
  const newer =
    !current ||
    change.ts > current.ts ||
    (change.ts === current.ts && change.op === 'delete' && current.op !== 'delete');
  if (newer) changes.set(key, change);
}

async function collectSnapshotChanges(
  name: string,
  pending: ReadonlySet<string>,
  changes: Map<string, PendingChange>
): Promise<void> {
  if (!backend) return;

  const content = await backend.readText(`snapshots/${name}`);
  if (content === null) throw new Error(`Snapshot ${name} disappeared before it could be read`);

  let snapshot: SnapshotFile;
  try {
    snapshot = JSON.parse(content) as SnapshotFile;
  } catch (error) {
    console.error(`[SyncEngine] Skipping unreadable snapshot ${name}:`, error);
    return;
  }
  if (snapshot.version !== 1 || !snapshot.tables) return;

  for (const [key, records] of Object.entries(snapshot.tables)) {
    const table = camelToSnakeTable(key);
    if (!pending.has(table) || !Array.isArray(records)) continue;
    for (const record of records as Array<Record<string, unknown>>) {
      keepNewest(changes, snapshotRecordChange(table, record, snapshot));
    }
  }
}

/** Gather every journal file of `peer`, ignoring the watermark. */
async function collectJournalChanges(
  peer: string,
  pending: ReadonlySet<string>,
  changes: Map<string, PendingChange>
): Promise<void> {
  if (!backend) return;

  const files = (await backend.list(peer))
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.json') && name !== 'meta.json');

  for (const fileName of files) {
    const content = await backend.readText(`${peer}/${fileName}`);
    if (content === null) throw new Error(`Journal ${peer}/${fileName} disappeared before it could be read`);

    let journal: JournalFile;
    try {
      journal = JSON.parse(content) as JournalFile;
    } catch (error) {
      console.error(`[SyncEngine] Skipping unreadable journal ${peer}/${fileName}:`, error);
      continue;
    }
    if (journal.version !== 1 || !Array.isArray(journal.entries)) continue;

    for (const entry of journal.entries) {
      if (!pending.has(entry.table)) continue;
      if (entry.op !== 'upsert' && entry.op !== 'delete') continue;
      keepNewest(changes, {
        table: entry.table,
        id: entry.id,
        op: entry.op,
        data: entry.data,
        ts: entry.ts,
        device: entry.device,
      });
    }
  }
}

async function applyNewestChanges(changes: Map<string, PendingChange>, result: PullResult): Promise<void> {
  for (const change of changes.values()) {
    if (await applyPendingChange(change)) {
      result.applied++;
      result.tables.add(change.table);
    }
  }
}

// ============================================================================
// Compaction
// ============================================================================

/**
 * Check if compaction is needed and run it.
 */
async function maybeCompact(): Promise<void> {
  if (!backend) return;

  const entries = await backend.list(deviceId);
  const journalFiles = entries.filter(e => e.name.endsWith('.json') && e.name !== 'meta.json');

  if (journalFiles.length < COMPACTION_THRESHOLD) return;

  console.log(`[SyncEngine] Compacting (${journalFiles.length} journal files)...`);
  await compact();
}

/**
 * Compact: write a snapshot, then delete old journal files.
 */
async function compact(): Promise<void> {
  if (!backend) return;

  // Write a fresh snapshot
  await writeSnapshot();

  const lastSnapshotSeq = parseInt(await getSyncConfig('last_snapshot_seq') ?? '0', 10);
  if (lastSnapshotSeq === 0) return;

  // Delete journal files up to the snapshot seq
  const entries = await backend.list(deviceId);

  for (const entry of entries) {
    if (!entry.name.endsWith('.json') || entry.name === 'meta.json') continue;
    const fileSeq = parseInt(entry.name.replace('.json', ''), 10);
    if (!isNaN(fileSeq) && fileSeq <= lastSnapshotSeq) {
      await backend.remove(`${deviceId}/${entry.name}`);
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
  if (!backend) return;

  const names = (await backend.list('snapshots')).map(e => e.name);
  const latest = latestSnapshotsByDevice(names);

  for (const name of names) {
    const parsed = parseSnapshotName(name);
    if (!parsed || latest.get(parsed.device)?.name === name) continue;
    await backend.remove(`snapshots/${name}`);
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

async function writeDeviceMeta(lastSeq: number): Promise<void> {
  if (!backend) return;

  let createdAt = await getSyncConfig('device_created_at');
  if (!createdAt) {
    createdAt = new Date().toISOString();
    await setSyncConfig('device_created_at', createdAt);
  }

  const meta: DeviceMeta = {
    deviceId,
    deviceName: getDeviceName(),
    platform: getPlatformName(),
    lastSeq,
    createdAt,
    updatedAt: new Date().toISOString(),
  };

  await backend.write(`${deviceId}/meta.json`, JSON.stringify(meta, null, 2));
}

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function listDeviceFolders(): Promise<string[]> {
  if (!backend) return [];
  const entries = await backend.list('');
  return entries
    .filter(e => e.isDirectory && e.name !== 'snapshots')
    .map(e => e.name)
    .filter(name => DEVICE_ID_RE.test(name));
}

async function listConnectedDevices(): Promise<string[]> {
  if (!backend) return [];
  const folders = await listDeviceFolders();
  const names: string[] = [];

  for (const folder of folders) {
    if (folder === deviceId) continue;
    try {
      const content = await backend.readText(`${folder}/meta.json`);
      if (content === null) {
        names.push(folder);
        continue;
      }
      const meta = JSON.parse(content) as DeviceMeta;
      names.push(meta.deviceName || folder);
    } catch {
      names.push(folder);
    }
  }

  return names;
}

function startFlushTimer(): void {
  stopFlushTimer();
  const interval = consecutiveFailures > 0
    ? BACKOFF_INTERVALS_MS[Math.min(consecutiveFailures - 1, BACKOFF_INTERVALS_MS.length - 1)]
    : FLUSH_INTERVAL_MS;
  flushTimer = setTimeout(() => void scheduledSync(), interval);
}

async function scheduledSync(): Promise<void> {
  // sync() self-guards against overlap (early-returns if already in flight) and
  // resets backoff on success, so the next interval is computed correctly here.
  try {
    await sync();
  } catch (error) {
    console.error('[SyncEngine] Periodic sync failed:', error);
  } finally {
    if (backend) startFlushTimer();
  }
}

function stopFlushTimer(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function startOnlineListener(): void {
  stopOnlineListener();
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  // Route through scheduledSync so the inFlight guard is honored — calling sync()
  // raw here could double-fire alongside a timer tick.
  const handler = (): void => {
    if (backend) void scheduledSync();
  };
  window.addEventListener('online', handler);
  onlineListener = handler;
}

function stopOnlineListener(): void {
  if (onlineListener !== null && typeof window !== 'undefined') {
    window.removeEventListener('online', onlineListener);
    onlineListener = null;
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

