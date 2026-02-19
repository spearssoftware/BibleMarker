/**
 * Sync Status Indicator Component
 *
 * Displays sync status for journal-based cross-device sync.
 * Shows current sync state, connected devices, and allows manual sync.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  type SyncStatus,
  onSyncStatusChange,
  getSyncStatusMessage,
  getSyncStatusIcon,
  triggerSync,
} from '@/lib/sync';

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

  const getStatusColor = () => {
    switch (status.state) {
      case 'synced': return 'text-scripture-success';
      case 'syncing': return 'text-scripture-info';
      case 'offline': return 'text-scripture-warning';
      case 'error': return 'text-scripture-error';
      case 'unavailable': return 'text-scripture-muted';
      default: return 'text-scripture-muted';
    }
  };

  if (compact) {
    return (
      <>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`
            relative p-1 rounded hover:bg-white/10 transition-colors
            ${getStatusColor()}
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
            ${getStatusColor()}
            ${status.state === 'syncing' ? 'animate-spin' : ''}
          `}
        >
          {getSyncStatusIcon(status)}
        </span>
        <span className="text-sm text-gray-400">
          {getSyncStatusMessage(status)}
        </span>
      </div>

      {status.state !== 'syncing' && status.state !== 'unavailable' && (
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="
            px-2 py-1 text-xs rounded
            bg-white/5 hover:bg-white/10
            text-gray-300 hover:text-white
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="
        w-full max-w-md m-4 p-4 rounded-lg
        bg-gray-800 border border-gray-700
        shadow-xl
      ">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white">Sync</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="Close"
          >
            <span className="text-gray-400 hover:text-white">&times;</span>
          </button>
        </div>

        {/* Status */}
        <div className="mb-4 p-3 rounded bg-gray-900/50">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-lg ${getStatusColorClass(status.state)}`}>
              {getSyncStatusIcon(status)}
            </span>
            <span className="text-white font-medium">
              {getSyncStatusMessage(status)}
            </span>
          </div>
          {status.sync_folder && (
            <p className="text-xs text-gray-500 truncate" title={status.sync_folder}>
              Folder: {status.sync_folder}
            </p>
          )}
          {status.error && (
            <p className="mt-2 text-sm text-red-400">{status.error}</p>
          )}
        </div>

        {/* Connected devices */}
        {status.connected_devices.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-white mb-2">Connected Devices</h3>
            <div className="space-y-1">
              {status.connected_devices.map((device, i) => (
                <div key={i} className="text-sm text-gray-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-scripture-success" />
                  {device}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending changes */}
        {status.pending_changes > 0 && (
          <div className="mb-4 p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-400">
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
              bg-gray-700 hover:bg-gray-600
              text-gray-300 hover:text-white
              transition-colors
            "
          >
            Close
          </button>
          {status.state !== 'unavailable' && status.state !== 'disabled' && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="
                px-4 py-2 text-sm rounded
                bg-blue-600 hover:bg-blue-500
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
  );
}

function getStatusColorClass(state: SyncStatus['state']): string {
  switch (state) {
    case 'synced': return 'text-scripture-success';
    case 'syncing': return 'text-scripture-info';
    case 'offline': return 'text-scripture-warning';
    case 'error': return 'text-scripture-error';
    case 'unavailable': return 'text-scripture-muted';
    case 'disabled': return 'text-scripture-muted';
    default: return 'text-scripture-muted';
  }
}

export default SyncStatusIndicator;
