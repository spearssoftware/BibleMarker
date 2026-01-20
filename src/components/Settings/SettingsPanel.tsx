/**
 * Settings Panel Component
 * 
 * Comprehensive settings interface for the Bible study app.
 */

import { useState, useEffect } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useBibleStore } from '@/stores/bibleStore';
import { getBookById } from '@/types/bible';
import { updatePreferences, clearBookAnnotations, clearDatabase, getPreferences } from '@/lib/db';
import { ModuleManager } from '@/components/MarkingToolbar/ModuleManager';
import { StudyManager } from '@/components/Study';
import { BackupRestore } from './BackupRestore';

type SettingsTab = 'appearance' | 'bible' | 'studies' | 'data';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const { fontSize, setFontSize } = useAnnotationStore();
  const { currentBook, currentModuleId } = useBibleStore();
  const [theme, setTheme] = useState<'dark' | 'light' | 'auto'>('dark');
  const [isClearing, setIsClearing] = useState(false);
  const [showModuleManager, setShowModuleManager] = useState(false);
  const [showStudyManager, setShowStudyManager] = useState(false);
  const [showBackupRestore, setShowBackupRestore] = useState(false);

  // Load current preferences
  useEffect(() => {
    async function loadPrefs() {
      try {
        const prefs = await getPreferences();
        if (prefs.theme) {
          setTheme(prefs.theme);
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    }
    loadPrefs();
  }, []);

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'bible', label: 'Bible', icon: '📖' },
    { id: 'studies', label: 'Studies', icon: '📚' },
    { id: 'data', label: 'Data', icon: '💾' },
  ];

  const fontSizes: Array<{ size: 'sm' | 'base' | 'lg' | 'xl'; label: string }> = [
    { size: 'sm', label: 'Small' },
    { size: 'base', label: 'Medium' },
    { size: 'lg', label: 'Large' },
    { size: 'xl', label: 'Extra Large' },
  ];

  const themes: Array<{ value: 'dark' | 'light' | 'auto'; label: string; description: string }> = [
    { value: 'dark', label: 'Dark', description: 'Dark theme (default)' },
    { value: 'light', label: 'Light', description: 'Light theme' },
    { value: 'auto', label: 'Auto', description: 'Follow system preference' },
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
    try {
      await updatePreferences({ theme: newTheme });
      // TODO: Apply theme to document (theme implementation needed)
      // This is a placeholder - full theme implementation is planned but not yet complete
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

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
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
          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
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

              <div>
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Theme</h3>
                <div className="space-y-2">
                  {themes.map((t) => (
                    <label
                      key={t.value}
                      className="flex items-start gap-3 p-3 rounded-lg bg-scripture-elevated/50 border border-scripture-border/30 hover:bg-scripture-elevated cursor-pointer transition-colors"
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={t.value}
                        checked={theme === t.value}
                        onChange={() => handleThemeChange(t.value)}
                        className="mt-1 w-4 h-4 text-scripture-accent focus:ring-scripture-accent"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-scripture-text">{t.label}</div>
                        <div className="text-xs text-scripture-muted">{t.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-scripture-muted mt-2">
                  Theme implementation is in progress. Auto mode will follow your system preference.
                </p>
              </div>
            </div>
          )}

          {/* Bible Tab */}
          {activeTab === 'bible' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Bible Translations</h3>
                <p className="text-sm text-scripture-muted mb-4">
                  Manage your Bible translations, configure API keys, and set default translations.
                </p>
                <button
                  onClick={() => setShowModuleManager(true)}
                  className="w-full px-4 py-3 bg-scripture-accent text-white rounded-lg hover:bg-scripture-accent/90 
                           transition-all duration-200 font-ui font-medium shadow-md hover:shadow-lg"
                >
                  📖 Open Translation Manager
                </button>
              </div>
            </div>
          )}

          {/* Studies Tab */}
          {activeTab === 'studies' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Study Management</h3>
                <p className="text-sm text-scripture-muted mb-4">
                  Create and manage studies to organize your keyword markings by book or topic.
                </p>
                <button
                  onClick={() => setShowStudyManager(true)}
                  className="w-full px-4 py-3 bg-scripture-accent text-white rounded-lg hover:bg-scripture-accent/90 
                           transition-all duration-200 font-ui font-medium shadow-md hover:shadow-lg"
                >
                  📚 Open Study Manager
                </button>
              </div>
            </div>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Backup & Restore</h3>
                <p className="text-sm text-scripture-muted mb-4">
                  Export all your study data to a JSON file, or restore from a previous backup. 
                  Save to your cloud folder (iCloud Drive, Google Drive, etc.) for automatic syncing.
                </p>
                <button
                  onClick={() => setShowBackupRestore(true)}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-600/90 
                           transition-all duration-200 font-ui font-medium shadow-md hover:shadow-lg"
                >
                  💾 Open Backup & Restore
                </button>
              </div>

              <div className="border-t border-scripture-border/50 pt-6">
                <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Clear Data</h3>
                
                <div className="space-y-3">
                  <div>
                    <button
                      onClick={handleClearBook}
                      className="w-full px-4 py-2.5 text-left rounded-xl bg-orange-600/20 
                               hover:bg-orange-600/30 text-orange-400 transition-all duration-200 
                               flex items-center gap-2 text-sm font-ui font-medium 
                               border border-orange-600/30 shadow-sm hover:shadow"
                    >
                      <span>🗑️</span>
                      <span>Clear Highlights for {getBookById(currentBook)?.name || currentBook}</span>
                    </button>
                    <p className="text-xs text-scripture-muted mt-1 ml-6">
                      Remove all highlights and annotations for the current book
                    </p>
                  </div>

                  <div>
                    <button
                      onClick={handleClearDatabase}
                      disabled={isClearing}
                      className="w-full px-4 py-2.5 text-left rounded-xl bg-red-600/20 
                               hover:bg-red-600/30 text-red-400 disabled:opacity-50 
                               disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2
                               text-sm font-ui font-medium border border-red-600/30 shadow-sm hover:shadow"
                    >
                      <span>🗑️</span>
                      <span>{isClearing ? 'Clearing...' : 'Clear All Data'}</span>
                    </button>
                    <p className="text-xs text-scripture-muted mt-1 ml-6">
                      Remove all annotations, notes, and cached Bible text (for testing)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Module Manager Modal */}
      {showModuleManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <ModuleManager 
            onClose={() => setShowModuleManager(false)}
            onTranslationsUpdated={() => {
              window.dispatchEvent(new Event('translationsUpdated'));
            }}
          />
        </div>
      )}

      {/* Study Manager Modal */}
      {showStudyManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <StudyManager onClose={() => setShowStudyManager(false)} />
        </div>
      )}

      {/* Backup & Restore Modal */}
      {showBackupRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <BackupRestore onClose={() => setShowBackupRestore(false)} />
        </div>
      )}
    </>
  );
}
