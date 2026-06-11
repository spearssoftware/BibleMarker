/**
 * Sync Module
 *
 * Public API for the sync system. Wraps the sync engine with
 * status management and platform-specific folder detection.
 *
 * The sync system uses a file-based change journal:
 * - Database is always stored locally (never in a cloud-synced directory)
 * - Small JSON journal files are written to a cloud-synced folder
 * - Each device reads other devices' journals and applies changes locally
 * - Works with any cloud storage: iCloud Drive, OneDrive, Dropbox, etc.
 */

import { invoke } from '@tauri-apps/api/core';
import { isApplePlatform, isIOS } from './platform';
import { getPreferences } from './database';
import { isFlagEnabled, FLAG_KEYS } from './feature-flags';
import {
  requestSignInCode as accountRequestCode,
  verifySignInCode as accountVerifyCode,
  signOut as accountSignOut,
} from './sync-account';
import {
  initSyncEngine,
  stopSyncEngine,
  sync as engineSync,
  configureSyncFolder,
  configureHttpBackend,
  disableSync as engineDisableSync,
  onSyncEngineStatusChange,
  getSyncEngineStatus,
  type SyncEngineStatus,
  type SyncEngineState,
} from './sync-engine';

// ============================================================================
// Types (kept compatible with existing SyncStatusIndicator)
// ============================================================================

/** Sync state for UI display */
export type SyncState = 'synced' | 'syncing' | 'offline' | 'error' | 'unavailable' | 'disabled' | 'signed-out' | 'auth-expired';

/** Sync status from the engine, shaped for the UI */
export interface SyncStatus {
  state: SyncState;
  last_sync: string | null;
  pending_changes: number;
  error: string | null;
  sync_folder: string | null;
  connected_devices: string[];
}

// ============================================================================
// State Management
// ============================================================================

let currentSyncStatus: SyncStatus = {
  state: 'disabled',
  last_sync: null,
  pending_changes: 0,
  error: null,
  sync_folder: null,
  connected_devices: [],
};

type SyncStatusListener = (status: SyncStatus) => void;
const syncStatusListeners: Set<SyncStatusListener> = new Set();

function mapEngineState(engineState: SyncEngineState): SyncState {
  switch (engineState) {
    case 'idle': return 'synced';
    case 'syncing': return 'syncing';
    case 'disabled': return 'disabled';
    case 'no-folder': return 'unavailable';
    case 'error': return 'error';
    case 'signed-out': return 'signed-out';
    case 'auth-expired': return 'auth-expired';
    default: return 'disabled';
  }
}

function engineStatusToSyncStatus(es: SyncEngineStatus): SyncStatus {
  return {
    state: mapEngineState(es.state),
    last_sync: es.lastSyncTime,
    pending_changes: es.pendingChanges,
    error: es.error,
    sync_folder: es.syncFolderPath,
    connected_devices: es.connectedDevices,
  };
}

function notifySyncStatusChange(status: SyncStatus): void {
  currentSyncStatus = status;
  syncStatusListeners.forEach(listener => {
    try { listener(status); } catch (e) { console.error('[Sync] listener error:', e); }
  });
}

/**
 * Subscribe to sync status changes.
 */
export function onSyncStatusChange(listener: SyncStatusListener): () => void {
  syncStatusListeners.add(listener);
  listener(currentSyncStatus);
  return () => syncStatusListeners.delete(listener);
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the sync system.
 * On Apple platforms, auto-detects iCloud Drive as the default sync folder.
 */
/**
 * Determine whether sync should run. Dev builds are gated off by default so
 * experimental code can't corrupt iCloud journals; the `forceSyncEnabled`
 * debug flag overrides this. Release builds always sync.
 */
async function isSyncAllowed(): Promise<{ allowed: boolean; reason?: string }> {
  const isDev = import.meta.env.DEV;

  if (isDev) {
    // `forceSyncEnabled` is an explicit developer override — it wins outright,
    // skipping the remote kill-switch so a global flag can't block local testing.
    try {
      const prefs = await getPreferences();
      if (prefs.debug?.forceSyncEnabled) {
        return { allowed: true, reason: 'force-enabled via debug flag' };
      }
    } catch (err) {
      console.warn('[Sync] Failed to read forceSyncEnabled flag:', err);
    }
    return { allowed: false, reason: 'dev build' };
  }

  // Remote kill-switch: reflect the server `sync-enabled` flag (read straight
  // from the SQLite cache so it works offline and before the store hydrates).
  // The worker is authoritative; this avoids hammering a disabled backend and
  // surfaces the disabled state in the UI.
  if (!(await isFlagEnabled(FLAG_KEYS.syncEnabled))) {
    return { allowed: false, reason: 'disabled by remote flag (sync-enabled)' };
  }

  return { allowed: true };
}

export async function initializeSync(): Promise<void> {
  const gate = await isSyncAllowed();
  if (!gate.allowed) {
    console.log(`[Sync] Disabled for ${gate.reason} — set debug.forceSyncEnabled to override`);
    notifySyncStatusChange({
      state: 'disabled',
      last_sync: null,
      pending_changes: 0,
      error: null,
      sync_folder: null,
      connected_devices: [],
    });
    return;
  }

  console.log('[Sync] Initializing sync system...');
  if (gate.reason) console.log(`[Sync] ${gate.reason}`);

  // Bridge engine status changes to our listeners
  onSyncEngineStatusChange(es => {
    notifySyncStatusChange(engineStatusToSyncStatus(es));
  });

  // Initialize the sync engine (loads saved config)
  await initSyncEngine();

  // iCloud auto-config only runs when the HTTP backend flag is off.
  // When the flag is on, initSyncEngine handles the HttpStorageBackend path.
  const useHttpBackend = await isFlagEnabled(FLAG_KEYS.httpBackend);
  if (!useHttpBackend) {
    // If sync isn't configured yet (or folder went missing) and we're on Apple,
    // (re-)configure with iCloud.
    const configured = await tryConfigureICloud();

    // On iOS first launch, the iCloud container may not be materialized yet.
    if (!configured && isIOS()) {
      console.log('[Sync] iCloud not ready on iOS, will retry in background...');
      retryICloudConfiguration();
    }
  }

  console.log('[Sync] Sync system initialized, state:', getSyncEngineStatus().state);
}

/**
 * Attempt to configure iCloud sync folder if on an Apple platform
 * and sync is not yet configured. Returns true if configured successfully.
 */
async function tryConfigureICloud(): Promise<boolean> {
  const status = getSyncEngineStatus();
  if ((status.state === 'disabled' || status.state === 'no-folder') && isApplePlatform()) {
    try {
      const icloudSyncPath = await invoke<string>('get_sync_folder_path');
      console.log('[Sync] Auto-configuring iCloud sync folder:', icloudSyncPath);
      await configureSyncFolder(icloudSyncPath);
      return true;
    } catch (error) {
      console.log('[Sync] iCloud not available, sync disabled:', error);
      return false;
    }
  }
  return status.state !== 'disabled' && status.state !== 'no-folder';
}

/**
 * Retry iCloud configuration with increasing delays.
 * On iOS, the first URLForUbiquityContainerIdentifier call triggers container
 * materialization. Subsequent calls may succeed once the OS finishes.
 */
function retryICloudConfiguration(): void {
  const delays = [3_000, 10_000]; // 3s, then 10s
  let attempt = 0;

  function scheduleRetry() {
    if (attempt >= delays.length) {
      console.log('[Sync] iCloud retry attempts exhausted, sync remains disabled');
      return;
    }
    const delay = delays[attempt];
    attempt++;
    setTimeout(async () => {
      console.log(`[Sync] iCloud retry attempt ${attempt}/${delays.length}...`);
      const configured = await tryConfigureICloud();
      if (configured) {
        console.log('[Sync] iCloud configured on retry');
      } else {
        scheduleRetry();
      }
    }, delay);
  }

  scheduleRetry();
}

/**
 * Shut down the sync system cleanly.
 */
export async function shutdownSync(): Promise<void> {
  await stopSyncEngine();
}

// ============================================================================
// Sync Operations
// ============================================================================

/**
 * Trigger a manual sync.
 */
export async function triggerSync(): Promise<boolean> {
  try {
    await engineSync();
    return true;
  } catch (error) {
    console.error('[Sync] Manual sync failed:', error);
    return false;
  }
}

/**
 * Configure sync with a specific folder path.
 */
export async function setupSyncFolder(folderPath: string): Promise<void> {
  await configureSyncFolder(folderPath);
}

/**
 * Disable sync entirely.
 */
export async function disableSync(): Promise<void> {
  await engineDisableSync();
}

/**
 * Get the current sync status.
 */
export function getSyncStatus(): SyncStatus {
  return { ...currentSyncStatus };
}

// ============================================================================
// UI Helpers
// ============================================================================

/**
 * Get human-readable sync status message.
 */
export function getSyncStatusMessage(status: SyncStatus): string {
  switch (status.state) {
    case 'synced':
      if (status.last_sync) {
        const lastSync = new Date(status.last_sync);
        const now = new Date();
        const diffMs = now.getTime() - lastSync.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Synced just now';
        if (diffMins < 60) return `Synced ${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Synced ${diffHours}h ago`;
        return `Synced ${Math.floor(diffHours / 24)}d ago`;
      }
      if (status.connected_devices.length > 0) {
        return `Syncing with ${status.connected_devices.length} device${status.connected_devices.length > 1 ? 's' : ''}`;
      }
      return 'Sync enabled';
    case 'syncing':
      return 'Syncing...';
    case 'offline':
      return `Offline (${status.pending_changes} pending)`;
    case 'error':
      return `Sync error: ${status.error || 'Unknown'}`;
    case 'unavailable':
      return 'Sync folder not found';
    case 'disabled':
      return 'Sync disabled';
    case 'signed-out':
      return 'Sign in to sync across devices';
    case 'auth-expired':
      return 'Session expired — sign in again';
    default:
      return 'Unknown status';
  }
}

/**
 * Get sync status icon.
 */
export function getSyncStatusIcon(status: SyncStatus): string {
  switch (status.state) {
    case 'synced': return '\u2713';
    case 'syncing': return '\u21BB';
    case 'offline': return '\u25CB';
    case 'error': return '\u26A0';
    case 'unavailable': return '\u2212';
    case 'disabled': return '\u2212';
    case 'signed-out': return '\u2192'; // \u2192
    case 'auth-expired': return '\u26a0'; // \u26a0
    default: return '?';
  }
}

// ============================================================================
// Account / Sign-in (HTTP backend only)
// ============================================================================

/**
 * Request a 6-digit sign-in code to be emailed to `email`.
 * Delegates to the Rust auth_request command.
 */
export async function requestSignInCode(email: string): Promise<void> {
  await accountRequestCode(email);
}

/**
 * Verify the emailed code. On success, wires up the HttpStorageBackend and
 * starts syncing. Returns the account ID.
 */
export async function signInWithCode(email: string, code: string): Promise<string> {
  const { accountId } = await accountVerifyCode(email, code);
  await configureHttpBackend();
  return accountId;
}

/**
 * Sign out: disable sync locally first, then revoke the server session.
 * Order matters — revoking the token before stopping the engine would let an
 * in-flight sync hit a 401 and flip the UI to 'auth-expired' instead of the
 * clean signed-out state.
 */
export async function signOut(): Promise<void> {
  await engineDisableSync();
  await accountSignOut();
}

// ============================================================================
// Deprecated — kept for backward compatibility, now no-ops
// ============================================================================

export function getPendingConflicts(): never[] {
  return [];
}

export function markPendingSync(): void {
  // No-op: changes are tracked automatically via change_log
}

export function clearPendingSync(): void {
  // No-op
}

export function decrementPendingSync(): void {
  // No-op
}
