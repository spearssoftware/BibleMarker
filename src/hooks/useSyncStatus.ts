/**
 * Headless sync state + presentation helpers, shared by SyncStatusIndicator and
 * the nav overflow menu. Kept out of the component file so the component module
 * only exports components (react-refresh / fast refresh).
 */

import { useState, useEffect, useCallback } from 'react';
import { type SyncStatus, onSyncStatusChange, triggerSync } from '@/lib/sync';

export interface UseSyncStatusResult {
  status: SyncStatus | null;
  isSyncing: boolean;
  handleSync: () => Promise<void>;
}

/** The current sync status plus a manual-sync trigger. */
export function useSyncStatus(): UseSyncStatusResult {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = onSyncStatusChange(setStatus);
    return unsubscribe;
  }, []);

  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await triggerSync();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  return { status, isSyncing, handleSync };
}

/** Tailwind text-color class for a sync state. */
export function getStatusColorClass(state: SyncStatus['state']): string {
  switch (state) {
    case 'synced': return 'text-scripture-success';
    case 'syncing': return 'text-scripture-info';
    case 'offline': return 'text-scripture-warning';
    case 'error': return 'text-scripture-error';
    case 'auth-expired': return 'text-scripture-warning';
    case 'disabled':
    case 'signed-out':
    default: return 'text-scripture-muted';
  }
}
