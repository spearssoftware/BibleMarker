/**
 * Sync Status Indicator Component
 *
 * Displays iCloud sync status for iOS/macOS users.
 * Shows current sync state, allows manual sync trigger, and
 * provides access to conflict resolution when needed.
 */

import { useState, useEffect, useCallback } from 'react';
import { isICloudAvailable } from '@/lib/platform';
import {
  type SyncStatus,
  onSyncStatusChange,
  getSyncStatusMessage,
  getSyncStatusIcon,
  triggerSync,
  getPendingConflicts,
} from '@/lib/sync';

interface SyncStatusIndicatorProps {
  /** Show in compact mode (icon only) */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Sync status indicator for the UI
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
    if (!isICloudAvailable()) return;

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

  // Don't render if iCloud not available
  if (!isICloudAvailable() || !status) {
    return null;
  }

  const conflicts = getPendingConflicts();
  const hasConflicts = conflicts.length > 0;

  // Get status color
  const getStatusColor = () => {
    switch (status.state) {
      case 'synced':
        return 'text-green-500';
      case 'syncing':
        return 'text-blue-500';
      case 'offline':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      case 'unavailable':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  };

  // Compact mode - just show icon
  if (compact) {
    return (
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
        {hasConflicts && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>
    );
  }

  // Full mode - show status and controls
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Status indicator */}
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

      {/* Sync button */}
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

      {/* Conflict indicator */}
      {hasConflicts && (
        <button
          onClick={() => setShowDetails(true)}
          className="
            px-2 py-1 text-xs rounded
            bg-red-500/20 hover:bg-red-500/30
            text-red-400 hover:text-red-300
            transition-colors
          "
        >
          {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
        </button>
      )}

      {/* Details panel */}
      {showDetails && (
        <SyncDetailsPanel
          status={status}
          conflicts={conflicts}
          onClose={() => setShowDetails(false)}
          onSync={handleSync}
          isSyncing={isSyncing}
        />
      )}
    </div>
  );
}

/**
 * Sync details panel component
 */
interface SyncDetailsPanelProps {
  status: SyncStatus;
  conflicts: ReturnType<typeof getPendingConflicts>;
  onClose: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

function SyncDetailsPanel({
  status,
  conflicts,
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
          <h2 className="text-lg font-medium text-white">iCloud Sync</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="Close"
          >
            <span className="text-gray-400 hover:text-white">×</span>
          </button>
        </div>

        {/* Status */}
        <div className="mb-4 p-3 rounded bg-gray-900/50">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-lg ${getStatusColorClass(status.state)}`}>
              {getSyncStatusIcon(status)}
            </span>
            <span className="text-white font-medium">
              {status.state.charAt(0).toUpperCase() + status.state.slice(1)}
            </span>
          </div>
          <p className="text-sm text-gray-400">
            {getSyncStatusMessage(status)}
          </p>
          {status.error && (
            <p className="mt-2 text-sm text-red-400">{status.error}</p>
          )}
        </div>

        {/* Pending changes */}
        {status.pending_changes > 0 && (
          <div className="mb-4 p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-400">
              {status.pending_changes} change{status.pending_changes !== 1 ? 's' : ''} pending sync
            </p>
          </div>
        )}

        {/* Conflicts */}
        {conflicts.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-white mb-2">Conflicts</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {conflicts.map((conflict) => (
                <div
                  key={conflict.id}
                  className="p-2 rounded bg-red-500/10 border border-red-500/20"
                >
                  <p className="text-sm text-red-400">
                    Conflict in {conflict.tableName}
                  </p>
                  <p className="text-xs text-gray-500">
                    Local: {conflict.localUpdatedAt.toLocaleString()}
                    {' • '}
                    Remote: {conflict.remoteUpdatedAt.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
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
          {status.state !== 'unavailable' && (
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

// Helper to get status color class
function getStatusColorClass(state: SyncStatus['state']): string {
  switch (state) {
    case 'synced':
      return 'text-green-500';
    case 'syncing':
      return 'text-blue-500';
    case 'offline':
      return 'text-yellow-500';
    case 'error':
      return 'text-red-500';
    case 'unavailable':
      return 'text-gray-400';
    default:
      return 'text-gray-400';
  }
}

export default SyncStatusIndicator;
