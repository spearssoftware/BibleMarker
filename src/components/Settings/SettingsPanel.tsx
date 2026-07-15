/**
 * Settings Panel Component
 * 
 * Comprehensive settings interface for the Bible study app.
 */

import { useState, useEffect } from 'react';
import { getBookById, BIBLE_BOOKS } from '@/types';
import { updatePreferences, getPreferences } from '@/lib/database';
import { saveStudyObservationPdf, openSavedPdf } from '@/lib/observation-pdf';
import { exportStudyData } from '@/lib/export';
import type { Study } from '@/types';
import { applyTheme } from '@/lib/theme';
import { clearDebugFlagsCache, getDebugFlags } from '@/lib/debug';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { AboutSection } from './AboutSection';
import { AppearanceSection } from './AppearanceSection';
import { BibleSection } from './BibleSection';
import { DataSection } from './DataSection';
import { GettingStartedSection } from './GettingStartedSection';
import { Button, ConfirmationDialog, Input, DropdownSelect } from '@/components/shared';
import { useStudyStore } from '@/stores/studyStore';
import { LOCKMAN_URL } from '@/lib/bible-api';

export type SettingsTab = 'appearance' | 'bible' | 'data' | 'studies' | 'help';

interface SettingsPanelProps {
  onClose: () => void;
  initialTab?: SettingsTab;
}

export function SettingsPanel({ onClose, initialTab = 'appearance' }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [theme, setTheme] = useState<'dark' | 'light' | 'auto'>('dark');
  const [highContrast, setHighContrast] = useState(false);
  const [debugKeywordMatching, setDebugKeywordMatching] = useState(false);
  const [debugVerseText, setDebugVerseText] = useState(false);
  const [forceSyncEnabled, setForceSyncEnabled] = useState(false);
  const [checkForUpdates, setCheckForUpdates] = useState(true);

  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);

  // Study PDF export state (per-study, Studies tab)
  const [exportingStudyPdfId, setExportingStudyPdfId] = useState<string | null>(null);
  const [studyPdfError, setStudyPdfError] = useState<string | null>(null);

  // Study Markdown export state (all studies, Studies tab)
  const [isExportingStudy, setIsExportingStudy] = useState(false);
  const [studyExportError, setStudyExportError] = useState<string | null>(null);
  const [studyExportSuccess, setStudyExportSuccess] = useState<string | boolean>(false);

  // Studies state
  const { studies, activeStudyId, loadStudies, createStudy, updateStudy, deleteStudy, setActiveStudy } = useStudyStore();
  const [newStudyName, setNewStudyName] = useState('');
  const [newStudyBook, setNewStudyBook] = useState<string>('');
  const [editingStudy, setEditingStudy] = useState<{ id: string; name: string; book?: string } | null>(null);
  const [confirmDeleteStudyId, setConfirmDeleteStudyId] = useState<string | null>(null);

  // Load current preferences
  useEffect(() => {
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
        if (prefs.debug?.forceSyncEnabled !== undefined) {
          setForceSyncEnabled(prefs.debug.forceSyncEnabled);
        }
        if (prefs.checkForUpdates !== undefined) {
          setCheckForUpdates(prefs.checkForUpdates);
        }
        // Initialize debug flags cache so getDebugFlagsSync() works
        await getDebugFlags();
        applyTheme(prefs.theme || 'auto', prefs.highContrast || false);
      } catch (error) {
        console.error('Error loading preferences:', error);
      } finally {
        setIsLoadingPrefs(false);
      }
    }
    loadPrefs();
  }, []);

  // Load studies when studies tab is active
  useEffect(() => {
    if (activeTab === 'studies') {
      loadStudies();
    }
  }, [activeTab, loadStudies]);

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'bible', label: 'Bible', icon: '📖' },
    { id: 'data', label: 'Backup & Sync', icon: '💾' },
    { id: 'studies', label: 'Studies', icon: '📝' },
    { id: 'help', label: 'Help', icon: '❓' },
  ];

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

  // Export a single study's observation report PDF, scoped to that study.
  const handleExportStudyPdf = async (study: Study) => {
    setExportingStudyPdfId(study.id);
    setStudyPdfError(null);
    try {
      const result = await saveStudyObservationPdf(study);
      // On success the saved PDF opens in the system viewer — that's the feedback.
      if ('path' in result) await openSavedPdf(result.path).catch(() => {});
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to export study PDF';
      setStudyPdfError(`${study.name}: ${msg}`);
    } finally {
      setExportingStudyPdfId(null);
    }
  };

  // Export all study notes as a single Markdown document.
  const handleExportStudy = async () => {
    setIsExportingStudy(true);
    setStudyExportError(null);
    setStudyExportSuccess(false);

    try {
      const result = await exportStudyData();
      setStudyExportSuccess(result || true);
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

  return (
    <>
      <div
        className="flex-1 min-h-0 flex flex-col overflow-hidden relative"
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
      >
        {/* Tabs */}
        <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 border-b border-scripture-border/30 min-w-0" role="tablist" aria-label="Settings sections">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto">
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
                <span className={`text-xs ${activeTab === tab.id ? 'inline' : 'hidden'}`}>{tab.label}</span>
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
            <AppearanceSection
              theme={theme}
              highContrast={highContrast}
              onThemeChange={handleThemeChange}
              onHighContrastChange={handleHighContrastChange}
            />
          )}

          {/* Bible Tab */}
          {activeTab === 'bible' && <BibleSection />}

          {/* Data Tab */}
          {activeTab === 'data' && <DataSection />}

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
                        { value: '', label: 'All books' },
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
                  {studyPdfError && (
                    <p className="text-sm text-scripture-error mb-3">{studyPdfError}</p>
                  )}
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
                                  {study.book ? `Scoped to: ${getBookById(study.book)?.name || study.book}` : 'All books'}
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
                                  onClick={() => handleExportStudyPdf(study)}
                                  disabled={exportingStudyPdfId === study.id}
                                  className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50
                                           border border-scripture-border/50 text-scripture-text rounded-lg transition-all duration-200
                                           disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Export this study's observations as a PDF"
                                >
                                  {exportingStudyPdfId === study.id ? 'Exporting…' : 'Export PDF'}
                                </button>
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

                <div className="border-t border-scripture-border/30 my-4"></div>

                {/* Export study notes (all studies, Markdown) */}
                <div className="p-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text mb-1">Export study notes</h3>
                  <p className="text-sm text-scripture-muted mb-4">
                    Save all your study notes (observations, interpretations, and applications) as a readable Markdown document, organized by book and chapter. For a single study as a PDF, use Export PDF above.
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
                        <span>Export Study Notes (Markdown)</span>
                      </>
                    )}
                  </button>

                  {studyExportSuccess && (
                    <div className="mt-3 p-3 bg-scripture-successBg border border-scripture-success/30 rounded-lg text-scripture-successText text-sm">
                      ✓ Study notes exported successfully!{typeof studyExportSuccess === 'string' && (
                        <> Saved to Documents/{studyExportSuccess}</>
                      )}
                    </div>
                  )}

                  {studyExportError && (
                    <div className="mt-3 p-3 bg-scripture-errorBg border border-scripture-error/30 rounded-lg text-scripture-errorText text-sm">
                      ✗ {studyExportError}
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
                <AboutSection
                  checkForUpdates={checkForUpdates}
                  onCheckForUpdatesChange={handleCheckForUpdatesChange}
                />
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              <div className="p-4">
                <GettingStartedSection />
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              <div className="p-4">
                <KeyboardShortcutsHelp />
              </div>

              <div className="border-t border-scripture-border/30 my-4"></div>

              <div className="p-4">
                <div className="mb-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Onboarding</h3>
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={async () => {
                      await getPreferences();
                      await updatePreferences({
                        onboarding: {
                          hasSeenWelcome: false,
                          hasCompletedTour: false,
                          dismissedTooltips: [],
                        },
                      });
                      window.dispatchEvent(new CustomEvent('restartOnboarding'));
                      onClose();
                    }}
                  >
                    Restart Welcome & Tour
                  </Button>
                  <p className="text-xs text-scripture-muted mt-2">
                    Show the welcome screen and guided tour again
                  </p>
                </div>
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
                              forceSyncEnabled,
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
                              forceSyncEnabled,
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
                        <div className="text-sm font-medium text-scripture-text">Force-Enable Sync</div>
                        <div className="text-xs text-scripture-muted mt-0.5">
                          Sync is disabled by default on dev builds. Enable to test sync changes.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={forceSyncEnabled}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          setForceSyncEnabled(newValue);
                          await updatePreferences({
                            debug: {
                              keywordMatching: debugKeywordMatching,
                              verseText: debugVerseText,
                              forceSyncEnabled: newValue,
                            },
                          });
                          clearDebugFlagsCache();
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
