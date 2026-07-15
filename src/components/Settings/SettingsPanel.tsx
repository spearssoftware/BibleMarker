/**
 * Settings Panel Component
 * 
 * Comprehensive settings interface for the Bible study app.
 */

import { useState, useEffect } from 'react';
import { updatePreferences, getPreferences } from '@/lib/database';
import { applyTheme } from '@/lib/theme';
import { clearDebugFlagsCache, getDebugFlags } from '@/lib/debug';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { AboutSection } from './AboutSection';
import { AppearanceSection } from './AppearanceSection';
import { BibleSection } from './BibleSection';
import { DataSection } from './DataSection';
import { StudiesSection } from './StudiesSection';
import { GettingStartedSection } from './GettingStartedSection';
import { Button } from '@/components/shared';
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
          {activeTab === 'studies' && <StudiesSection />}

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
