/**
 * iCloud Sync Module
 *
 * Handles sync status tracking, conflict resolution, and iCloud
 * integration for cross-device data synchronization on iOS/macOS.
 */

import { invoke } from '@tauri-apps/api/core';
import { isICloudAvailable } from './platform';

// ============================================================================
// Types
// ============================================================================

/** Sync state for UI display */
export type SyncState = 'synced' | 'syncing' | 'offline' | 'error' | 'unavailable';

/** iCloud availability status from Rust backend */
export interface ICloudStatus {
  available: boolean;
  container_path: string | null;
  error: string | null;
}

/** Sync status from Rust backend */
export interface SyncStatus {
  state: SyncState;
  last_sync: string | null;
  pending_changes: number;
  error: string | null;
}

/** Conflict resolution strategy */
export type ConflictStrategy = 'local-wins' | 'remote-wins' | 'newest-wins' | 'manual';

/** Conflict record for manual resolution */
export interface SyncConflict {
  id: string;
  tableName: string;
  localRecord: unknown;
  remoteRecord: unknown;
  localUpdatedAt: Date;
  remoteUpdatedAt: Date;
  resolved: boolean;
  resolution?: 'local' | 'remote' | 'merged';
}

// ============================================================================
// Sync State Management
// ============================================================================

/** Current sync status (cached for quick access) */
let currentSyncStatus: SyncStatus = {
  state: 'unavailable',
  last_sync: null,
  pending_changes: 0,
  error: null,
};

/** Listeners for sync status changes */
type SyncStatusListener = (status: SyncStatus) => void;
const syncStatusListeners: Set<SyncStatusListener> = new Set();

/**
 * Subscribe to sync status changes
 */
export function onSyncStatusChange(listener: SyncStatusListener): () => void {
  syncStatusListeners.add(listener);
  // Immediately call with current status
  listener(currentSyncStatus);
  // Return unsubscribe function
  return () => syncStatusListeners.delete(listener);
}

/**
 * Notify all listeners of status change
 */
function notifySyncStatusChange(status: SyncStatus): void {
  currentSyncStatus = status;
  syncStatusListeners.forEach((listener) => {
    try {
      listener(status);
    } catch (error) {
      console.error('[Sync] Error in status listener:', error);
    }
  });
}

// ============================================================================
// iCloud Integration
// ============================================================================

/**
 * Check if iCloud is available
 */
export async function checkICloudStatus(): Promise<ICloudStatus> {
  console.log('[Sync] Checking iCloud status...');
  console.log('[Sync] isICloudAvailable():', isICloudAvailable());
  
  if (!isICloudAvailable()) {
    console.log('[Sync] iCloud not available (platform check failed)');
    return {
      available: false,
      container_path: null,
      error: 'iCloud is only available on macOS and iOS in Tauri apps',
    };
  }

  try {
    console.log('[Sync] Invoking check_icloud_status command...');
    const status = await invoke<ICloudStatus>('check_icloud_status');
    console.log('[Sync] iCloud status result:', status);
    return status;
  } catch (error) {
    console.error('[Sync] Error checking iCloud status:', error);
    return {
      available: false,
      container_path: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get the iCloud database path
 */
export async function getICloudDatabasePath(): Promise<string | null> {
  if (!isICloudAvailable()) {
    return null;
  }

  try {
    const path = await invoke<string>('get_icloud_database_path');
    return path;
  } catch (error) {
    console.error('[Sync] Error getting iCloud database path:', error);
    return null;
  }
}

/**
 * Get current sync status from backend
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  if (!isICloudAvailable()) {
    return {
      state: 'unavailable',
      last_sync: null,
      pending_changes: 0,
      error: 'iCloud sync not available on this platform',
    };
  }

  try {
    const status = await invoke<SyncStatus>('get_sync_status');
    notifySyncStatusChange(status);
    return status;
  } catch (error) {
    console.error('[Sync] Error getting sync status:', error);
    const errorStatus: SyncStatus = {
      state: 'error',
      last_sync: null,
      pending_changes: 0,
      error: error instanceof Error ? error.message : String(error),
    };
    notifySyncStatusChange(errorStatus);
    return errorStatus;
  }
}

// ============================================================================
// Conflict Resolution
// ============================================================================

/** Pending conflicts that need manual resolution */
const pendingConflicts: Map<string, SyncConflict> = new Map();

/**
 * Get all pending conflicts
 */
export function getPendingConflicts(): SyncConflict[] {
  return Array.from(pendingConflicts.values()).filter((c) => !c.resolved);
}

/**
 * Resolve a conflict
 */
export function resolveConflict(
  conflictId: string,
  resolution: 'local' | 'remote' | 'merged',
  mergedRecord?: unknown
): void {
  const conflict = pendingConflicts.get(conflictId);
  if (!conflict) {
    console.warn('[Sync] Conflict not found:', conflictId);
    return;
  }

  conflict.resolved = true;
  conflict.resolution = resolution;

  // Apply the resolution
  // TODO: Implement actual record update based on resolution
  console.log(`[Sync] Resolved conflict ${conflictId} with ${resolution}`, mergedRecord);
}

/**
 * Apply conflict resolution strategy
 */
export function resolveWithStrategy(
  local: { updatedAt: Date; data: unknown },
  remote: { updatedAt: Date; data: unknown },
  strategy: ConflictStrategy
): unknown {
  switch (strategy) {
    case 'local-wins':
      return local.data;
    case 'remote-wins':
      return remote.data;
    case 'newest-wins':
      return local.updatedAt > remote.updatedAt ? local.data : remote.data;
    case 'manual':
      // Return local for now, will be resolved manually
      return local.data;
    default:
      return local.data;
  }
}

// ============================================================================
// Sync Operations
// ============================================================================

/**
 * Trigger a manual sync
 *
 * For iCloud file-based sync, the actual synchronization happens automatically
 * when the database file in the iCloud container is modified. This function
 * refreshes the sync status from the backend to get the current state.
 */
export async function triggerSync(): Promise<boolean> {
  if (!isICloudAvailable()) {
    console.warn('[Sync] iCloud not available');
    return false;
  }

  try {
    notifySyncStatusChange({
      ...currentSyncStatus,
      state: 'syncing',
    });

    // For file-based iCloud sync, the sync happens automatically when the
    // database file is modified. Triggering a "sync" means we refresh the
    // status from the backend to see the current iCloud sync state.
    const status = await invoke<SyncStatus>('get_sync_status');
    
    // Clear pending changes when sync is successful
    if (status.state === 'synced') {
      notifySyncStatusChange({
        ...status,
        pending_changes: 0,
      });
    } else {
      notifySyncStatusChange(status);
    }

    return status.state === 'synced';
  } catch (error) {
    console.error('[Sync] Sync failed:', error);
    notifySyncStatusChange({
      state: 'error',
      last_sync: currentSyncStatus.last_sync,
      pending_changes: currentSyncStatus.pending_changes,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Mark a record as pending sync
 */
export function markPendingSync(): void {
  if (!isICloudAvailable()) return;

  notifySyncStatusChange({
    ...currentSyncStatus,
    pending_changes: currentSyncStatus.pending_changes + 1,
  });
}

/**
 * Clear pending sync count after successful sync
 */
export function clearPendingSync(): void {
  if (!isICloudAvailable()) return;

  notifySyncStatusChange({
    ...currentSyncStatus,
    pending_changes: 0,
  });
}

/**
 * Decrement pending sync count (e.g., when a single change is confirmed synced)
 */
export function decrementPendingSync(): void {
  if (!isICloudAvailable()) return;

  notifySyncStatusChange({
    ...currentSyncStatus,
    pending_changes: Math.max(0, currentSyncStatus.pending_changes - 1),
  });
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize sync system
 */
export async function initializeSync(): Promise<void> {
  console.log('[Sync] Initializing sync system...');

  // Check iCloud availability
  const icloudStatus = await checkICloudStatus();
  console.log('[Sync] iCloud status:', icloudStatus);

  if (icloudStatus.available) {
    // Get initial sync status
    await getSyncStatus();
    console.log('[Sync] Sync system initialized');
  } else {
    console.log('[Sync] iCloud not available:', icloudStatus.error);
    notifySyncStatusChange({
      state: 'unavailable',
      last_sync: null,
      pending_changes: 0,
      error: icloudStatus.error,
    });
  }
}

/**
 * Get human-readable sync status message
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
      return 'iCloud enabled';
    case 'syncing':
      return 'Syncing...';
    case 'offline':
      return `Offline (${status.pending_changes} pending)`;
    case 'error':
      return `Sync error: ${status.error || 'Unknown error'}`;
    case 'unavailable':
      return 'iCloud sync unavailable';
    default:
      return 'Unknown status';
  }
}

/**
 * Get sync status icon (for UI)
 */
export function getSyncStatusIcon(status: SyncStatus): string {
  switch (status.state) {
    case 'synced':
      return '✓';
    case 'syncing':
      return '↻';
    case 'offline':
      return '○';
    case 'error':
      return '⚠';
    case 'unavailable':
      return '−';
    default:
      return '?';
  }
}
