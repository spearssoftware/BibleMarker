/**
 * Bible settings tab — translation language filter, default translation,
 * offline SWORD module downloads, and the ESV API key. Loads its own bible
 * preferences (API config, language filter, default translation), module
 * install statuses, and the available-translations list on mount, and owns the
 * `translationsUpdated` refresh listener.
 */

import { useState, useEffect } from 'react';
import { confirmDialog } from '@/stores/confirmDialogStore';
import { updatePreferences, getPreferences } from '@/lib/database';
import { Input, DropdownSelect, Checkbox } from '@/components/shared';
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

export function BibleSection() {
  // API Configuration state
  const [esvApiKey, setEsvApiKey] = useState('');
  const [savingApi, setSavingApi] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // SWORD module state
  const [moduleStatuses, setModuleStatuses] = useState<Record<string, 'installed' | 'downloading' | 'not-installed'>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  // Language filter state
  const [selectedLanguageCodes, setSelectedLanguageCodes] = useState<string[]>([]);

  // Default translation state
  const [defaultTranslation, setDefaultTranslation] = useState<string>('kjv');
  const [availableTranslations, setAvailableTranslations] = useState<ApiTranslation[]>([]);
  const [savingDefaultTranslation, setSavingDefaultTranslation] = useState(false);

  useEffect(() => {
    async function loadBiblePrefs() {
      try {
        const prefs = await getPreferences();

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

        // Load language filter (default to English when unset)
        setSelectedLanguageCodes(
          prefs.translationLanguageFilter !== undefined
            ? prefs.translationLanguageFilter
            : ['en']
        );

        // Load default translation (fallback to NASB)
        setDefaultTranslation(prefs.defaultTranslation || 'sword-NASB');

        // Load available translations
        const translations = await getAllTranslations();
        setAvailableTranslations(translations);
      } catch (error) {
        console.error('Error loading bible preferences:', error);
      }
    }
    loadBiblePrefs();

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
    return () => {
      window.removeEventListener('translationsUpdated', handleTranslationsUpdated);
    };
  }, []);

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
    if (!(await confirmDialog({ title: 'Remove module', message: 'Remove this Bible module? You can re-download it later.', confirmLabel: 'Remove' }))) return;
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

  return (
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
          <div className="flex-1 min-w-0">
            <Input
              type="text"
              value={esvApiKey}
              onChange={(e) => setEsvApiKey(e.target.value)}
              placeholder={esvClient.isConfigured() ? "Edit your ESV API key" : "Paste your ESV API key here"}
            />
          </div>
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
            onClick={async () => {
              if (await confirmDialog({ title: 'Remove API key', message: 'Are you sure you want to remove the ESV API key?', confirmLabel: 'Remove' })) {
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
  );
}
