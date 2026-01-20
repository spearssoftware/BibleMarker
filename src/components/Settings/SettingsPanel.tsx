/**
 * Settings Panel Component
 * 
 * Comprehensive settings interface for the Bible study app.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useBibleStore } from '@/stores/bibleStore';
import { getBookById, BIBLE_BOOKS } from '@/types/bible';
import { updatePreferences, clearBookAnnotations, clearDatabase, getPreferences } from '@/lib/db';
import { useStudyStore } from '@/stores/studyStore';
import { exportBackup, importBackup, restoreBackup, validateBackup, getBackupPreview, type BackupData } from '@/lib/backup';
import { applyTheme } from '@/lib/theme';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { AboutSection } from './AboutSection';
import { GettingStartedSection } from './GettingStartedSection';
import {
  bibliaClient,
  bibleGatewayClient,
  esvClient,
  getBibleClient,
  clearTranslationsCache,
  saveApiConfig as saveApiConfigToDb,
  BIBLEGATEWAY_ENABLED,
} from '@/lib/bible-api';

type SettingsTab = 'appearance' | 'bible' | 'studies' | 'data' | 'help';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const { fontSize, setFontSize } = useAnnotationStore();
  const { currentBook, currentModuleId } = useBibleStore();
  const [theme, setTheme] = useState<'dark' | 'light' | 'auto'>('dark');
  const [isClearing, setIsClearing] = useState(false);

  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  
  // Backup/Restore state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [includeCache, setIncludeCache] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  
  const [importStep, setImportStep] = useState<'select' | 'preview' | 'restoring'>('select');
  const [backupPreview, setBackupPreview] = useState<BackupData | null>(null);
  const [previewCounts, setPreviewCounts] = useState<Record<string, number> | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge' | 'selective'>('replace');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  
  // Study management state
  const { studies, activeStudyId, loadStudies, createStudy, updateStudy, deleteStudy, setActiveStudy } = useStudyStore();
  const [editingStudy, setEditingStudy] = useState<{ id: string; name: string; book?: string } | null>(null);
  const [newStudyName, setNewStudyName] = useState('');
  const [newStudyBook, setNewStudyBook] = useState<string>('');
  
  // API Configuration state
  const [bibliaApiKey, setBibliaApiKey] = useState('');
  const [esvApiKey, setEsvApiKey] = useState('');
  const [bibleGatewayUsername, setBibleGatewayUsername] = useState('');
  const [bibleGatewayPassword, setBibleGatewayPassword] = useState('');
  const [savingApi, setSavingApi] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Load current preferences
  useEffect(() => {
    async function loadPrefs() {
      try {
        setIsLoadingPrefs(true);
        const prefs = await getPreferences();
        if (prefs.theme) {
          setTheme(prefs.theme);
          applyTheme(prefs.theme);
        }
        // Load API configs
        if (prefs.apiConfigs) {
          const bibliaConfig = prefs.apiConfigs.find(c => c.provider === 'biblia');
          const esvConfig = prefs.apiConfigs.find(c => c.provider === 'esv');
          const bibleGatewayConfig = prefs.apiConfigs.find(c => c.provider === 'biblegateway');
          if (bibliaConfig?.apiKey) setBibliaApiKey(bibliaConfig.apiKey);
          if (esvConfig?.apiKey) setEsvApiKey(esvConfig.apiKey);
          if (BIBLEGATEWAY_ENABLED && bibleGatewayConfig) {
            setBibleGatewayUsername(bibleGatewayConfig.username || '');
            setBibleGatewayPassword(bibleGatewayConfig.password || '');
          }
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
      } finally {
        setIsLoadingPrefs(false);
      }
    }
    loadPrefs();
    loadStudies();
  }, [loadStudies]);

  const handleCreateStudy = async () => {
    if (!newStudyName.trim()) return;
    
    await createStudy(newStudyName.trim(), newStudyBook || undefined);
    setNewStudyName('');
    setNewStudyBook('');
  };

  const handleUpdateStudy = async () => {
    if (!editingStudy || !editingStudy.name.trim()) return;
    
    const study = studies.find(s => s.id === editingStudy.id);
    if (!study) return;
    
    await updateStudy({
      ...study,
      name: editingStudy.name.trim(),
      book: editingStudy.book || undefined,
    });
    setEditingStudy(null);
  };

  const handleDeleteStudy = async (studyId: string) => {
    if (!confirm('Are you sure you want to delete this study? This will not delete keywords, only the study grouping.')) {
      return;
    }
    
    await deleteStudy(studyId);
  };

  async function saveApiConfig(
    provider: 'biblia' | 'esv' | 'biblegateway',
    apiKeyOrCreds: string | { username: string; password: string }
  ) {
    setSavingApi(true);
    setApiError(null);
    try {
      let configToSave: any;
      if (provider === 'biblegateway') {
        const { username, password } = apiKeyOrCreds as { username: string; password: string };
        configToSave = {
          provider: 'biblegateway' as const,
          username,
          password,
          enabled: !!(username && password),
        };
      } else {
        const apiKey = apiKeyOrCreds as string;
        configToSave = {
          provider: provider as 'biblia' | 'esv',
          apiKey,
          enabled: apiKey.length > 0,
        };
      }

      await saveApiConfigToDb(configToSave);

      // Update local state
      if (provider === 'biblia') {
        setBibliaApiKey(apiKeyOrCreds as string);
      } else if (provider === 'esv') {
        setEsvApiKey(apiKeyOrCreds as string);
      } else if (provider === 'biblegateway') {
        setBibleGatewayUsername((apiKeyOrCreds as { username: string; password: string }).username);
        setBibleGatewayPassword((apiKeyOrCreds as { username: string; password: string }).password);
      }

      // Clear cache to reflect changes
      await clearTranslationsCache();
      window.dispatchEvent(new Event('translationsUpdated'));
    } catch (err) {
      console.error('Failed to save API config:', err);
      setApiError(err instanceof Error ? err.message : 'Failed to save API config');
    } finally {
      setSavingApi(false);
    }
  }


  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'bible', label: 'Bible', icon: '📖' },
    { id: 'studies', label: 'Studies', icon: '📚' },
    { id: 'data', label: 'Data', icon: '💾' },
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
    console.log('[SettingsPanel] Theme change requested:', newTheme);
    setTheme(newTheme);
    applyTheme(newTheme);
    try {
      await updatePreferences({ theme: newTheme });
      console.log('[SettingsPanel] Theme preference saved:', newTheme);
    } catch (error) {
      console.error('Error updating theme:', error);
    }
  };

  const handleClearBook = async () => {
    const bookInfo = getBookById(currentBook);
    const bookName = bookInfo?.name || currentBook;
    if (confirm(`Clear all highlights and annotations for ${bookName}? This action cannot be undone.`)) {
      try {
        const count = await clearBookAnnotations(currentBook, currentModuleId || undefined);
        alert(`Cleared ${count} annotation${count !== 1 ? 's' : ''} for ${bookName}`);
        // Reload annotations to reflect changes
        window.dispatchEvent(new CustomEvent('annotationsUpdated'));
      } catch (error) {
        alert('Failed to clear annotations: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }
  };

  const handleClearDatabase = async () => {
    if (!confirm('Are you sure you want to clear all annotations, notes, and cache? This cannot be undone.')) {
      return;
    }
    
    setIsClearing(true);
    try {
      await clearDatabase();
      alert('Database cleared successfully!');
      // Reload the page to refresh the UI
      window.location.reload();
    } catch (error) {
      console.error('Error clearing database:', error);
      alert('Error clearing database. Check console for details.');
      setIsClearing(false);
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
      
      // Reload page after a delay
      setTimeout(() => {
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
    <>
      <div className="flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 border-b border-scripture-border/50 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-ui font-semibold text-scripture-text">Settings</h2>
            <button
              onClick={onClose}
              className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-4 py-2 rounded-lg text-sm font-ui font-medium transition-all
                  ${activeTab === tab.id
                    ? 'bg-scripture-accent text-scripture-bg shadow-md'
                    : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'
                  }
                `}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
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
            <div className="space-y-6">
              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Font Size</h3>
                <div className="grid grid-cols-4 gap-2">
                  {fontSizes.map((fs) => (
                    <button
                      key={fs.size}
                      onClick={() => handleFontSizeChange(fs.size)}
                      className={`px-3 py-2 rounded-lg font-ui text-sm transition-all duration-200 text-center
                                ${fontSize === fs.size
                                  ? 'bg-scripture-accent text-scripture-bg shadow-md scale-105'
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

              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Theme</h3>
                <div className="grid grid-cols-3 gap-2">
                  {themes.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => handleThemeChange(t.value)}
                      className={`px-3 py-2 rounded-lg font-ui text-sm transition-all duration-200 text-center
                                ${theme === t.value
                                  ? 'bg-scripture-accent text-scripture-bg shadow-md scale-105'
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
            </div>
          )}

          {/* Bible Tab */}
          {activeTab === 'bible' && (
            <div className="space-y-6">
              {apiError && (
                <div className="bg-scripture-errorBg border border-scripture-error/30 rounded-lg p-3 text-scripture-errorText text-sm">
                  {apiError}
                </div>
              )}

              {/* getBible API Section */}
              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text">getBible API</h3>
                  <span className="text-xs px-2 py-1 bg-scripture-successBg text-scripture-successText rounded border border-scripture-success/30">
                    Free • No API Key Required
                  </span>
                </div>
                <p className="text-sm text-scripture-muted mb-0">
                  Free, open-source Bible API with many translations available. No configuration needed.
                </p>
              </div>

              {/* Biblia API Section */}
              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text">Biblia API</h3>
                  {bibliaClient.isConfigured() ? (
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
                  Get a free API key from Biblia.com. Free tier allows 5,000 requests/day.
                  <br />
                  <strong>Available translations:</strong> LEB, Darby, Young's Literal Translation, Emphasized Bible (unique to Biblia).
                </p>
                <div className="mb-3 space-y-2">
                  <a 
                    href="https://api.biblia.com/v1/Users/SignIn" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                             hover:bg-scripture-accent/90 transition-all duration-200 shadow-md text-center"
                  >
                    Sign In / Register at api.biblia.com
                  </a>
                  <a 
                    href="https://bibliaapi.com/docs/API_Keys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block text-xs text-scripture-accent hover:underline text-center"
                  >
                    View API Key Documentation
                  </a>
                </div>
                <div className="mb-4 p-3 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                  <p className="text-xs text-scripture-text mb-1">
                    <strong>How to get your API key:</strong>
                  </p>
                  <ol className="text-xs text-scripture-muted list-decimal list-inside space-y-1">
                    <li>Click "Sign In / Register" above</li>
                    <li>Create a free account or sign in</li>
                    <li>From your account, create a new API key for this application</li>
                    <li>Copy your API key and paste it below</li>
                  </ol>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={bibliaApiKey}
                    onChange={(e) => setBibliaApiKey(e.target.value)}
                    placeholder={bibliaClient.isConfigured() ? "Edit your Biblia API key" : "Paste your Biblia API key here"}
                    className="flex-1 px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                             rounded-lg focus:outline-none focus:border-scripture-accent
                             text-scripture-text placeholder-scripture-muted"
                  />
                  <button
                    onClick={() => saveApiConfig('biblia', bibliaApiKey)}
                    disabled={savingApi}
                    className="px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                             hover:bg-scripture-accent/90 transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingApi ? 'Saving...' : bibliaClient.isConfigured() ? 'Update' : 'Save'}
                  </button>
                </div>
                {bibliaClient.isConfigured() && (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to remove the Biblia API key?')) {
                        saveApiConfig('biblia', '');
                        setBibliaApiKey('');
                      }
                    }}
                    className="text-xs text-scripture-errorText hover:text-scripture-error underline"
                  >
                    Remove API Key
                  </button>
                )}
              </div>

              {/* BibleGateway API Section */}
              {BIBLEGATEWAY_ENABLED && (
                <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-ui font-semibold text-scripture-text">BibleGateway API</h3>
                    {bibleGatewayClient.isConfigured() ? (
                      <span className="text-xs px-2 py-1 bg-scripture-successBg text-scripture-successText border border-scripture-success/30 rounded">
                        ✓ Configured
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 bg-scripture-warningBg text-scripture-warningText border border-scripture-warning/30 rounded">
                        Account Required
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-scripture-muted mb-4">
                    Use the same <strong>username</strong> (or email) and <strong>password</strong> you use to sign in at BibleGateway.com. There is no separate API signup or "enable" step—the API uses your regular account. Supports <strong>NASB</strong>, <strong>NIV</strong>, ESV, and many other translations.
                  </p>
                  <a
                    href="https://www.biblegateway.com/api/documentation"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mb-4 text-xs text-scripture-accent hover:underline"
                  >
                    BibleGateway API Documentation
                  </a>
                  <div className="mb-4 flex flex-col gap-2">
                    <input
                      type="text"
                      value={bibleGatewayUsername}
                      onChange={(e) => setBibleGatewayUsername(e.target.value)}
                      placeholder="BibleGateway username"
                      className="px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg
                               focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted"
                    />
                    <input
                      type="password"
                      value={bibleGatewayPassword}
                      onChange={(e) => setBibleGatewayPassword(e.target.value)}
                      placeholder="BibleGateway password"
                      className="px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg
                               focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveApiConfig('biblegateway', { username: bibleGatewayUsername, password: bibleGatewayPassword })}
                      disabled={savingApi}
                      className="px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                               hover:bg-scripture-accent/90 transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingApi ? 'Saving...' : bibleGatewayClient.isConfigured() ? 'Update' : 'Save'}
                    </button>
                  </div>
                  {bibleGatewayClient.isConfigured() && (
                    <button
                      onClick={() => {
                        if (confirm('Remove BibleGateway credentials?')) {
                          saveApiConfig('biblegateway', { username: '', password: '' });
                          setBibleGatewayUsername('');
                          setBibleGatewayPassword('');
                        }
                      }}
                      className="text-xs text-scripture-errorText hover:text-scripture-error underline"
                    >
                      Remove credentials
                    </button>
                  )}
                </div>
              )}

              {/* ESV API Section */}
              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text">ESV API</h3>
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
                  Get a free API key from ESV.org. Alternative to Biblia for ESV with generous limits for personal use.
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
                  <input
                    type="text"
                    value={esvApiKey}
                    onChange={(e) => setEsvApiKey(e.target.value)}
                    placeholder={esvClient.isConfigured() ? "Edit your ESV API key" : "Paste your ESV API key here"}
                    className="flex-1 px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                             rounded-lg focus:outline-none focus:border-scripture-accent
                             text-scripture-text placeholder-scripture-muted"
                  />
                  <button
                    onClick={() => saveApiConfig('esv', esvApiKey)}
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
                        saveApiConfig('esv', '');
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
          )}

          {/* Studies Tab */}
          {activeTab === 'studies' && (
            <div className="space-y-6">
              {/* Create new study */}
              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Create New Study</h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newStudyName}
                    onChange={(e) => setNewStudyName(e.target.value)}
                    placeholder="Study name (e.g., 'John - Character Study')"
                    className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateStudy();
                      }
                    }}
                  />
                  <select
                    value={newStudyBook}
                    onChange={(e) => setNewStudyBook(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                  >
                    <option value="">All books (global study)</option>
                    {BIBLE_BOOKS.map(book => (
                      <option key={book.id} value={book.id}>{book.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleCreateStudy}
                    disabled={!newStudyName.trim()}
                    className="w-full px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg 
                             hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed 
                             transition-all duration-200 shadow-md"
                  >
                    Create Study
                  </button>
                </div>
              </div>

              {/* Studies list */}
              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text">Your Studies</h3>
                  {activeStudyId && (
                    <button
                      onClick={() => setActiveStudy(null)}
                      className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50 
                               border border-scripture-border/50 text-scripture-text rounded-lg 
                               transition-all duration-200"
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
                        className="p-4 bg-scripture-surface/50 rounded-lg border border-scripture-muted/20 flex items-center justify-between"
                      >
                        {editingStudy?.id === study.id ? (
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              value={editingStudy.name}
                              onChange={(e) => setEditingStudy({ ...editingStudy, name: e.target.value })}
                              className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleUpdateStudy();
                                } else if (e.key === 'Escape') {
                                  setEditingStudy(null);
                                }
                              }}
                            />
                            <select
                              value={editingStudy.book || ''}
                              onChange={(e) => setEditingStudy({ ...editingStudy, book: e.target.value || undefined })}
                              className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                            >
                              <option value="">All books</option>
                              {BIBLE_BOOKS.map(book => (
                                <option key={book.id} value={book.id}>{book.name}</option>
                              ))}
                            </select>
                            <div className="flex gap-2">
                              <button
                                onClick={handleUpdateStudy}
                                className="px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg 
                                         hover:bg-scripture-accent/90 transition-all duration-200 shadow-md"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingStudy(null)}
                                className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50 
                                         border border-scripture-border/50 text-scripture-text rounded-lg 
                                         transition-all duration-200"
                              >
                                Cancel
                              </button>
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
                                         border border-scripture-border/50 text-scripture-text rounded-lg 
                                         transition-all duration-200"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteStudy(study.id)}
                                className="px-3 py-2 text-sm font-ui text-scripture-errorText hover:text-scripture-error 
                                         transition-colors underline"
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
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              {/* Export Section */}
              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Export Backup</h3>
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
                  className="w-full px-3 py-2 bg-scripture-accent text-scripture-bg rounded-lg hover:bg-scripture-accent/90 
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
              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Import/Restore Backup</h3>

                {importStep === 'select' && (
                  <>
                    <p className="text-sm text-scripture-muted mb-4">
                      Restore your study data from a previously exported backup file.
                    </p>

                    <button
                      onClick={handleImportSelect}
                      disabled={isImporting}
                      className="w-full px-3 py-2 bg-scripture-accent text-scripture-bg rounded-lg hover:bg-scripture-accent/90 
                               disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 
                               font-ui text-sm shadow-md flex items-center justify-center gap-2"
                    >
                      {isImporting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin"></div>
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
                    <div className="p-4 bg-scripture-surface/50 border border-scripture-border/50 rounded-xl">
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

                    <div className="bg-scripture-surface/50 border border-scripture-border/50 rounded-xl p-4">
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
                          className="flex-1 px-3 py-2 bg-scripture-warning text-white rounded-lg hover:bg-scripture-warning/90 
                                   disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 
                                   font-ui text-sm shadow-md"
                        >
                          {restoreMode === 'replace' 
                            ? '⚠️ Restore (Replace All Data)'
                            : restoreMode === 'merge'
                            ? '🔄 Merge Data'
                            : '✅ Restore Selected'}
                        </button>
                        <button
                          onClick={handleCancelImport}
                          className="px-3 py-2 bg-scripture-elevated hover:bg-scripture-border/50 border border-scripture-border/50 
                                   text-scripture-text rounded-lg transition-all duration-200 font-ui text-sm"
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

              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
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
          )}

          {/* Help Tab */}
          {activeTab === 'help' && (
            <div className="space-y-6">
              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <GettingStartedSection />
              </div>

              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <KeyboardShortcutsHelp />
              </div>

              <div className="bg-scripture-surface border border-scripture-border/50 rounded-xl p-4">
                <AboutSection />
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
