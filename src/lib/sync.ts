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
import { isApplePlatform } from './platform';
import {
  initSyncEngine,
  stopSyncEngine,
  sync as engineSync,
  configureSyncFolder,
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
export type SyncState = 'synced' | 'syncing' | 'offline' | 'error' | 'unavailable' | 'disabled';

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
export async function initializeSync(): Promise<void> {
  console.log('[Sync] Initializing sync system...');

  // Bridge engine status changes to our listeners
  onSyncEngineStatusChange(es => {
    notifySyncStatusChange(engineStatusToSyncStatus(es));
  });

  // Initialize the sync engine (loads saved config)
  await initSyncEngine();

  // If sync isn't configured yet (or folder went missing) and we're on Apple,
  // (re-)configure with iCloud. On iOS, the iCloud container may not be locally
  // materialized until URLForUbiquityContainerIdentifier is called, so
  // initSyncEngine's exists() check can return false on subsequent launches.
  const status = getSyncEngineStatus();
  if ((status.state === 'disabled' || status.state === 'no-folder') && isApplePlatform()) {
    try {
      const icloudSyncPath = await invoke<string>('get_sync_folder_path');
      console.log('[Sync] Auto-configuring iCloud sync folder:', icloudSyncPath);
      await configureSyncFolder(icloudSyncPath);
    } catch (error) {
      console.log('[Sync] iCloud not available, sync disabled:', error);
    }
  }

  console.log('[Sync] Sync system initialized, state:', getSyncEngineStatus().state);
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
    default: return '?';
  }
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
