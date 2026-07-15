/**
 * Backup & Sync settings tab — cloud sync account (email-OTP sign-in), sync
 * status/diagnostics, JSON data backup & restore, Markdown study export,
 * auto-backup config + stored-snapshot restore, and clear-data actions. Owns
 * its own sync-status subscription, signed-in-account refresh, and auto-backup
 * config/statistics loading; renders its own confirmation dialogs.
 */

import { useState, useEffect } from 'react';
import { toast } from '@/stores/toastStore';
import { confirmDialog } from '@/stores/confirmDialogStore';
import { useBibleStore } from '@/stores/bibleStore';
import { getBookById } from '@/types';
import { clearBookAnnotations, clearDatabase, getSyncDiagnostics, type SyncDiagnostics } from '@/lib/database';
import { exportBackup, importBackup, restoreBackup, validateBackup, getBackupPreview, type BackupData } from '@/lib/backup';
import {
  getAutoBackupConfig,
  updateAutoBackupConfig,
  getStoredBackups,
  getStoredBackup,
  getTotalBackupSize,
  autoBackupService,
  performBackup,
  getBackupLocation,
  type StoredBackup,
} from '@/lib/autoBackup';
import { Button, ConfirmationDialog, Input } from '@/components/shared';
import { BASE_INPUT_CLASSES } from '@/components/shared/Form';
import { resetAllStores } from '@/lib/storeReset';
import {
  onSyncStatusChange,
  getSyncStatusMessage,
  triggerSync,
  requestSignInCode,
  signInWithCode,
  signOut,
  deleteAccount,
  type SyncStatus,
} from '@/lib/sync';
import { getSignedInAccount, isSyncError } from '@/lib/sync-account';
import { isNetworkError, getNetworkErrorMessage } from '@/lib/offline';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { FLAG_KEYS } from '@/lib/feature-flags';

const PRIVACY_URL = 'https://biblemarker.app/privacy/';

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
  timeExpressions: 'Time Expressions',
  places: 'Places',
  conclusions: 'Conclusions',
  interpretations: 'Interpretations',
  applications: 'Applications',
  cachedChapters: 'Cached Bible Text',
};

export function DataSection() {
  const { currentBook, currentModuleId } = useBibleStore();

  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearBookConfirm, setShowClearBookConfirm] = useState(false);
  const [clearBookSuccess, setClearBookSuccess] = useState<string | null>(null);
  const [clearBookError, setClearBookError] = useState<string | null>(null);

  // Backup/Restore state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [includeCache, setIncludeCache] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | boolean>(false);

  const [importStep, setImportStep] = useState<'select' | 'preview' | 'restoring'>('select');
  const [backupPreview, setBackupPreview] = useState<BackupData | null>(null);
  const [previewCounts, setPreviewCounts] = useState<Record<string, number> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  // Sync status state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncDiagnostics, setSyncDiagnostics] = useState<SyncDiagnostics | null>(null);
  const [showSyncDiagnostics, setShowSyncDiagnostics] = useState(false);

  // Cloud sync sign-in state
  // OTP sign-in can be independently killed server-side; already-signed-in
  // users are unaffected (the gate only hides the new sign-in form).
  const isOtpEnabled = useFeatureFlagsStore(s => s.isEnabled(FLAG_KEYS.otpEnabled));
  const [signedInAccount, setSignedInAccount] = useState<string | null>(null);
  const [signInStep, setSignInStep] = useState<'email' | 'code'>('email');
  const [signInEmail, setSignInEmail] = useState('');
  const [signInCode, setSignInCode] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);

  // Auto-backup state
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [autoBackupInterval, setAutoBackupInterval] = useState(5);
  const [autoBackupMaxBackups, setAutoBackupMaxBackups] = useState(10);
  const [savingAutoBackup, setSavingAutoBackup] = useState(false);
  const [storedBackups, setStoredBackups] = useState<StoredBackup[]>([]);
  const [totalBackupSize, setTotalBackupSize] = useState(0);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupLocation, setBackupLocation] = useState<string>('');

  // Load auto-backup config + statistics, refreshed on an interval while open.
  useEffect(() => {
    let statsInterval: number | undefined;

    async function loadAutoBackup() {
      try {
        const autoBackupConfig = await getAutoBackupConfig();
        setAutoBackupEnabled(autoBackupConfig.enabled);
        setAutoBackupInterval(autoBackupConfig.intervalMinutes);
        setAutoBackupMaxBackups(autoBackupConfig.maxBackups);

        const loadBackupStats = async () => {
          const backups = await getStoredBackups();
          const totalSize = await getTotalBackupSize();
          const location = await getBackupLocation();
          setStoredBackups(backups);
          setTotalBackupSize(totalSize);
          setBackupLocation(location);
        };
        await loadBackupStats();

        // Refresh backup stats every 30 seconds while this tab is open
        statsInterval = window.setInterval(loadBackupStats, 30000);
      } catch (error) {
        console.error('Error loading auto-backup config:', error);
      }
    }
    loadAutoBackup();

    return () => {
      if (statsInterval !== undefined) {
        clearInterval(statsInterval);
      }
    };
  }, []);

  // Subscribe to sync status changes
  useEffect(() => {
    const unsubscribe = onSyncStatusChange(setSyncStatus);
    return unsubscribe;
  }, []);

  // Refresh the signed-in account on auth-expired edge (the engine cleared the token).
  // Sign-in/out handlers set it directly, so we don't re-hit the Rust command on every sync tick.
  const isAuthExpired = syncStatus?.state === 'auth-expired';
  useEffect(() => {
    getSignedInAccount().then(setSignedInAccount).catch(() => setSignedInAccount(null));
  }, [isAuthExpired]);

  async function handleRequestSignInCode() {
    if (!signInEmail.trim()) return;
    setSignInLoading(true);
    setSignInError(null);
    try {
      await requestSignInCode(signInEmail.trim());
      setSignInStep('code');
    } catch (e) {
      setSignInError(e instanceof Error ? e.message : 'Failed to send code. Please try again.');
    } finally {
      setSignInLoading(false);
    }
  }

  async function handleVerifySignInCode() {
    if (!signInCode.trim()) return;
    setSignInLoading(true);
    setSignInError(null);
    try {
      const accountId = await signInWithCode(signInEmail.trim(), signInCode.trim());
      setSignedInAccount(accountId);
      setSignInStep('email');
      setSignInEmail('');
      setSignInCode('');
      setSignInError(null);
    } catch (e) {
      setSignInError(e instanceof Error ? e.message : 'Invalid or expired code. Please try again.');
    } finally {
      setSignInLoading(false);
    }
  }

  async function handleSignOut() {
    setSignInLoading(true);
    try {
      await signOut();
      setSignedInAccount(null);
      setSignInStep('email');
    } catch (e) {
      console.error('[Settings] Sign out failed:', e);
    } finally {
      setSignInLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (signInLoading) return; // re-entry guard
    setShowDeleteAccountConfirm(false);
    setSignInLoading(true);
    setSignInError(null);
    try {
      await deleteAccount();
      setSignedInAccount(null);
      setSignInStep('email');
    } catch (e) {
      console.error('[Settings] Delete account failed:', e);
      if (isNetworkError(e)) {
        setSignInError(getNetworkErrorMessage(e)); // retryable — stay signed in
      } else if (isSyncError(e) && e.statusCode === 401) {
        // Session invalid (expired/revoked/swept): the delete was rejected, so
        // the account may still exist. sync.ts already dropped the dead token;
        // return to the sign-in card and tell the user the deletion did NOT
        // complete (deliberately not presented as a successful deletion).
        setSignedInAccount(null);
        setSignInStep('email');
        setSignInError('Your session expired before the account could be deleted. Sign in again to finish deleting it.');
      } else {
        setSignInError('Couldn’t delete account — please try again.');
      }
    } finally {
      setSignInLoading(false);
    }
  }

  /** Cloud-sync account card body — one of four mutually exclusive render modes. */
  function renderCloudSyncAccount() {
    if (signedInAccount) {
      return (
        <>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-scripture-success" />
            <span className="text-sm font-medium text-scripture-text">Signed in</span>
          </div>
          <p className="text-xs text-scripture-muted font-mono break-all">{signedInAccount}</p>
          {syncStatus?.connected_devices && syncStatus.connected_devices.length > 0 && (
            <p className="text-xs text-scripture-muted">
              <span className="font-medium">Devices:</span>{' '}
              {syncStatus.connected_devices.join(', ')}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={signInLoading} onClick={handleSignOut}>
              {signInLoading ? 'Signing out...' : 'Sign Out'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={signInLoading}
              onClick={() => setShowDeleteAccountConfirm(true)}
            >
              Delete Account
            </Button>
          </div>
          {signInError && <p className="text-xs text-scripture-error">{signInError}</p>}
        </>
      );
    }

    if (!isOtpEnabled) {
      return (
        <p className="text-sm text-scripture-muted">
          Cloud sign-in is temporarily unavailable. Please try again later.
        </p>
      );
    }

    if (signInStep === 'email') {
      return (
        <>
          <p className="text-sm text-scripture-muted">
            Sign in with your email to sync study data across devices. An 8-digit code will be sent to your inbox.
          </p>
          {syncStatus?.state === 'auth-expired' && (
            <p className="text-xs text-scripture-warning">
              Your session expired. Sign in again to resume syncing.
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="email"
              value={signInEmail}
              onChange={e => setSignInEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleRequestSignInCode()}
              placeholder="you@example.com"
              className={`${BASE_INPUT_CLASSES} flex-1 placeholder-scripture-muted`}
              disabled={signInLoading}
            />
            <Button
              variant="primary"
              size="sm"
              disabled={signInLoading || !signInEmail.trim()}
              onClick={() => void handleRequestSignInCode()}
            >
              {signInLoading ? 'Sending...' : 'Send Code'}
            </Button>
          </div>
          {signInError && <p className="text-xs text-scripture-error">{signInError}</p>}
          <p className="text-[10px] text-scripture-muted leading-tight">
            Creating an account stores your email and synced study data on our servers.{' '}
            See our{' '}
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-scripture-accent hover:underline"
              onClick={(e) => {
                e.preventDefault();
                import('@/lib/platform').then(({ openUrl }) => openUrl(PRIVACY_URL));
              }}
            >
              Privacy Policy
            </a>
            .
          </p>
        </>
      );
    }

    return (
      <>
        <p className="text-sm text-scripture-muted">
          Enter the 8-digit code sent to <span className="text-scripture-text">{signInEmail}</span>.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={8}
            value={signInCode}
            onChange={e => setSignInCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && void handleVerifySignInCode()}
            placeholder="12345678"
            className={`${BASE_INPUT_CLASSES} flex-1 placeholder-scripture-muted tracking-widest font-mono`}
            disabled={signInLoading}
          />
          <Button
            variant="primary"
            size="sm"
            disabled={signInLoading || signInCode.length !== 8}
            onClick={() => void handleVerifySignInCode()}
          >
            {signInLoading ? 'Verifying...' : 'Sign In'}
          </Button>
        </div>
        <button
          onClick={() => { setSignInStep('email'); setSignInCode(''); setSignInError(null); }}
          className="text-xs text-scripture-muted hover:text-scripture-text transition-colors"
        >
          Use a different email
        </button>
        {signInError && <p className="text-xs text-scripture-error">{signInError}</p>}
      </>
    );
  }

  async function loadSyncDiagnostics() {
    try {
      const diag = await getSyncDiagnostics();
      setSyncDiagnostics(diag);
      setShowSyncDiagnostics(true);
    } catch (e) {
      console.error('[Settings] Failed to load sync diagnostics:', e);
    }
  }

  const handleClearBook = () => {
    setClearBookSuccess(null);
    setClearBookError(null);
    setShowClearBookConfirm(true);
  };

  const confirmClearBook = async () => {
    setShowClearBookConfirm(false);
    setClearBookSuccess(null);
    setClearBookError(null);

    const bookInfo = getBookById(currentBook);
    const bookName = bookInfo?.name || currentBook;

    try {
      const count = await clearBookAnnotations(currentBook, currentModuleId || undefined);
      setClearBookSuccess(`Cleared ${count} annotation${count !== 1 ? 's' : ''} for ${bookName}`);
      // Reload annotations to reflect changes
      window.dispatchEvent(new CustomEvent('annotationsUpdated'));
      // Clear success message after 5 seconds
      setTimeout(() => setClearBookSuccess(null), 5000);
    } catch (error) {
      setClearBookError('Failed to clear annotations: ' + (error instanceof Error ? error.message : 'Unknown error'));
      // Clear error message after 5 seconds
      setTimeout(() => setClearBookError(null), 5000);
    }
  };

  const handleClearDatabase = async () => {
    setShowClearConfirm(true);
  };

  const confirmClearDatabase = async () => {
    setShowClearConfirm(false);
    setIsClearing(true);
    try {
      await clearDatabase();
      // Reset all stores to prevent crashes from stale data
      resetAllStores();
      // Reload the page immediately - no need for alert since page will refresh
      window.location.reload();
    } catch (error) {
      console.error('Error clearing database:', error);
      setIsClearing(false);
      setShowClearConfirm(false);
      const errorMsg = error instanceof Error ? error.message : 'Failed to clear database. Check console for details.';
      toast.error(errorMsg);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(false);

    try {
      const result = await exportBackup(includeCache);
      setExportSuccess(result || true);
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
      const validation = validateBackup(backup);
      if (!validation.valid) {
        const errorMsg = validation.errors.length > 0
          ? `Invalid backup file format:\n${validation.errors.slice(0, 5).join('\n')}`
          : 'Invalid backup file format';
        throw new Error(errorMsg);
      }

      setImportWarnings(validation.warnings);
      const counts = getBackupPreview(backup);
      setBackupPreview(backup);
      setPreviewCounts(counts);
      setImportStep('preview');
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
      await restoreBackup(backupPreview);

      setRestoreSuccess(true);

      // Reload stores by dispatching events
      window.dispatchEvent(new CustomEvent('annotationsUpdated'));
      window.dispatchEvent(new Event('translationsUpdated'));

      // Reload page after a delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to restore backup');
      setImportStep('preview');
    }
  };

  const handleRestoreStoredBackup = async (id: string) => {
    if (!(await confirmDialog({
      title: 'Restore backup',
      message: 'Restore this backup? This will replace your current data with the snapshot from that time.',
      confirmLabel: 'Restore',
    }))) {
      return;
    }
    setIsCreatingBackup(true);
    try {
      const backupData = await getStoredBackup(id);
      if (backupData) {
        await restoreBackup(backupData);
        toast.success('Backup restored successfully! The page will reload.');
        window.location.reload();
      } else {
        toast.error('Failed to load backup data.');
      }
    } catch (error) {
      console.error('Failed to restore backup:', error);
      toast.error(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleCancelImport = () => {
    setImportStep('select');
    setBackupPreview(null);
    setPreviewCounts(null);
    setImportError(null);
  };

  return (
    <>
      <ConfirmationDialog
        isOpen={showClearConfirm}
        title="Clear Database"
        message="Are you sure you want to clear all annotations, notes, and cache? This cannot be undone."
        confirmLabel="Clear All"
        cancelLabel="Cancel"
        onConfirm={confirmClearDatabase}
        onCancel={() => setShowClearConfirm(false)}
        destructive={true}
      />
      <ConfirmationDialog
        isOpen={showClearBookConfirm}
        title={`Clear Highlights for ${getBookById(currentBook)?.name || currentBook}`}
        message={`Are you sure you want to clear all highlights and annotations for ${getBookById(currentBook)?.name || currentBook}? This action cannot be undone.`}
        confirmLabel="Clear Highlights"
        cancelLabel="Cancel"
        onConfirm={confirmClearBook}
        onCancel={() => setShowClearBookConfirm(false)}
        destructive={true}
      />
      <ConfirmationDialog
        isOpen={showDeleteAccountConfirm}
        title="Delete Account"
        message="This permanently deletes your account and all study data stored on our servers. Your studies on this device are kept. This cannot be undone."
        confirmLabel="Delete Account"
        cancelLabel="Cancel"
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteAccountConfirm(false)}
        destructive={true}
      />
      <div role="tabpanel" id="settings-tabpanel-data" aria-labelledby="settings-tab-data">
      <div className="space-y-0">
        {/* Sync Section */}
        <div className="p-4">
          <h3 className="text-base font-ui font-semibold text-scripture-text mb-1">Sync across devices</h3>
          <p className="text-sm text-scripture-muted mb-4">
            Sign in to keep your studies saved online and up to date on every device you use. This is the easiest way to keep your work safe.
          </p>

          {/* Cloud sync account UI */}
          <div className="mb-4 p-4 bg-scripture-elevated/50 rounded-lg border border-scripture-border/50 space-y-3">
            {renderCloudSyncAccount()}
          </div>

          {/* Sync status (shown for all backends) */}
          {syncStatus ? (
            <div className="space-y-3">
              <div className="p-3 bg-scripture-elevated/50 rounded-lg border border-scripture-border/50 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                    syncStatus.state === 'synced' ? 'bg-scripture-success' :
                    syncStatus.state === 'syncing' ? 'bg-scripture-info animate-pulse' :
                    syncStatus.state === 'error' || syncStatus.state === 'auth-expired' ? 'bg-scripture-error' :
                    'bg-scripture-muted'
                  }`} />
                  <span className="text-sm font-medium text-scripture-text">
                    {getSyncStatusMessage(syncStatus)}
                  </span>
                </div>
                {syncStatus.connected_devices.length > 0 && (
                  <div className="text-xs text-scripture-muted">
                    <span className="font-medium">Devices:</span>{' '}
                    {syncStatus.connected_devices.join(', ')}
                  </div>
                )}
                {syncStatus.error && (
                  <div className="text-xs text-scripture-error">
                    <span className="font-medium">Error:</span> {syncStatus.error}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(syncStatus.state === 'synced' || syncStatus.state === 'syncing') && (
                  <button
                    onClick={async () => {
                      setSyncLoading(true);
                      try { await triggerSync(); }
                      finally { setSyncLoading(false); }
                    }}
                    disabled={syncLoading}
                    className="px-3 py-1.5 text-xs font-ui bg-scripture-elevated hover:bg-scripture-border/50
                             border border-scripture-border/50 text-scripture-text rounded-lg transition-colors
                             disabled:opacity-50"
                  >
                    {syncLoading ? 'Syncing...' : 'Sync Now'}
                  </button>
                )}
                <button
                  onClick={loadSyncDiagnostics}
                  className="px-3 py-1.5 text-xs font-ui bg-scripture-elevated hover:bg-scripture-border/50
                           border border-scripture-border/50 text-scripture-muted rounded-lg transition-colors"
                >
                  Diagnostics
                </button>
              </div>
              {showSyncDiagnostics && syncDiagnostics && (
                <div className="p-3 bg-scripture-elevated/50 rounded-lg border border-scripture-border/50 space-y-1">
                  <div className="text-xs font-medium text-scripture-muted mb-1">Sync Diagnostics</div>
                  <div className="text-xs text-scripture-muted font-mono">
                    Schema version: {syncDiagnostics.schemaVersion}
                  </div>
                  <div className="text-xs text-scripture-muted font-mono">
                    Change log total: {syncDiagnostics.changeLogTotal}
                  </div>
                  <div className="text-xs text-scripture-muted font-mono">
                    Change log unflushed: {syncDiagnostics.changeLogUnflushed}
                  </div>
                  <div className="text-xs text-scripture-muted font-mono break-all">
                    Device ID: {syncDiagnostics.deviceId}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-scripture-elevated/50 rounded-lg border border-scripture-border/50">
              <div className="text-sm text-scripture-muted">Sync not configured.</div>
            </div>
          )}
        </div>

        <div className="border-t border-scripture-border/30 my-4"></div>

        {/* Backup & Restore Section */}
        <div className="p-4">
          <h3 className="text-base font-ui font-semibold text-scripture-text mb-1">Save a backup file</h3>
          <p className="text-sm text-scripture-muted mb-4">
            Save a copy of everything (your keywords, notes, studies, and highlights) to a single file you can keep somewhere safe, like iCloud Drive or Google Drive, or move to another device. Use Restore to bring that data back later.
          </p>

          {importStep === 'select' && (
            <>
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

              <div className="flex gap-3">
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex-1 px-3 py-2 bg-scripture-accent text-scripture-bg rounded-lg hover:bg-scripture-accent/90
                           disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                           font-ui text-sm shadow-md flex items-center justify-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin"></div>
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <span>📥</span>
                      <span>Export Data Backup (JSON)</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleImportSelect}
                  disabled={isImporting}
                  className="flex-1 px-3 py-2 bg-scripture-accent text-scripture-bg rounded-lg hover:bg-scripture-accent/90
                           disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                           font-ui text-sm shadow-md flex items-center justify-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin"></div>
                      <span>Selecting...</span>
                    </>
                  ) : (
                    <>
                      <span>📤</span>
                      <span>Restore from Backup</span>
                    </>
                  )}
                </button>
              </div>

              {exportSuccess && (
                <div className="mt-3 p-3 bg-scripture-successBg border border-scripture-success/30 rounded-lg text-scripture-successText text-sm">
                  ✓ Backup exported successfully!{typeof exportSuccess === 'string' && (
                    <> Saved to Documents/{exportSuccess}</>
                  )}
                </div>
              )}

              {exportError && (
                <div className="mt-3 p-3 bg-scripture-errorBg border border-scripture-error/30 rounded-lg text-scripture-errorText text-sm">
                  ✗ {exportError}
                </div>
              )}

              {importError && (
                <div className="mt-3 p-3 bg-scripture-errorBg border border-scripture-error/30 rounded-lg text-scripture-errorText text-sm">
                  ✗ {importError}
                </div>
              )}
            </>
          )}

          {importStep === 'preview' && backupPreview && previewCounts && (
            <div className="space-y-4">
              <div className="p-4 bg-scripture-surface border border-scripture-border/50 shadow-sm rounded-xl">
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

              {importWarnings.length > 0 && (
                <div className="p-3 bg-scripture-warning/10 border border-scripture-warning/30 rounded-xl text-sm">
                  <div className="font-medium text-scripture-warning mb-1">Some records will be skipped:</div>
                  <ul className="text-scripture-muted list-disc list-inside">
                    {importWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="bg-scripture-surface border border-scripture-border/50 shadow-sm rounded-xl p-4">
                <div className="mb-4">
                  <p className="text-sm text-scripture-muted mb-3">
                    This will replace all your existing data with the backup data. This action cannot be undone.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleRestore}
                    className="flex-1 px-3 py-2 bg-scripture-warning text-scripture-onAccent rounded-lg hover:bg-scripture-warning/90
                             transition-all duration-200 font-ui text-sm shadow-md"
                  >
                    ⚠️ Restore Backup
                  </button>
                  <button
                    onClick={handleCancelImport}
                    className="px-3 py-2 bg-scripture-elevated hover:bg-scripture-border/50 border border-scripture-border/50
                             text-scripture-text rounded-lg transition-all duration-200 font-ui text-sm"
                  >
                    Cancel
                  </button>
                </div>

                <div className="mt-3 p-3 bg-scripture-warningBg border border-scripture-warning/30 rounded-lg text-scripture-warningText text-sm">
                  ⚠️ Warning: This will replace all your existing data. This action cannot be undone.
                </div>
                {syncStatus && syncStatus.state !== 'disabled' && (
                  <div className="mt-2 p-3 bg-scripture-surface border border-scripture-border/50 rounded-lg text-scripture-muted text-sm">
                    Sync is enabled — restoring will sync the restored data to all your connected devices.
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
            <div className="mt-3 p-3 bg-scripture-successBg border border-scripture-success/30 rounded-lg text-scripture-successText text-sm">
              ✓ Backup restored successfully! The page will reload shortly.
            </div>
          )}

          {importError && importStep !== 'restoring' && (
            <div className="mt-3 p-3 bg-scripture-errorBg border border-scripture-error/30 rounded-lg text-scripture-errorText text-sm">
              ✗ {importError}
            </div>
          )}
        </div>

        <div className="border-t border-scripture-border/30 my-4"></div>

        {/* Auto-Backup Section */}
        <div className="p-4">
          <h3 className="text-base font-ui font-semibold text-scripture-text mb-1">Automatic backups</h3>
          <p className="text-sm text-scripture-muted mb-4">
            BibleMarker automatically saves recent snapshots of your data on this device, so you can go back to an earlier point if something goes wrong. These are kept separately from the main database.
          </p>

          <div className="space-y-4">
            {/* Enable/Disable */}
            <label className="flex items-center gap-2 text-sm text-scripture-text cursor-pointer">
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={async (e) => {
                  const enabled = e.target.checked;
                  setAutoBackupEnabled(enabled);
                  setSavingAutoBackup(true);
                  try {
                    await updateAutoBackupConfig({ enabled });
                    if (enabled) {
                      await autoBackupService.restart();
                    } else {
                      autoBackupService.stop();
                    }
                  } catch (error) {
                    console.error('Failed to update auto-backup config:', error);
                    setAutoBackupEnabled(!enabled); // Revert on error
                  } finally {
                    setSavingAutoBackup(false);
                  }
                }}
                disabled={savingAutoBackup}
                className="w-4 h-4 rounded border-scripture-border text-scripture-accent focus:ring-scripture-accent disabled:opacity-50"
              />
              <span>Enable auto-backup</span>
            </label>

            {autoBackupEnabled && (
              <>
                {/* Backup Interval */}
                <Input
                  type="number"
                  label="Backup Interval (minutes)"
                  min="1"
                  max="60"
                  value={autoBackupInterval}
                  onChange={(e) => {
                    const value = Math.max(1, Math.min(60, parseInt(e.target.value) || 5));
                    setAutoBackupInterval(value);
                  }}
                  onBlur={async () => {
                    setSavingAutoBackup(true);
                    try {
                      await updateAutoBackupConfig({ intervalMinutes: autoBackupInterval });
                      await autoBackupService.restart();
                    } catch (error) {
                      console.error('Failed to update auto-backup interval:', error);
                    } finally {
                      setSavingAutoBackup(false);
                    }
                  }}
                  disabled={savingAutoBackup}
                  helpText={`Backups will be created every ${autoBackupInterval} minute${autoBackupInterval !== 1 ? 's' : ''}`}
                />

                {/* Max Backups */}
                <Input
                  type="number"
                  label="Maximum Backups to Keep"
                  min="1"
                  max="50"
                  value={autoBackupMaxBackups}
                  onChange={(e) => {
                    const value = Math.max(1, Math.min(50, parseInt(e.target.value) || 10));
                    setAutoBackupMaxBackups(value);
                  }}
                  onBlur={async () => {
                    setSavingAutoBackup(true);
                    try {
                      await updateAutoBackupConfig({ maxBackups: autoBackupMaxBackups });
                      // Trigger rotation by performing a backup (which includes rotation)
                      if (autoBackupEnabled) {
                        await performBackup();
                        // Refresh statistics
                        const backups = await getStoredBackups();
                        const totalSize = await getTotalBackupSize();
                        setStoredBackups(backups);
                        setTotalBackupSize(totalSize);
                      }
                    } catch (error) {
                      console.error('Failed to update max backups:', error);
                    } finally {
                      setSavingAutoBackup(false);
                    }
                  }}
                  disabled={savingAutoBackup}
                  helpText="Older backups will be automatically deleted when this limit is reached"
                />

                {/* Backup Statistics */}
                <div className="p-3 bg-scripture-elevated/50 rounded-lg border border-scripture-border/50">
                  <div className="text-sm font-medium text-scripture-text mb-2">Backup Statistics</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-scripture-muted">Stored Backups:</span>
                      <span className="text-scripture-text font-medium">{storedBackups.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-scripture-muted">Total Size:</span>
                      <span className="text-scripture-text font-medium">
                        {(totalBackupSize / 1024).toFixed(2)} KB
                      </span>
                    </div>
                    {storedBackups.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-scripture-muted">Latest Backup:</span>
                        <span className="text-scripture-text font-medium">
                          {new Date(storedBackups[0].timestamp).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {backupLocation && (
                      <div className="flex flex-col gap-1">
                        <span className="text-scripture-muted text-xs">Storage Location:</span>
                        <span className="text-scripture-text text-xs font-mono break-all">
                          {backupLocation}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Restore a Backup — pick any kept snapshot */}
                {storedBackups.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-scripture-text">Restore a Backup</div>
                    <p className="text-xs text-scripture-muted">
                      Restoring replaces your current data with the snapshot from that time, then reloads.
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                      {storedBackups.map((b, i) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-scripture-elevated/50 border border-scripture-border/50"
                        >
                          <div className="min-w-0">
                            <div className="text-sm text-scripture-text">
                              {new Date(b.timestamp).toLocaleString()}
                              {i === 0 && (
                                <span className="ml-2 text-xs text-scripture-muted">(latest)</span>
                              )}
                            </div>
                            <div className="text-xs text-scripture-muted">
                              {(b.size / 1024).toFixed(1)} KB
                            </div>
                          </div>
                          <button
                            onClick={() => handleRestoreStoredBackup(b.id)}
                            disabled={isCreatingBackup || savingAutoBackup}
                            className="shrink-0 px-3 py-1.5 text-sm font-ui bg-scripture-warningBg text-scripture-warningText rounded-lg
                                     hover:bg-scripture-warningBg/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual Backup Button */}
                <button
                  onClick={async () => {
                    setIsCreatingBackup(true);
                    try {
                      const backup = await performBackup();
                      if (backup) {
                        // Refresh statistics
                        const backups = await getStoredBackups();
                        const totalSize = await getTotalBackupSize();
                        setStoredBackups(backups);
                        setTotalBackupSize(totalSize);
                      }
                    } catch (error) {
                      console.error('Failed to create backup:', error);
                    } finally {
                      setIsCreatingBackup(false);
                    }
                  }}
                  disabled={isCreatingBackup || savingAutoBackup}
                  className="w-full px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                           hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200 shadow-md flex items-center justify-center gap-2"
                >
                  {isCreatingBackup ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin"></div>
                      <span>Creating Backup...</span>
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      <span>Create Backup Now</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="border-t border-scripture-border/30 my-4"></div>

        <div className="p-4">
          <h3 className="text-base font-ui font-semibold text-scripture-text mb-1">Clear data</h3>
          <p className="text-sm text-scripture-muted mb-4">
            Permanently remove data from this device. Back up first if you might want it later.
          </p>

          <div className="space-y-3">
            <div>
              <button
                onClick={handleClearBook}
                className="w-full px-3 py-2 text-sm font-ui bg-scripture-warningBg
                         hover:bg-scripture-warningBg/80 text-scripture-warningText rounded-lg
                         transition-all duration-200 flex items-center justify-center gap-2
                         border border-scripture-warning/30 shadow-md"
              >
                <span>🗑️</span>
                <span>Clear Highlights for {getBookById(currentBook)?.name || currentBook}</span>
              </button>
              <p className="text-xs text-scripture-muted mt-2">
                Remove all highlights and annotations for the current book
              </p>

              {clearBookSuccess && (
                <div className="mt-3 p-3 bg-scripture-successBg border border-scripture-success/30 rounded-lg text-scripture-successText text-sm">
                  ✓ {clearBookSuccess}
                </div>
              )}

              {clearBookError && (
                <div className="mt-3 p-3 bg-scripture-errorBg border border-scripture-error/30 rounded-lg text-scripture-errorText text-sm">
                  ✗ {clearBookError}
                </div>
              )}
            </div>

            <div>
              <button
                onClick={handleClearDatabase}
                disabled={isClearing}
                className="w-full px-3 py-2 text-sm font-ui bg-scripture-errorBg
                         hover:bg-scripture-errorBg/80 text-scripture-errorText rounded-lg
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                         flex items-center justify-center gap-2 border border-scripture-error/30 shadow-md"
              >
                <span>🗑️</span>
                <span>{isClearing ? 'Clearing...' : 'Clear All Data'}</span>
              </button>
              <p className="text-xs text-scripture-muted mt-2">
                Remove all annotations, notes, and cached Bible text from this device
              </p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
