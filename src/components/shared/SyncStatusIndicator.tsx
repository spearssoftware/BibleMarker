/**
 * Sync Status Indicator Component
 *
 * Displays cross-device sync status: current state, connected devices, and a
 * manual sync trigger. Compact mode renders an icon for the toolbar that opens
 * a details popover (anchored under the bar, matching the other toolbar panels).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  type SyncStatus,
  onSyncStatusChange,
  getSyncStatusMessage,
  getSyncStatusIcon,
  triggerSync,
} from '@/lib/sync';
import { usePanelStore } from '@/stores/panelStore';
import { ModalBackdrop } from './ModalBackdrop';
import { Z_INDEX } from '@/lib/modalConstants';

interface SyncStatusIndicatorProps {
  /** Show in compact mode (icon only) */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Sync status indicator for the UI.
 * Renders nothing if sync is disabled.
 */
export function SyncStatusIndicator({
  compact = false,
  className = '',
}: SyncStatusIndicatorProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Subscribe to sync status changes
  useEffect(() => {
    const unsubscribe = onSyncStatusChange(setStatus);
    return unsubscribe;
  }, []);

  // Handle manual sync
  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await triggerSync();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Don't render if sync is disabled or no status
  if (!status || status.state === 'disabled') {
    return null;
  }

  const canSyncNow = canManuallySync(status.state);

  if (compact) {
    return (
      <>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`
            relative transition-colors
            ${getStatusColorClass(status.state)}
            ${className}
          `}
          title={getSyncStatusMessage(status)}
          aria-label="Sync status"
        >
          <span className={`text-lg ${status.state === 'syncing' ? 'animate-spin' : ''}`}>
            {getSyncStatusIcon(status)}
          </span>
        </button>
        {showDetails && (
          <SyncDetailsPanel
            status={status}
            onClose={() => setShowDetails(false)}
            onSync={handleSync}
            isSyncing={isSyncing}
          />
        )}
      </>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1.5">
        <span
          className={`
            text-lg
            ${getStatusColorClass(status.state)}
            ${status.state === 'syncing' ? 'animate-spin' : ''}
          `}
        >
          {getSyncStatusIcon(status)}
        </span>
        <span className="text-sm text-scripture-muted">
          {getSyncStatusMessage(status)}
        </span>
      </div>

      {status.state !== 'syncing' && canSyncNow && (
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="
            px-2 py-1 text-xs rounded
            bg-white/5 hover:bg-white/10
            text-scripture-muted hover:text-scripture-text
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
          aria-label="Sync now"
        >
          Sync Now
        </button>
      )}

      {showDetails && (
        <SyncDetailsPanel
          status={status}
          onClose={() => setShowDetails(false)}
          onSync={handleSync}
          isSyncing={isSyncing}
        />
      )}
    </div>
  );
}

interface SyncDetailsPanelProps {
  status: SyncStatus;
  onClose: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

function SyncDetailsPanel({
  status,
  onClose,
  onSync,
  isSyncing,
}: SyncDetailsPanelProps) {
  return (
    <>
      <ModalBackdrop onClick={onClose} zIndex={Z_INDEX.BACKDROP} />

      <div
        className="fixed top-[60px] left-4 right-4 sm:left-auto sm:right-4 sm:w-[22rem]
                   bg-scripture-surface rounded-2xl shadow-modal dark:shadow-modal-dark animate-slide-down
                   max-h-[80vh] overflow-y-auto custom-scrollbar mt-safe-top"
        style={{ zIndex: Z_INDEX.MODAL }}
        role="dialog"
        aria-modal="true"
        aria-label="Sync status"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-scripture-border/30">
          <h2 className="text-lg font-semibold text-scripture-text">Sync</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full hover:bg-scripture-elevated transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-scripture-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
        {/* Status */}
        <div className="mb-4 p-3 rounded bg-scripture-bg/50">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-lg ${getStatusColorClass(status.state)}`}>
              {getSyncStatusIcon(status)}
            </span>
            <span className="text-scripture-text font-medium">
              {getSyncStatusMessage(status)}
            </span>
          </div>
          {status.error && (
            <p className="mt-2 text-sm text-scripture-error">{status.error}</p>
          )}
        </div>

        {/* Connected devices */}
        {status.connected_devices.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-scripture-text mb-2">Connected Devices</h3>
            <div className="space-y-1">
              {status.connected_devices.map((device, i) => (
                <div key={i} className="text-sm text-scripture-muted flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-scripture-success" />
                  {device}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending changes */}
        {status.pending_changes > 0 && (
          <div className="mb-4 p-3 rounded bg-scripture-warning/10 border border-scripture-warning/20">
            <p className="text-sm text-scripture-warning">
              {status.pending_changes} change{status.pending_changes !== 1 ? 's' : ''} pending sync
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="
              px-4 py-2 text-sm rounded
              bg-scripture-elevated hover:bg-scripture-border
              text-scripture-muted hover:text-scripture-text
              transition-colors
            "
          >
            Close
          </button>
          {(status.state === 'signed-out' || status.state === 'auth-expired') && (
            <button
              onClick={() => {
                usePanelStore.getState().openPanel('settings', { settingsInitialTab: 'data' });
                onClose();
              }}
              className="
                px-4 py-2 text-sm rounded
                bg-scripture-accent hover:bg-scripture-accent/80
                text-white
                transition-colors
              "
            >
              Sign in
            </button>
          )}
          {canManuallySync(status.state) && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="
                px-4 py-2 text-sm rounded
                bg-scripture-accent hover:bg-scripture-accent/80
                text-white
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
              "
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
        </div>
      </div>
    </>
  );
}

function getStatusColorClass(state: SyncStatus['state']): string {
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

/** States where a manual "Sync Now" makes sense (no account problem). */
function canManuallySync(state: SyncStatus['state']): boolean {
  return state !== 'signed-out' && state !== 'auth-expired';
}

export default SyncStatusIndicator;
