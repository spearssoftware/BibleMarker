/**
 * Backup and Restore Component
 * 
 * UI for exporting and importing user data backups.
 */

import { useState } from 'react';
import { exportBackup, importBackup, restoreBackup, validateBackup, getBackupPreview, type BackupData } from '@/lib/backup';

interface BackupRestoreProps {
  onClose: () => void;
}

type RestoreMode = 'replace' | 'merge' | 'selective';

const DATA_TYPE_LABELS: Record<string, string> = {
  preferences: 'Settings & Preferences',
  annotations: 'Annotations',
  sectionHeadings: 'Section Headings',
  chapterTitles: 'Chapter Titles',
  notes: 'Notes',
  markingPresets: 'Key Words',
  studies: 'Studies',
  multiTranslationViews: 'Multi-Translation Views',
  observationLists: 'Observation Lists',
  cachedChapters: 'Cached Bible Text',
};

export function BackupRestore({ onClose }: BackupRestoreProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [includeCache, setIncludeCache] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  
  const [importStep, setImportStep] = useState<'select' | 'preview' | 'restoring'>('select');
  const [backupPreview, setBackupPreview] = useState<BackupData | null>(null);
  const [previewCounts, setPreviewCounts] = useState<Record<string, number> | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('replace');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(false);

    try {
      await exportBackup(includeCache);
      setExportSuccess(true);
      setTimeout(() => {
        setExportSuccess(false);
      }, 3000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Failed to export backup');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportSelect = async () => {
    setIsImporting(true);
    setImportError(null);
    setRestoreSuccess(false);

    try {
      const backup = await importBackup();
      
      // Validate and get preview
      if (!validateBackup(backup)) {
        throw new Error('Invalid backup file format');
      }

      const counts = getBackupPreview(backup);
      setBackupPreview(backup);
      setPreviewCounts(counts);
      setImportStep('preview');
      
      // Pre-select all types for selective mode
      setSelectedTypes(new Set(Object.keys(counts)));
    } catch (error) {
      if (error instanceof Error && error.message === 'Import cancelled') {
        // User cancelled - don't show error
        return;
      }
      setImportError(error instanceof Error ? error.message : 'Failed to import backup');
    } finally {
      setIsImporting(false);
    }
  };

  const handleRestore = async () => {
    if (!backupPreview) return;

    setImportStep('restoring');
    setImportError(null);
    setRestoreSuccess(false);

    try {
      const typesToRestore = restoreMode === 'selective' 
        ? Array.from(selectedTypes)
        : undefined;

      await restoreBackup(backupPreview, restoreMode, typesToRestore);

      setRestoreSuccess(true);
      
      // Reload stores by dispatching events
      window.dispatchEvent(new CustomEvent('annotationsUpdated'));
      window.dispatchEvent(new Event('translationsUpdated'));
      
      // Close after a delay
      setTimeout(() => {
        onClose();
        // Reload page to ensure all stores are refreshed
        window.location.reload();
      }, 2000);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to restore backup');
      setImportStep('preview');
    }
  };

  const toggleDataType = (type: string) => {
    const newSelected = new Set(selectedTypes);
    if (newSelected.has(type)) {
      newSelected.delete(type);
    } else {
      newSelected.add(type);
    }
    setSelectedTypes(newSelected);
  };

  const handleCancelImport = () => {
    setImportStep('select');
    setBackupPreview(null);
    setPreviewCounts(null);
    setRestoreMode('replace');
    setSelectedTypes(new Set());
    setImportError(null);
  };

  return (
    <div className="bg-scripture-surface border border-scripture-border rounded-xl shadow-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-ui font-semibold text-scripture-text">Backup & Restore</h2>
        <button
          onClick={onClose}
          className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Export Section */}
      <div className="mb-8 bg-scripture-surface/50 border border-scripture-border/50 rounded-xl p-4">
        <h3 className="text-lg font-ui font-semibold text-scripture-text mb-4">Export Backup</h3>
        <p className="text-sm text-scripture-muted mb-4">
          Export all your study data to a JSON file. You can save it to your cloud folder (iCloud Drive, Google Drive, etc.) for automatic syncing.
        </p>

        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm text-scripture-text cursor-pointer">
            <input
              type="checkbox"
              checked={includeCache}
              onChange={(e) => setIncludeCache(e.target.checked)}
              className="w-4 h-4 rounded border-scripture-border text-scripture-accent focus:ring-scripture-accent"
            />
            <span>Include cached Bible text (may significantly increase file size)</span>
          </label>
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting}
          className="w-full px-4 py-3 bg-scripture-accent text-white rounded-lg hover:bg-scripture-accent/90 
                   disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 
                   font-ui font-medium shadow-md hover:shadow-lg flex items-center justify-center gap-2"
        >
          {isExporting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>Exporting...</span>
            </>
          ) : (
            <>
              <span>📥</span>
              <span>Export Backup</span>
            </>
          )}
        </button>

        {exportSuccess && (
          <div className="mt-3 p-3 bg-green-600/20 border border-green-600/30 rounded-lg text-green-400 text-sm">
            ✓ Backup exported successfully!
          </div>
        )}

        {exportError && (
          <div className="mt-3 p-3 bg-scripture-errorBg border border-scripture-error/30 rounded-lg text-scripture-errorText text-sm">
            ✗ {exportError}
          </div>
        )}
      </div>

      {/* Import Section */}
      <div className="bg-scripture-surface/50 border border-scripture-border/50 rounded-xl p-4">
        <h3 className="text-lg font-ui font-semibold text-scripture-text mb-4">Import/Restore Backup</h3>

        {importStep === 'select' && (
          <>
            <p className="text-sm text-scripture-muted mb-4">
              Restore your study data from a previously exported backup file.
            </p>

            <button
              onClick={handleImportSelect}
              disabled={isImporting}
              className="w-full px-4 py-3 bg-scripture-info text-white rounded-lg hover:bg-scripture-info/90 
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 
                       font-ui font-medium shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Selecting file...</span>
                </>
              ) : (
                <>
                  <span>📤</span>
                  <span>Import Backup</span>
                </>
              )}
            </button>

            {importError && (
              <div className="mt-3 p-3 bg-scripture-errorBg border border-scripture-error/30 rounded-lg text-scripture-errorText text-sm">
                ✗ {importError}
              </div>
            )}
          </>
        )}

        {importStep === 'preview' && backupPreview && previewCounts && (
          <div className="space-y-4">
            <div className="p-4 bg-scripture-surface border border-scripture-border/50 rounded-xl">
              <div className="text-sm text-scripture-muted mb-2">
                Backup created: {new Date(backupPreview.timestamp).toLocaleString()}
              </div>
              <div className="text-sm text-scripture-muted mb-4">
                App version: {backupPreview.version}
              </div>

              <div className="text-sm font-medium text-scripture-text mb-3">Data in backup:</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(previewCounts).map(([type, count]) => (
                  <div key={type} className="flex justify-between">
                    <span className="text-scripture-muted">{DATA_TYPE_LABELS[type] || type}:</span>
                    <span className="text-scripture-text font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
              <label className="block text-sm font-medium text-scripture-text mb-3">
                Restore Mode:
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-scripture-text cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    value="replace"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                    className="w-4 h-4 text-scripture-accent focus:ring-scripture-accent"
                  />
                  <span>
                    <strong>Full Restore</strong> - Replace all existing data with backup data
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm text-scripture-text cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    value="merge"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                    className="w-4 h-4 text-scripture-accent focus:ring-scripture-accent"
                  />
                  <span>
                    <strong>Merge</strong> - Add/update data without deleting existing items
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm text-scripture-text cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    value="selective"
                    checked={restoreMode === 'selective'}
                    onChange={() => setRestoreMode('selective')}
                    className="w-4 h-4 text-scripture-accent focus:ring-scripture-accent"
                  />
                  <span>
                    <strong>Selective Restore</strong> - Choose which data types to restore
                  </span>
                </label>
              </div>

              {restoreMode === 'selective' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-scripture-text mb-2">
                    Select data types to restore:
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar p-3 bg-scripture-elevated/50 rounded-lg border border-scripture-border/50">
                    {Object.keys(previewCounts).map((type) => (
                      <label key={type} className="flex items-center gap-2 text-sm text-scripture-text cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTypes.has(type)}
                          onChange={() => toggleDataType(type)}
                          className="w-4 h-4 rounded border-scripture-border text-scripture-accent focus:ring-scripture-accent"
                        />
                        <span>{DATA_TYPE_LABELS[type] || type} ({previewCounts[type]})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleRestore}
                  disabled={restoreMode === 'selective' && selectedTypes.size === 0}
                  className="flex-1 px-4 py-3 bg-scripture-warning text-white rounded-lg hover:bg-scripture-warning/90 
                           disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 
                           font-ui font-medium shadow-md hover:shadow-lg"
                >
                  {restoreMode === 'replace' 
                    ? '⚠️ Restore (Replace All Data)'
                    : restoreMode === 'merge'
                    ? '🔄 Merge Data'
                    : '✅ Restore Selected'}
                </button>
                <button
                  onClick={handleCancelImport}
                  className="px-4 py-3 bg-scripture-elevated text-scripture-text rounded-lg hover:bg-scripture-elevated/80 
                           transition-all duration-200 font-ui font-medium border border-scripture-border/30"
                >
                  Cancel
                </button>
              </div>

              {restoreMode === 'replace' && (
                <div className="mt-3 p-3 bg-scripture-warningBg border border-scripture-warning/30 rounded-lg text-scripture-warningText text-sm">
                  ⚠️ Warning: This will replace all your existing data. This action cannot be undone.
                </div>
              )}
            </div>
          </div>
        )}

        {importStep === 'restoring' && (
          <div className="text-center py-8">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-scripture-border border-t-scripture-accent rounded-full animate-spin"></div>
              <div className="text-lg font-medium text-scripture-text mb-2">Restoring backup...</div>
              <div className="text-sm text-scripture-muted">Please wait while your data is being restored.</div>
            </div>
          </div>
        )}

        {restoreSuccess && (
          <div className="mt-3 p-3 bg-green-600/20 border border-green-600/30 rounded-lg text-green-400 text-sm">
            ✓ Backup restored successfully! The page will reload shortly.
          </div>
        )}

        {importError && importStep !== 'restoring' && (
          <div className="mt-3 p-3 bg-scripture-errorBg border border-scripture-error/30 rounded-lg text-scripture-errorText text-sm">
            ✗ {importError}
          </div>
        )}
      </div>
    </div>
  );
}
