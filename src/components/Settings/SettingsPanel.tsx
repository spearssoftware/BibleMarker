/**
 * Settings Panel Component
 * 
 * Comprehensive settings interface for the Bible study app.
 */

import { useState, useEffect } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useBibleStore } from '@/stores/bibleStore';
import { getBookById, BIBLE_BOOKS } from '@/types';
import { updatePreferences, clearBookAnnotations, clearDatabase, getPreferences, getSyncDiagnostics, type SyncDiagnostics } from '@/lib/database';
import { exportBackup, importBackup, restoreBackup, validateBackup, getBackupPreview, type BackupData } from '@/lib/backup';
import { exportStudyData } from '@/lib/export';
import { applyTheme } from '@/lib/theme';
import { clearDebugFlagsCache, getDebugFlags } from '@/lib/debug';
import { 
  getAutoBackupConfig, 
  updateAutoBackupConfig, 
  getStoredBackups, 
  getTotalBackupSize,
  autoBackupService,
  performBackup,
  restoreFromLatestBackup,
  getBackupLocation,
  type StoredBackup 
} from '@/lib/autoBackup';
import { invoke } from '@tauri-apps/api/core';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { AboutSection } from './AboutSection';
import { GettingStartedSection } from './GettingStartedSection';
import { Button, ConfirmationDialog, Input, DropdownSelect, Checkbox } from '@/components/shared';
import { resetAllStores } from '@/lib/storeReset';
import { useStudyStore } from '@/stores/studyStore';
import { onSyncStatusChange, getSyncStatusMessage, triggerSync, type SyncStatus } from '@/lib/sync';
import {
  esvClient,
  saveApiConfig as saveApiConfigToDb,
  getAllTranslations,
  getAvailableModules,
  isModuleDownloaded,
  downloadModule,
  deleteModule,
  getModuleCopyright,
  isModuleBundled,
  hasModuleStrongs,
  LOCKMAN_URL,
  type ApiTranslation,
} from '@/lib/bible-api';

type SettingsTab = 'appearance' | 'bible' | 'data' | 'studies' | 'help';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const { fontSize, setFontSize } = useAnnotationStore();
  const { currentBook, currentModuleId } = useBibleStore();
  const [theme, setTheme] = useState<'dark' | 'light' | 'auto'>('dark');
  const [highContrast, setHighContrast] = useState(false);
  const [debugKeywordMatching, setDebugKeywordMatching] = useState(false);
  const [debugVerseText, setDebugVerseText] = useState(false);
  const [checkForUpdates, setCheckForUpdates] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearBookConfirm, setShowClearBookConfirm] = useState(false);
  const [clearBookSuccess, setClearBookSuccess] = useState<string | null>(null);
  const [clearBookError, setClearBookError] = useState<string | null>(null);

  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  
  // Backup/Restore state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [includeCache, setIncludeCache] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  
  // Study Export state
  const [isExportingStudy, setIsExportingStudy] = useState(false);
  const [studyExportError, setStudyExportError] = useState<string | null>(null);
  const [studyExportSuccess, setStudyExportSuccess] = useState(false);
  
  const [importStep, setImportStep] = useState<'select' | 'preview' | 'restoring'>('select');
  const [backupPreview, setBackupPreview] = useState<BackupData | null>(null);
  const [previewCounts, setPreviewCounts] = useState<Record<string, number> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  
  // API Configuration state
  const [esvApiKey, setEsvApiKey] = useState('');
  const [savingApi, setSavingApi] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // SWORD module state
  const [moduleStatuses, setModuleStatuses] = useState<Record<string, 'installed' | 'downloading' | 'not-installed'>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  
  // API resources and language filter state
  const [selectedLanguageCodes, setSelectedLanguageCodes] = useState<string[]>([]);

  // Default translation state
  const [defaultTranslation, setDefaultTranslation] = useState<string>('kjv');
  const [availableTranslations, setAvailableTranslations] = useState<ApiTranslation[]>([]);
  const [savingDefaultTranslation, setSavingDefaultTranslation] = useState(false);

  // Sync status state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncDiagnostics, setSyncDiagnostics] = useState<SyncDiagnostics | null>(null);
  const [showSyncDiagnostics, setShowSyncDiagnostics] = useState(false);
  const [syncDirListing, setSyncDirListing] = useState<string | null>(null);

  // Disabled tools state
  const [disabledTools, setDisabledTools] = useState<string[]>([]);

  // Studies state
  const { studies, activeStudyId, loadStudies, createStudy, updateStudy, deleteStudy, setActiveStudy } = useStudyStore();
  const [newStudyName, setNewStudyName] = useState('');
  const [newStudyBook, setNewStudyBook] = useState<string>('');
  const [editingStudy, setEditingStudy] = useState<{ id: string; name: string; book?: string } | null>(null);
  const [confirmDeleteStudyId, setConfirmDeleteStudyId] = useState<string | null>(null);

  // Auto-backup state
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [autoBackupInterval, setAutoBackupInterval] = useState(5);
  const [autoBackupMaxBackups, setAutoBackupMaxBackups] = useState(10);
  const [savingAutoBackup, setSavingAutoBackup] = useState(false);
  const [storedBackups, setStoredBackups] = useState<StoredBackup[]>([]);
  const [totalBackupSize, setTotalBackupSize] = useState(0);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupLocation, setBackupLocation] = useState<string>('');

  // Load current preferences
  useEffect(() => {
    let statsInterval: number | undefined;
    
    async function loadPrefs() {
      try {
        setIsLoadingPrefs(true);
        const prefs = await getPreferences();
        if (prefs.theme) {
          setTheme(prefs.theme);
        }
        if (prefs.highContrast !== undefined) {
          setHighContrast(prefs.highContrast);
        }
        if (prefs.debug?.keywordMatching !== undefined) {
          setDebugKeywordMatching(prefs.debug.keywordMatching);
        }
        if (prefs.debug?.verseText !== undefined) {
          setDebugVerseText(prefs.debug.verseText);
        }
        if (prefs.checkForUpdates !== undefined) {
          setCheckForUpdates(prefs.checkForUpdates);
        }
        setDisabledTools(prefs.disabledTools || []);
        // Initialize debug flags cache so getDebugFlagsSync() works
        await getDebugFlags();
        applyTheme(prefs.theme || 'auto', prefs.highContrast || false);
        
        // Load auto-backup config
        const autoBackupConfig = await getAutoBackupConfig();
        setAutoBackupEnabled(autoBackupConfig.enabled);
        setAutoBackupInterval(autoBackupConfig.intervalMinutes);
        setAutoBackupMaxBackups(autoBackupConfig.maxBackups);
        
        // Load backup statistics
        const loadBackupStats = async () => {
          const backups = await getStoredBackups();
          const totalSize = await getTotalBackupSize();
          const location = await getBackupLocation();
          setStoredBackups(backups);
          setTotalBackupSize(totalSize);
          setBackupLocation(location);
        };
        await loadBackupStats();
        
        // Refresh backup stats every 30 seconds when settings panel is open
        statsInterval = window.setInterval(loadBackupStats, 30000);
        
        // Load API configs
        if (prefs.apiConfigs) {
          const esvConfig = prefs.apiConfigs.find(c => c.provider === 'esv');
          if (esvConfig?.apiKey) setEsvApiKey(esvConfig.apiKey);
        }

        // Load SWORD module statuses
        const modules = getAvailableModules();
        const statuses: Record<string, 'installed' | 'not-installed'> = {};
        for (const mod of modules) {
          statuses[mod.id] = (await isModuleDownloaded(mod.id)) ? 'installed' : 'not-installed';
        }
        setModuleStatuses(statuses);
        
        // Load API resources and language filter (default to English when unset)
        setSelectedLanguageCodes(
          prefs.translationLanguageFilter !== undefined
            ? prefs.translationLanguageFilter
            : ['en']
        );

        // Load default translation (fallback to KJV)
        setDefaultTranslation(prefs.defaultTranslation || 'sword-NASB');
        
        // Load available translations
        const translations = await getAllTranslations();
        setAvailableTranslations(translations);

        // Sync status is updated via subscription (see useEffect below)
      } catch (error) {
        console.error('Error loading preferences:', error);
      } finally {
        setIsLoadingPrefs(false);
      }
    }
    loadPrefs();
    
    // Listen for translations updated event to refresh the list
    const handleTranslationsUpdated = async () => {
      try {
        const translations = await getAllTranslations();
        setAvailableTranslations(translations);
      } catch (error) {
        console.error('Error reloading translations:', error);
      }
    };
    
    window.addEventListener('translationsUpdated', handleTranslationsUpdated);
    
    // Cleanup interval and event listener on unmount
    return () => {
      if (statsInterval !== undefined) {
        clearInterval(statsInterval);
      }
      window.removeEventListener('translationsUpdated', handleTranslationsUpdated);
    };
  }, []);

  // Load studies when studies tab is active
  useEffect(() => {
    if (activeTab === 'studies') {
      loadStudies();
    }
  }, [activeTab, loadStudies]);

  // Subscribe to sync status changes
  useEffect(() => {
    const unsubscribe = onSyncStatusChange(setSyncStatus);
    return unsubscribe;
  }, []);

  async function loadSyncDiagnostics() {
    try {
      const diag = await getSyncDiagnostics();
      setSyncDiagnostics(diag);
      setShowSyncDiagnostics(true);
    } catch (e) {
      console.error('[Settings] Failed to load sync diagnostics:', e);
    }
    if (syncStatus?.sync_folder) {
      try {
        const listing = await invoke<string>('list_sync_dir', { path: syncStatus.sync_folder });
        setSyncDirListing(listing);
      } catch (e) {
        setSyncDirListing(`Error: ${e}`);
      }
    }
    try {
      const writeTest = await invoke<string>('test_icloud_write');
      setSyncDirListing(prev => (prev ?? '') + '\nWrite test: ' + writeTest);
    } catch (e) {
      setSyncDirListing(prev => (prev ?? '') + '\nWrite test error: ' + e);
    }
  }

  async function saveEsvConfig(apiKey: string) {
    setSavingApi(true);
    setApiError(null);
    try {
      await saveApiConfigToDb({
        provider: 'esv',
        apiKey,
        enabled: apiKey.length > 0,
      });
      setEsvApiKey(apiKey);

      window.dispatchEvent(new Event('translationsUpdated'));

      const translations = await getAllTranslations();
      setAvailableTranslations(translations);
    } catch (err) {
      console.error('Failed to save API config:', err);
      setApiError(err instanceof Error ? err.message : 'Failed to save API config');
    } finally {
      setSavingApi(false);
    }
  }

  async function handleDownloadModule(moduleId: string) {
    setModuleStatuses(prev => ({ ...prev, [moduleId]: 'downloading' }));
    setDownloadProgress(prev => ({ ...prev, [moduleId]: 0 }));
    try {
      await downloadModule(moduleId, (percent) => {
        setDownloadProgress(prev => ({ ...prev, [moduleId]: percent }));
      });
      setModuleStatuses(prev => ({ ...prev, [moduleId]: 'installed' }));

      window.dispatchEvent(new Event('translationsUpdated'));
      const translations = await getAllTranslations();
      setAvailableTranslations(translations);
    } catch (err) {
      console.error(`Failed to download module ${moduleId}:`, err);
      setModuleStatuses(prev => ({ ...prev, [moduleId]: 'not-installed' }));
      setApiError(err instanceof Error ? err.message : 'Failed to download module');
    } finally {
      setDownloadProgress(prev => {
        const next = { ...prev };
        delete next[moduleId];
        return next;
      });
    }
  }

  async function handleDeleteModule(moduleId: string) {
    if (!confirm(`Remove this Bible module? You can re-download it later.`)) return;
    try {
      await deleteModule(moduleId);
      setModuleStatuses(prev => ({ ...prev, [moduleId]: 'not-installed' }));

      window.dispatchEvent(new Event('translationsUpdated'));
      const translations = await getAllTranslations();
      setAvailableTranslations(translations);
    } catch (err) {
      console.error(`Failed to delete module ${moduleId}:`, err);
      setApiError(err instanceof Error ? err.message : 'Failed to remove module');
    }
  }


  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'bible', label: 'Bible', icon: '📖' },
    { id: 'data', label: 'Data', icon: '💾' },
    { id: 'studies', label: 'Studies', icon: '📖' },
    { id: 'help', label: 'Help', icon: '❓' },
  ];

  const fontSizes: Array<{ size: 'sm' | 'base' | 'lg' | 'xl'; label: string }> = [
    { size: 'sm', label: 'Small' },
    { size: 'base', label: 'Medium' },
    { size: 'lg', label: 'Large' },
    { size: 'xl', label: 'Extra Large' },
  ];

  const themes: Array<{ value: 'dark' | 'light' | 'auto'; label: string }> = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'auto', label: 'Auto' },
  ];

  const handleFontSizeChange = async (newSize: 'sm' | 'base' | 'lg' | 'xl') => {
    setFontSize(newSize);
    try {
      await updatePreferences({ fontSize: newSize });
    } catch (error) {
      console.error('Error updating font size:', error);
    }
  };

  const handleThemeChange = async (newTheme: 'dark' | 'light' | 'auto') => {
    setTheme(newTheme);
    applyTheme(newTheme, highContrast);
    try {
      await updatePreferences({ theme: newTheme });
    } catch (error) {
      console.error('Error updating theme:', error);
    }
  };

  const handleHighContrastChange = async (enabled: boolean) => {
    setHighContrast(enabled);
    applyTheme(theme, enabled);
    try {
      await updatePreferences({ highContrast: enabled });
    } catch (error) {
      console.error('Error updating high contrast:', error);
    }
  };

  const handleCheckForUpdatesChange = async (enabled: boolean) => {
    setCheckForUpdates(enabled);
    try {
      await updatePreferences({ checkForUpdates: enabled });
    } catch (error) {
      console.error('Error updating check for updates preference:', error);
    }
  };

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
      // Show error inline instead of blocking alert
      const errorMsg = error instanceof Error ? error.message : 'Failed to clear database. Check console for details.';
      alert(errorMsg); // Only show alert on error, user can dismiss it
    }
  };

  // Backup/Restore functions
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
    fiveWAndH: '5W+H Entries',
    contrasts: 'Contrasts',
    timeExpressions: 'Time Expressions',
    places: 'Places',
    conclusions: 'Conclusions',
    interpretations: 'Interpretations',
    applications: 'Applications',
    cachedChapters: 'Cached Bible Text',
  };

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

  const handleExportStudy = async () => {
    setIsExportingStudy(true);
    setStudyExportError(null);
    setStudyExportSuccess(false);

    try {
      await exportStudyData();
      setStudyExportSuccess(true);
      setTimeout(() => {
        setStudyExportSuccess(false);
      }, 3000);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to export study data';
      if (msg !== 'Export cancelled') {
        setStudyExportError(msg);
      }
    } finally {
      setIsExportingStudy(false);
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
      <div
        className="flex-1 min-h-0 flex flex-col overflow-hidden relative"
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
      >
        {/* Tabs */}
        <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 border-b border-scripture-border/30" role="tablist" aria-label="Settings sections">
          <div className="flex gap-1 sm:gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                id={`settings-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`settings-tabpanel-${tab.id}`}
                title={tab.label}
                className={`
                  px-2 sm:px-3 py-1.5 rounded-lg text-sm font-ui font-medium transition-all
                  flex items-center justify-center gap-1
                  ${activeTab === tab.id
                    ? 'bg-scripture-accent text-scripture-bg shadow-md'
                    : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'
                  }
                `}
              >
                <span className="text-base" aria-hidden="true">{tab.icon}</span>
                <span className={`text-xs ${activeTab === tab.id ? 'inline' : 'hidden sm:inline'}`}>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
          {isLoadingPrefs ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-scripture-border border-t-scripture-accent rounded-full animate-spin"></div>
                <div className="text-scripture-muted text-sm">Loading settings...</div>
              </div>
            </div>
          ) : (
            <>
          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div role="tabpanel" id="settings-tabpanel-appearance" aria-labelledby="settings-tab-appearance">
            <div className="space-y-0">
              <div className="p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Font Size</h3>
                <div className="grid grid-cols-4 gap-2">
                  {fontSizes.map((fs) => (
                    <button
                      key={fs.size}
                      onClick={() => handleFontSizeChange(fs.size)}
                      className={`px-3 py-2 rounded-lg font-ui text-sm transition-all duration-200 text-center
                                ${fontSize === fs.size
                                  ? 'bg-scripture-accent text-scripture-bg shadow-md'
                                  : 'bg-scripture-elevated hover:bg-scripture-border/50 border border-scripture-border/50'
                                }`}
                    >
                      {fs.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-scripture-muted mt-2">
                  Adjust the text size for Bible reading
                </p>
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              <div className="p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Theme</h3>
                <div className="grid grid-cols-3 gap-2">
                  {themes.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => handleThemeChange(t.value)}
                      className={`px-3 py-2 rounded-lg font-ui text-sm transition-all duration-200 text-center
                                ${theme === t.value
                                  ? 'bg-scripture-accent text-scripture-bg shadow-md'
                                  : 'bg-scripture-elevated hover:bg-scripture-border/50 border border-scripture-border/50 text-scripture-text'
                                }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-scripture-muted mt-2">
                  Choose your preferred theme. Auto mode follows your system preference.
                </p>
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              <div className="p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Accessibility</h3>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-ui font-medium text-scripture-text mb-1">High Contrast Mode</div>
                    <p className="text-xs text-scripture-muted">
                      Increases color contrast for better readability. Meets WCAG AAA contrast requirements.
                    </p>
                  </div>
                  <button
                    onClick={() => handleHighContrastChange(!highContrast)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-scripture-accent focus:ring-offset-2 ${
                      highContrast ? 'bg-scripture-accent' : 'bg-scripture-border'
                    }`}
                    role="switch"
                    aria-checked={highContrast}
                    aria-label="Toggle high contrast mode"
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        highContrast ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              <div className="p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-2">Tools</h3>
                <p className="text-xs text-scripture-muted mb-4">
                  Hide tools you don't use. Disabled tools won't appear in their panel tabs.
                </p>

                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-ui font-medium text-scripture-text mb-2">Observe</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {[
                        { id: 'lists', label: 'Lists' },
                        { id: 'fiveWAndH', label: "5 W's & H" },
                        { id: 'people', label: 'People' },
                        { id: 'places', label: 'Places' },
                        { id: 'time', label: 'Time' },
                        { id: 'contrasts', label: 'Contrasts' },
                      ].map(tool => (
                        <Checkbox
                          key={tool.id}
                          label={tool.label}
                          checked={!disabledTools.includes(tool.id)}
                          onChange={async (e) => {
                            const next = e.target.checked
                              ? disabledTools.filter(t => t !== tool.id)
                              : [...disabledTools, tool.id];
                            setDisabledTools(next);
                            await updatePreferences({ disabledTools: next });
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-ui font-medium text-scripture-text mb-2">Analyze</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {[
                        { id: 'chapter', label: 'Chapter' },
                        { id: 'conclusions', label: 'Conclusions' },
                        { id: 'overview', label: 'Overview' },
                        { id: 'themes', label: 'Themes' },
                        { id: 'timeline', label: 'Timeline' },
                      ].map(tool => (
                        <Checkbox
                          key={tool.id}
                          label={tool.label}
                          checked={!disabledTools.includes(tool.id)}
                          onChange={async (e) => {
                            const next = e.target.checked
                              ? disabledTools.filter(t => t !== tool.id)
                              : [...disabledTools, tool.id];
                            setDisabledTools(next);
                            await updatePreferences({ disabledTools: next });
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-ui font-medium text-scripture-text mb-2">Study</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {[
                        { id: 'interpretation', label: 'Interpretation' },
                        { id: 'application', label: 'Application' },
                      ].map(tool => (
                        <Checkbox
                          key={tool.id}
                          label={tool.label}
                          checked={!disabledTools.includes(tool.id)}
                          onChange={async (e) => {
                            const next = e.target.checked
                              ? disabledTools.filter(t => t !== tool.id)
                              : [...disabledTools, tool.id];
                            setDisabledTools(next);
                            await updatePreferences({ disabledTools: next });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          )}

          {/* Bible Tab */}
          {activeTab === 'bible' && (
            <div role="tabpanel" id="settings-tabpanel-bible" aria-labelledby="settings-tab-bible">
            <div className="space-y-0">
              {apiError && (
                <div className="bg-scripture-errorBg border border-scripture-error/30 rounded-lg p-3 text-scripture-errorText text-sm mb-4">
                  {apiError}
                </div>
              )}

              {/* Show translations in (language filter) */}
              <div className="p-4">
                <div className="font-ui font-medium text-scripture-text mb-2">Show translations in</div>
                <p className="text-xs text-scripture-muted mb-3">
                  Leave all unchecked to show every language. Check one or more to limit the translation list.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {[
                    { code: 'en', label: 'English' },
                    { code: 'es', label: 'Spanish' },
                    { code: 'fr', label: 'French' },
                    { code: 'de', label: 'German' },
                    { code: 'pt', label: 'Portuguese' },
                    { code: 'it', label: 'Italian' },
                    { code: 'nl', label: 'Dutch' },
                    { code: 'ru', label: 'Russian' },
                    { code: 'la', label: 'Latin' },
                  ].map(({ code, label }) => (
                    <Checkbox
                      key={code}
                      id={`lang-filter-${code}`}
                      label={label}
                      checked={selectedLanguageCodes.includes(code)}
                      onChange={async () => {
                        const next = selectedLanguageCodes.includes(code)
                          ? selectedLanguageCodes.filter((c) => c !== code)
                          : [...selectedLanguageCodes, code];
                        setSelectedLanguageCodes(next);
                        try {
                          await updatePreferences({
                            translationLanguageFilter: next.length > 0 ? next : undefined,
                          });
                          window.dispatchEvent(new Event('translationsUpdated'));
                          const translations = await getAllTranslations();
                          setAvailableTranslations(translations);
                        } catch (error) {
                          console.error('Failed to save language filter:', error);
                          setSelectedLanguageCodes(selectedLanguageCodes);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              {/* Default Translation Section */}
              <div className="p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Default Translation</h3>
                <p className="text-sm text-scripture-muted mb-4">
                  Choose a default translation to use when the app starts. This will be automatically selected if no translation is currently active.
                </p>
                <DropdownSelect
                  label="Default Translation"
                  value={defaultTranslation}
                  onChange={async (newValue) => {
                    setDefaultTranslation(newValue);
                    // Save immediately when changed
                    setSavingDefaultTranslation(true);
                    try {
                      await updatePreferences({ defaultTranslation: newValue });
                      // Reload translations to ensure the list is up to date
                      const translations = await getAllTranslations();
                      setAvailableTranslations(translations);
                    } catch (error) {
                      console.error('Failed to save default translation:', error);
                    } finally {
                      setSavingDefaultTranslation(false);
                    }
                  }}
                  disabled={savingDefaultTranslation}
                  options={[
                    ...availableTranslations.map((translation) => ({
                      value: translation.id,
                      label: `${translation.name}${translation.abbreviation ? ` (${translation.abbreviation})` : ''}`
                    }))
                  ]}
                />
                {defaultTranslation && (
                  <p className="text-xs text-scripture-muted mt-1">
                    Default translation: {availableTranslations.find(t => t.id === defaultTranslation)?.name || defaultTranslation}
                  </p>
                )}
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              {/* Offline Bible Modules (SWORD) */}
              <div className="p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-2">Offline Bible Modules</h3>
                <p className="text-sm text-scripture-muted mb-4">
                  Download Bible translations for offline reading.
                </p>

                {/* Licensed modules (Lockman) */}
                <div className="mb-4">
                  <h4 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-3">
                    Licensed (The Lockman Foundation)
                  </h4>
                  <div className="space-y-2">
                    {getAvailableModules().filter(m => m.category === 'licensed' && (selectedLanguageCodes.length === 0 || selectedLanguageCodes.includes(m.language))).map(mod => {
                      const status = moduleStatuses[mod.id] || 'not-installed';
                      const progress = downloadProgress[mod.id];
                      const copyright = getModuleCopyright(mod.id);
                      return (
                        <div key={mod.id} className="p-3 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-scripture-text">{mod.abbreviation}</span>
                                {hasModuleStrongs(mod.id) && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-scripture-info/15 text-scripture-info rounded border border-scripture-info/30 font-medium">
                                    Strong's
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-scripture-muted mt-0.5">{mod.name}</p>
                            </div>
                            <div className="flex-shrink-0 ml-2">
                              {status === 'installed' && isModuleBundled(mod.id) && (
                                <span className="text-xs text-scripture-muted">Included</span>
                              )}
                              {status === 'installed' && !isModuleBundled(mod.id) && (
                                <button
                                  onClick={() => handleDeleteModule(mod.id)}
                                  className="text-xs px-2 py-1 text-scripture-errorText hover:text-scripture-error"
                                >
                                  Remove
                                </button>
                              )}
                              {status === 'downloading' && (
                                <span className="text-xs text-scripture-muted">
                                  {progress !== undefined ? `${progress}%` : 'Downloading...'}
                                </span>
                              )}
                              {status === 'not-installed' && (
                                <button
                                  onClick={() => handleDownloadModule(mod.id)}
                                  className="text-xs px-3 py-1 bg-scripture-accent text-scripture-bg rounded hover:bg-scripture-accent/90"
                                >
                                  Download
                                </button>
                              )}
                            </div>
                          </div>
                          {copyright && (
                            <p className="text-[10px] text-scripture-muted mt-2 leading-tight">
                              {copyright.text}{' '}
                              <a
                                href={LOCKMAN_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-scripture-accent hover:underline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  import('@/lib/platform').then(({ openUrl }) => openUrl(LOCKMAN_URL));
                                }}
                              >
                                lockman.org
                              </a>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Public domain modules */}
                <div>
                  <h4 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-3">
                    Public Domain
                  </h4>
                  <div className="space-y-2">
                    {getAvailableModules().filter(m => m.category === 'public-domain' && (selectedLanguageCodes.length === 0 || selectedLanguageCodes.includes(m.language))).map(mod => {
                      const status = moduleStatuses[mod.id] || 'not-installed';
                      const progress = downloadProgress[mod.id];
                      return (
                        <div key={mod.id} className="p-3 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-scripture-text">{mod.abbreviation}</span>
                                {hasModuleStrongs(mod.id) && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-scripture-info/15 text-scripture-info rounded border border-scripture-info/30 font-medium">
                                    Strong's
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-scripture-muted mt-0.5">{mod.name}</p>
                            </div>
                            <div className="flex-shrink-0 ml-2">
                              {status === 'installed' && isModuleBundled(mod.id) && (
                                <span className="text-xs text-scripture-muted">Included</span>
                              )}
                              {status === 'installed' && !isModuleBundled(mod.id) && (
                                <button
                                  onClick={() => handleDeleteModule(mod.id)}
                                  className="text-xs px-2 py-1 text-scripture-errorText hover:text-scripture-error"
                                >
                                  Remove
                                </button>
                              )}
                              {status === 'downloading' && (
                                <span className="text-xs text-scripture-muted">
                                  {progress !== undefined ? `${progress}%` : 'Downloading...'}
                                </span>
                              )}
                              {status === 'not-installed' && (
                                <button
                                  onClick={() => handleDownloadModule(mod.id)}
                                  className="text-xs px-3 py-1 bg-scripture-accent text-scripture-bg rounded hover:bg-scripture-accent/90"
                                >
                                  Download
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              {/* ESV API Section */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text mb-3">ESV API</h3>
                  {esvClient.isConfigured() ? (
                    <span className="text-xs px-2 py-1 bg-scripture-successBg text-scripture-successText border border-scripture-success/30 rounded">
                      ✓ Configured
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 bg-scripture-warningBg text-scripture-warningText border border-scripture-warning/30 rounded">
                      API Key Required
                    </span>
                  )}
                </div>
                <p className="text-sm text-scripture-muted mb-4">
                  Get a free API key from ESV.org for English Standard Version text. Requires internet.
                </p>
                <div className="mb-4 space-y-2">
                  <a
                    href="https://api.esv.org/docs/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                             hover:bg-scripture-accent/90 transition-all duration-200 shadow-md text-center"
                  >
                    View ESV API Documentation
                  </a>
                </div>
                <div className="mb-4 p-3 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                  <p className="text-xs text-scripture-text mb-1">
                    <strong>How to get your API key:</strong>
                  </p>
                  <ol className="text-xs text-scripture-muted list-decimal list-inside space-y-1">
                    <li>Click "View ESV API Documentation" above</li>
                    <li>Follow the instructions to create an API Application</li>
                    <li>You'll need to create an account if you don't have one</li>
                    <li>Copy your API key and paste it below</li>
                  </ol>
                  <p className="text-xs text-scripture-muted mt-2 italic">
                    Note: You'll need to create an API Application to get your key. The documentation will guide you through the process.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={esvApiKey}
                    onChange={(e) => setEsvApiKey(e.target.value)}
                    placeholder={esvClient.isConfigured() ? "Edit your ESV API key" : "Paste your ESV API key here"}
                    className="flex-1"
                  />
                  <button
                    onClick={() => saveEsvConfig(esvApiKey)}
                    disabled={savingApi}
                    className="px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                             hover:bg-scripture-accent/90 transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingApi ? 'Saving...' : esvClient.isConfigured() ? 'Update' : 'Save'}
                  </button>
                </div>
                {esvClient.isConfigured() && (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to remove the ESV API key?')) {
                        saveEsvConfig('');
                        setEsvApiKey('');
                      }
                    }}
                    className="text-xs text-scripture-errorText hover:text-scripture-error underline"
                  >
                    Remove API Key
                  </button>
                )}
              </div>
            </div>
            </div>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div role="tabpanel" id="settings-tabpanel-data" aria-labelledby="settings-tab-data">
            <div className="space-y-0">
              {/* Sync Status */}
              <div className="p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Sync</h3>
                {syncStatus ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-scripture-elevated/50 rounded-lg border border-scripture-border/50 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                          syncStatus.state === 'synced' ? 'bg-scripture-success' :
                          syncStatus.state === 'syncing' ? 'bg-scripture-info' :
                          syncStatus.state === 'error' ? 'bg-scripture-error' :
                          'bg-scripture-muted'
                        }`} />
                        <span className="text-sm font-medium text-scripture-text">
                          {getSyncStatusMessage(syncStatus)}
                        </span>
                      </div>
                      {syncStatus.sync_folder && (
                        <div className="text-xs text-scripture-muted">
                          <span className="font-medium">Sync folder:</span>{' '}
                          <span className="font-mono break-all">{syncStatus.sync_folder}</span>
                        </div>
                      )}
                      {syncStatus.connected_devices.length > 0 && (
                        <div className="text-xs text-scripture-muted">
                          <span className="font-medium">Devices:</span>{' '}
                          {syncStatus.connected_devices.join(', ')}
                        </div>
                      )}
                      {syncStatus.error && (
                        <div className="text-xs text-scripture-errorText">
                          <span className="font-medium">Error:</span> {syncStatus.error}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {syncStatus.state !== 'disabled' && (
                        <button
                          onClick={async () => {
                            setSyncLoading(true);
                            try {
                              await triggerSync();
                            } finally {
                              setSyncLoading(false);
                            }
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
                        {syncDirListing && (
                          <div className="text-xs text-scripture-muted font-mono break-all mt-1 pt-1 border-t border-scripture-border/30">
                            Sync dir: {syncDirListing}
                          </div>
                        )}
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
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Data Backup & Restore</h3>
                <p className="text-sm text-scripture-muted mb-4">
                  Create a complete backup of all your data (annotations, keywords, notes, studies, etc.) as a JSON file for data recovery. This backup can be restored to recover your work if needed. You can save backups to your cloud folder (iCloud Drive, Google Drive, etc.) for automatic syncing. <strong>Note:</strong> This creates a technical backup file, not a readable document. For a formatted, readable export of your study notes, use the Study Export section below.
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
                        ✓ Backup exported successfully!
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

                    <div className="bg-scripture-surface border border-scripture-border/50 shadow-sm rounded-xl p-4">
                      <div className="mb-4">
                        <p className="text-sm text-scripture-muted mb-3">
                          This will replace all your existing data with the backup data. This action cannot be undone.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={handleRestore}
                          className="flex-1 px-3 py-2 bg-scripture-warning text-white rounded-lg hover:bg-scripture-warning/90 
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

              {/* Study Export Section */}
              <div className="p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Study Export</h3>
                <p className="text-sm text-scripture-muted mb-4">
                  Export your study observations, interpretations, and applications as a formatted Markdown document. This creates a readable summary of your Bible study organized by book and chapter.
                </p>

                <button
                  onClick={handleExportStudy}
                  disabled={isExportingStudy}
                  className="w-full px-3 py-2 bg-scripture-accent text-scripture-bg rounded-lg hover:bg-scripture-accent/90
                           disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                           font-ui text-sm shadow-md flex items-center justify-center gap-2"
                >
                  {isExportingStudy ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin"></div>
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <span>📄</span>
                      <span>Export Study Data (Markdown)</span>
                    </>
                  )}
                </button>

                {studyExportSuccess && (
                  <div className="mt-3 p-3 bg-scripture-successBg border border-scripture-success/30 rounded-lg text-scripture-successText text-sm">
                    ✓ Study data exported successfully!
                  </div>
                )}

                {studyExportError && (
                  <div className="mt-3 p-3 bg-scripture-errorBg border border-scripture-error/30 rounded-lg text-scripture-errorText text-sm">
                    ✗ {studyExportError}
                  </div>
                )}
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              {/* Auto-Backup Section */}
              <div className="p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Auto-Backup</h3>
                <p className="text-sm text-scripture-muted mb-4">
                  Automatically backup your data at regular intervals. Backups are stored as JSON files (separate from the database) and rotated to keep only the most recent ones. This protects your data if the database becomes corrupted.
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

                      {/* Restore from Latest Backup */}
                      {storedBackups.length > 0 && (
                        <button
                          onClick={async () => {
                            if (!confirm('Restore from the most recent auto-backup? This will replace your current data.')) {
                              return;
                            }
                            setIsCreatingBackup(true);
                            try {
                              const backupData = await restoreFromLatestBackup();
                              if (backupData) {
                                await restoreBackup(backupData);
                                alert('Backup restored successfully! The page will reload.');
                                window.location.reload();
                              } else {
                                alert('Failed to load backup data.');
                              }
                            } catch (error) {
                              console.error('Failed to restore backup:', error);
                              alert(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            } finally {
                              setIsCreatingBackup(false);
                            }
                          }}
                          disabled={isCreatingBackup || savingAutoBackup}
                          className="w-full px-3 py-2 text-sm font-ui bg-scripture-warningBg text-scripture-warningText rounded-lg
                                   hover:bg-scripture-warningBg/80 disabled:opacity-50 disabled:cursor-not-allowed
                                   transition-all duration-200 shadow-md flex items-center justify-center gap-2"
                        >
                          {isCreatingBackup ? (
                            <>
                              <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin"></div>
                              <span>Restoring...</span>
                            </>
                          ) : (
                            <>
                              <span>🔄</span>
                              <span>Restore from Latest Backup</span>
                            </>
                          )}
                        </button>
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
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Clear Data</h3>
                
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
                      Remove all annotations, notes, and cached Bible text (for testing)
                    </p>
                  </div>
                </div>
              </div>
            </div>
            </div>
          )}

          {/* Studies Tab */}
          {activeTab === 'studies' && (
            <div role="tabpanel" id="settings-tabpanel-studies" aria-labelledby="settings-tab-studies">
              <ConfirmationDialog
                isOpen={confirmDeleteStudyId != null}
                title="Delete Study"
                message="Are you sure you want to delete this study? This cannot be undone."
                confirmLabel="Delete"
                cancelLabel="Cancel"
                onConfirm={async () => {
                  if (!confirmDeleteStudyId) return;
                  const id = confirmDeleteStudyId;
                  setConfirmDeleteStudyId(null);
                  await deleteStudy(id);
                }}
                onCancel={() => setConfirmDeleteStudyId(null)}
                destructive
              />
              <div className="space-y-0">
                <div className="p-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Create New Study</h3>
                  <div className="space-y-3">
                    <Input
                      type="text"
                      value={newStudyName}
                      onChange={(e) => setNewStudyName(e.target.value)}
                      placeholder="Study name (e.g., 'John - Character Study')"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newStudyName.trim()) {
                          createStudy(newStudyName.trim(), newStudyBook || undefined).then(() => {
                            setNewStudyName('');
                            setNewStudyBook('');
                          });
                        }
                      }}
                    />
                    <DropdownSelect
                      value={newStudyBook}
                      onChange={(value) => setNewStudyBook(value)}
                      options={[
                        { value: '', label: 'All books (global study)' },
                        ...BIBLE_BOOKS.map(book => ({ value: book.id, label: book.name }))
                      ]}
                    />
                    <button
                      onClick={() => {
                        if (!newStudyName.trim()) return;
                        createStudy(newStudyName.trim(), newStudyBook || undefined).then(() => {
                          setNewStudyName('');
                          setNewStudyBook('');
                        });
                      }}
                      disabled={!newStudyName.trim()}
                      className="w-full px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                               hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all duration-200 shadow-md"
                    >
                      Create Study
                    </button>
                  </div>
                </div>

                <div className="border-t border-scripture-border/30 my-4"></div>

                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-ui font-semibold text-scripture-text">Your Studies</h3>
                    {activeStudyId && (
                      <button
                        onClick={() => setActiveStudy(null)}
                        className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50
                                 border border-scripture-border/50 text-scripture-text rounded-lg transition-all duration-200"
                      >
                        Clear Active Study
                      </button>
                    )}
                  </div>
                  {studies.length === 0 ? (
                    <p className="text-scripture-muted text-sm">No studies yet. Create one above to get started.</p>
                  ) : (
                    <div className="space-y-2">
                      {studies.map(study => (
                        <div
                          key={study.id}
                          className="p-4 bg-scripture-surface rounded-xl border border-scripture-border/50 shadow-sm flex items-center justify-between"
                        >
                          {editingStudy?.id === study.id ? (
                            <div className="flex-1 space-y-2">
                              <Input
                                type="text"
                                value={editingStudy.name}
                                onChange={(e) => setEditingStudy({ ...editingStudy, name: e.target.value })}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    updateStudy({ ...study, name: editingStudy.name.trim(), book: editingStudy.book }).then(() => setEditingStudy(null));
                                  } else if (e.key === 'Escape') {
                                    setEditingStudy(null);
                                  }
                                }}
                              />
                              <DropdownSelect
                                value={editingStudy.book || ''}
                                onChange={(value) => setEditingStudy({ ...editingStudy, book: value || undefined })}
                                options={[
                                  { value: '', label: 'All books' },
                                  ...BIBLE_BOOKS.map(book => ({ value: book.id, label: book.name }))
                                ]}
                              />
                              <div className="flex justify-center sm:justify-end gap-2">
                                <Button variant="ghost" onClick={() => setEditingStudy(null)}>Cancel</Button>
                                <Button onClick={() => updateStudy({ ...study, name: editingStudy.name.trim(), book: editingStudy.book }).then(() => setEditingStudy(null))}>Save</Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <div className="font-medium text-scripture-text">{study.name}</div>
                                  {activeStudyId === study.id && (
                                    <span className="px-2 py-0.5 text-xs bg-scripture-accent text-scripture-bg rounded">Active</span>
                                  )}
                                </div>
                                <div className="text-sm text-scripture-muted">
                                  {study.book ? `Scoped to: ${getBookById(study.book)?.name || study.book}` : 'Global study'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {activeStudyId !== study.id && (
                                  <button
                                    onClick={() => setActiveStudy(study.id)}
                                    className="px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                                             hover:bg-scripture-accent/90 transition-all duration-200 shadow-md"
                                  >
                                    Set Active
                                  </button>
                                )}
                                <button
                                  onClick={() => setEditingStudy({ id: study.id, name: study.name, book: study.book })}
                                  className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50
                                           border border-scripture-border/50 text-scripture-text rounded-lg transition-all duration-200"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteStudyId(study.id)}
                                  className="px-3 py-2 text-sm font-ui text-scripture-errorText hover:text-scripture-error transition-colors underline"
                                >
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Help Tab */}
          {activeTab === 'help' && (
            <div role="tabpanel" id="settings-tabpanel-help" aria-labelledby="settings-tab-help">
            <div className="space-y-0">
              <div className="p-4">
                <AboutSection checkForUpdates={checkForUpdates} onCheckForUpdatesChange={handleCheckForUpdatesChange} />
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              <div className="p-4">
                <GettingStartedSection />
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              <div className="p-4">
                <div className="mb-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Onboarding</h3>
                  <button
                    onClick={async () => {
                      // Reset onboarding state
                      await getPreferences(); // ensure prefs loaded before partial update
                      await updatePreferences({
                        onboarding: {
                          hasSeenWelcome: false,
                          hasCompletedTour: false,
                          dismissedTooltips: [],
                        },
                      });
                      // Dispatch event to trigger tour restart
                      window.dispatchEvent(new CustomEvent('restartOnboarding'));
                      onClose();
                    }}
                    className="w-full px-3 py-2 text-sm font-ui bg-scripture-surface border border-scripture-overlayBorder
                             hover:bg-scripture-overlay/50 text-scripture-text rounded-lg transition-colors"
                  >
                    Restart Welcome & Tour
                  </button>
                  <p className="text-xs text-scripture-muted mt-2">
                    Show the welcome screen and guided tour again
                  </p>
                </div>
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              <div className="p-4">
                <KeyboardShortcutsHelp />
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              <div className="p-4">
                <div className="mb-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Developer</h3>
                  <p className="text-xs text-scripture-muted mb-4">
                    Enable detailed console logging for debugging keyword matching and verse rendering issues.
                  </p>
                  
                  <div className="space-y-3">
                    <label className="flex items-center justify-between p-3 bg-scripture-surface border border-scripture-border/50 rounded-lg hover:bg-scripture-elevated transition-colors cursor-pointer">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-scripture-text">Keyword Matching</div>
                        <div className="text-xs text-scripture-muted mt-0.5">
                          Log keyword matching process, matches found, and overlap detection
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={debugKeywordMatching}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          setDebugKeywordMatching(newValue);
                          await updatePreferences({
                            debug: {
                              keywordMatching: newValue,
                              verseText: debugVerseText,
                            },
                          });
                          clearDebugFlagsCache();
                          // Re-populate cache with new value
                          await getDebugFlags();
                        }}
                        className="ml-4 w-5 h-5 text-scripture-accent bg-scripture-elevated border-scripture-border rounded focus:ring-2 focus:ring-scripture-accent/50 cursor-pointer"
                      />
                    </label>
                    
                    <label className="flex items-center justify-between p-3 bg-scripture-surface border border-scripture-border/50 rounded-lg hover:bg-scripture-elevated transition-colors cursor-pointer">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-scripture-text">Verse Text Rendering</div>
                        <div className="text-xs text-scripture-muted mt-0.5">
                          Log virtual annotation creation, filtering, and preset information
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={debugVerseText}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          setDebugVerseText(newValue);
                          await updatePreferences({
                            debug: {
                              keywordMatching: debugKeywordMatching,
                              verseText: newValue,
                            },
                          });
                          clearDebugFlagsCache();
                          // Re-populate cache with new value
                          await getDebugFlags();
                        }}
                        className="ml-4 w-5 h-5 text-scripture-accent bg-scripture-elevated border-scripture-border rounded focus:ring-2 focus:ring-scripture-accent/50 cursor-pointer"
                      />
                    </label>
                  </div>
                  
                  <p className="text-xs text-scripture-muted mt-3">
                    Debug logs will appear in the browser console (F12 → Console tab). Refresh the page after toggling for changes to take effect.
                  </p>
                </div>
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              <div className="p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Bible Translations</h3>
                <div className="space-y-3 text-xs text-scripture-muted">
                  <div>
                    <span className="font-medium text-scripture-text">SWORD Modules</span>
                    {' — '}Offline Bible modules from{' '}
                    <a href="https://crosswire.org" target="_blank" rel="noopener noreferrer" className="text-scripture-accent hover:underline">CrossWire</a>
                    . NASB, KJV, ASV, WEB.
                  </div>
                  <div>
                    <span className="font-medium text-scripture-text">NASB</span>
                    {' — '}New American Standard Bible. Copyright The Lockman Foundation.{' '}
                    <a
                      href={LOCKMAN_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-scripture-accent hover:underline"
                      onClick={(e) => {
                        e.preventDefault();
                        import('@/lib/platform').then(({ openUrl }) => openUrl(LOCKMAN_URL));
                      }}
                    >
                      lockman.org
                    </a>
                  </div>
                  <div>
                    <span className="font-medium text-scripture-text">ESV API</span>
                    {' — '}Crossway. Free for personal use with attribution.{' '}
                    <a href="https://api.esv.org/docs/" target="_blank" rel="noopener noreferrer" className="text-scripture-accent hover:underline">Docs →</a>
                    <p className="mt-1">Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers.</p>
                  </div>
                </div>
                <p className="text-xs text-scripture-muted mt-4">
                  Bible text is subject to the respective terms and copyrights of each translation. This application is provided for personal Bible study use.
                </p>
              </div>
            </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>

    </>
  );
}
