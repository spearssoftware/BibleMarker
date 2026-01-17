/**
 * Module Manager Component
 * 
 * UI for downloading, installing, and managing SWORD Bible modules.
 * Also manages Bible API configurations for licensed translations (NASB, ESV).
 */

import { useState, useEffect } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { getInstalledModules, getPreferences, updatePreferences } from '@/lib/db';
import type { ApiConfigRecord } from '@/lib/db';
import { fetchCrossWireModules, downloadModule, installModuleFromZip } from '@/lib/sword/moduleDownloader';
import { isBundledModule } from '@/lib/sword/bundledModules';
import { 
  bibliaClient, 
  esvClient, 
  getAllTranslations,
  type ApiTranslation,
} from '@/lib/bible-api';
import type { RemoteModule } from '@/types/sword';
import type { InstalledModule } from '@/types/sword';

interface ModuleManagerProps {
  onClose: () => void;
}

type TabType = 'installed' | 'sword' | 'api';

export function ModuleManager({ onClose }: ModuleManagerProps) {
  const { currentModuleId, setCurrentModule, modules, setModules } = useBibleStore();
  const [activeTab, setActiveTab] = useState<TabType>('installed');
  const [installedModules, setInstalledModules] = useState<InstalledModule[]>([]);
  const [availableModules, setAvailableModules] = useState<RemoteModule[]>([]);
  const [apiTranslations, setApiTranslations] = useState<ApiTranslation[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [showInstallZip, setShowInstallZip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // API Configuration state
  const [bibliaApiKey, setBibliaApiKey] = useState('');
  const [esvApiKey, setEsvApiKey] = useState('');
  const [savingApi, setSavingApi] = useState(false);

  useEffect(() => {
    loadModules();
    loadApiConfigs();
  }, []);

  async function loadModules() {
    try {
      setLoading(true);
      const installed = await getInstalledModules();
      setInstalledModules(installed);
      setModules(installed);
      
      // Load available modules from repository
      const available = await fetchCrossWireModules();
      setAvailableModules(available);
      
      // Load API translations if configured
      const translations = await getAllTranslations();
      setApiTranslations(translations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  }

  async function loadApiConfigs() {
    try {
      const prefs = await getPreferences();
      if (prefs.apiConfigs) {
        const bibliaConfig = prefs.apiConfigs.find(c => c.provider === 'biblia');
        const esvConfig = prefs.apiConfigs.find(c => c.provider === 'esv');
        if (bibliaConfig?.apiKey) {
          setBibliaApiKey(bibliaConfig.apiKey);
        }
        if (esvConfig?.apiKey) {
          setEsvApiKey(esvConfig.apiKey);
        }
      }
    } catch (err) {
      console.error('Failed to load API configs:', err);
    }
  }

  async function saveApiConfig(provider: 'biblia' | 'esv', apiKey: string) {
    setSavingApi(true);
    try {
      const prefs = await getPreferences();
      const existingConfigs = prefs.apiConfigs || [];
      const updatedConfigs = existingConfigs.filter(c => c.provider !== provider);
      
      const newConfig: ApiConfigRecord = {
        provider,
        apiKey,
        enabled: apiKey.length > 0,
      };
      updatedConfigs.push(newConfig);
      
      await updatePreferences({ apiConfigs: updatedConfigs });
      
      // Apply the config immediately
      if (provider === 'biblia') {
        bibliaClient.configure(newConfig);
      } else if (provider === 'esv') {
        esvClient.configure(newConfig);
      }
      
      // Reload translations
      const translations = await getAllTranslations();
      setApiTranslations(translations);
      
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API config');
    } finally {
      setSavingApi(false);
    }
  }

  async function handleDownload(module: RemoteModule) {
    try {
      setDownloading(module.name);
      setProgress(0);
      setError(null);

      await downloadModule(module, (prog) => {
        setProgress(prog);
      });

      // Reload modules after download
      await loadModules();
      setDownloading(null);
      setProgress(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download module');
      setDownloading(null);
      setProgress(0);
    }
  }

  async function handleInstallFromZip(file: File) {
    try {
      const moduleId = file.name.replace(/\.zip$/i, '').toUpperCase();
      setDownloading(moduleId);
      setProgress(0);
      setError(null);

      await installModuleFromZip(file, moduleId, (prog) => {
        setProgress(prog);
      });

      await loadModules();
      setShowInstallZip(false);
      setDownloading(null);
      setProgress(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install module');
      setDownloading(null);
      setProgress(0);
    }
  }

  async function handleSwitchModule(moduleId: string, isApiTranslation = false) {
    if (!isApiTranslation) {
      // Check if module is actually installed before switching
      const module = installedModules.find(m => m.config.name === moduleId);
      if (!module || module.status !== 'installed') {
        setError(`Module ${moduleId} is not installed. Please download it first.`);
        return;
      }
    }
    setCurrentModule(moduleId);
    onClose();
  }

  function handleSelectApiTranslation(translation: ApiTranslation) {
    setCurrentModule(translation.id);
    onClose();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.zip')) {
      handleInstallFromZip(file);
    }
  }

  // Filter out modules that are already installed
  // Also exclude bundled modules that are installed (they're already embedded)
  const notInstalled = availableModules.filter(
    m => {
      const isInstalled = installedModules.some(im => im.config.name === m.name);
      const isBundled = isBundledModule(m.name);
      
      // If it's a bundled module and installed, don't show it
      if (isBundled && isInstalled) {
        return false;
      }
      
      // Otherwise, show it if not installed
      return !isInstalled;
    }
  );

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div
        className="fixed inset-x-4 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
                   bg-scripture-surface border border-scripture-border/50 rounded-2xl shadow-2xl
                   max-w-4xl max-h-[80vh] overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-scripture-border/50">
          <h2 className="text-xl font-ui font-semibold text-scripture-text">
            Bible Translations
          </h2>
          <button
            onClick={onClose}
            className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-scripture-border/50">
          <button
            onClick={() => setActiveTab('installed')}
            className={`flex-1 px-4 py-3 text-sm font-ui font-medium transition-colors
                      ${activeTab === 'installed' 
                        ? 'text-scripture-accent border-b-2 border-scripture-accent bg-scripture-accent/5' 
                        : 'text-scripture-muted hover:text-scripture-text'}`}
          >
            Installed
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`flex-1 px-4 py-3 text-sm font-ui font-medium transition-colors
                      ${activeTab === 'api' 
                        ? 'text-scripture-accent border-b-2 border-scripture-accent bg-scripture-accent/5' 
                        : 'text-scripture-muted hover:text-scripture-text'}`}
          >
            NASB / ESV
          </button>
          <button
            onClick={() => setActiveTab('sword')}
            className={`flex-1 px-4 py-3 text-sm font-ui font-medium transition-colors
                      ${activeTab === 'sword' 
                        ? 'text-scripture-accent border-b-2 border-scripture-accent bg-scripture-accent/5' 
                        : 'text-scripture-muted hover:text-scripture-text'}`}
          >
            Public Domain
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {error && (
            <div className="mb-4 p-3 bg-red-600/20 text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          {downloading && (
            <div className="mb-4 p-4 bg-scripture-elevated rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-scripture-text">
                  Installing {downloading}...
                </span>
                <span className="text-xs text-scripture-muted">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-scripture-border/30 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-scripture-accent transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Installed Tab */}
          {activeTab === 'installed' && (
            <div>
              <h3 className="text-sm font-ui font-semibold text-scripture-text uppercase tracking-wider mb-3">
                Installed Translations
              </h3>
              {loading ? (
                <div className="text-center py-4 text-scripture-muted text-sm">
                  Loading...
                </div>
              ) : installedModules.length === 0 && apiTranslations.length === 0 ? (
                <div className="text-center py-4 text-scripture-muted text-sm">
                  No modules installed. Go to "NASB / ESV" or "Public Domain" tabs to add translations.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* API Translations */}
                  {apiTranslations.map((translation) => (
                    <div
                      key={translation.id}
                      className={`p-3 rounded-lg border transition-all duration-200 ${
                        currentModuleId === translation.id
                          ? 'bg-scripture-accent/10 border-scripture-accent/50'
                          : 'bg-scripture-elevated border-scripture-border/30 hover:border-scripture-border/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-scripture-text">
                              {translation.abbreviation}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                              API
                            </span>
                            {currentModuleId === translation.id && (
                              <span className="text-xs px-2 py-0.5 bg-scripture-accent text-scripture-bg rounded">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-scripture-muted mt-1">
                            {translation.name}
                          </p>
                          {translation.copyright && (
                            <p className="text-xs text-scripture-muted mt-1">
                              {translation.copyright}
                            </p>
                          )}
                        </div>
                        {currentModuleId !== translation.id && (
                          <button
                            onClick={() => handleSelectApiTranslation(translation)}
                            className="px-3 py-1.5 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                                     hover:bg-scripture-accent/90 transition-colors"
                          >
                            Use
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* SWORD Modules */}
                  {installedModules.map((module) => (
                    <div
                      key={module.config.name}
                      className={`p-3 rounded-lg border transition-all duration-200 ${
                        currentModuleId === module.config.name
                          ? 'bg-scripture-accent/10 border-scripture-accent/50'
                          : 'bg-scripture-elevated border-scripture-border/30 hover:border-scripture-border/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-scripture-text">
                              {module.config.name}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
                              SWORD
                            </span>
                            {currentModuleId === module.config.name && (
                              <span className="text-xs px-2 py-0.5 bg-scripture-accent text-scripture-bg rounded">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-scripture-muted mt-1">
                            {module.config.description || module.config.about || 'Bible Translation'}
                          </p>
                          {module.config.copyright && (
                            <p className="text-xs text-scripture-muted mt-1">
                              © {module.config.copyright}
                            </p>
                          )}
                        </div>
                        {currentModuleId !== module.config.name && (
                          <button
                            onClick={() => handleSwitchModule(module.config.name)}
                            className="px-3 py-1.5 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                                     hover:bg-scripture-accent/90 transition-colors"
                          >
                            Use
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* API Configuration Tab */}
          {activeTab === 'api' && (
            <div className="space-y-6">
              <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                <p className="text-sm text-scripture-text mb-4">
                  To use <strong>NASB</strong> and <strong>ESV</strong> translations, you need to configure a Bible API. 
                  These are copyrighted translations that require API access.
                </p>
              </div>

              {/* Biblia API */}
              <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                <h4 className="font-medium text-scripture-text mb-2">
                  Biblia API (NASB, ESV, NIV, NKJV)
                </h4>
                <p className="text-xs text-scripture-muted mb-3">
                  Get a free API key from Biblia.com. Free tier allows 5,000 requests/day.
                </p>
                <div className="mb-3 space-y-2">
                  <a 
                    href="https://api.biblia.com/v1/Users/SignIn" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                             hover:bg-scripture-accent/90 transition-colors text-center"
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
                <div className="mb-3 p-3 bg-scripture-surface/50 rounded-lg border border-scripture-border/30">
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
                    placeholder="Paste your Biblia API key here"
                    className="flex-1 px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                             rounded-lg focus:outline-none focus:border-scripture-accent
                             text-scripture-text placeholder-scripture-muted"
                  />
                  <button
                    onClick={() => saveApiConfig('biblia', bibliaApiKey)}
                    disabled={savingApi}
                    className="px-4 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                             hover:bg-scripture-accent/90 transition-colors disabled:opacity-50"
                  >
                    {savingApi ? 'Saving...' : 'Save'}
                  </button>
                </div>
                {bibliaClient.isConfigured() && (
                  <p className="text-xs text-green-400 mt-2">
                    ✓ Configured - NASB, ESV, NIV, NKJV available
                  </p>
                )}
              </div>

              {/* ESV API */}
              <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                <h4 className="font-medium text-scripture-text mb-2">
                  ESV API (ESV only)
                </h4>
                <p className="text-xs text-scripture-muted mb-3">
                  Get a free API key from ESV.org. Alternative to Biblia for ESV with generous limits for personal use.
                </p>
                <div className="mb-3 space-y-2">
                  <a 
                    href="https://api.esv.org/docs/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                             hover:bg-scripture-accent/90 transition-colors text-center"
                  >
                    View ESV API Documentation
                  </a>
                </div>
                <div className="mb-3 p-3 bg-scripture-surface/50 rounded-lg border border-scripture-border/30">
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
                    placeholder="Paste your ESV API key here"
                    className="flex-1 px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                             rounded-lg focus:outline-none focus:border-scripture-accent
                             text-scripture-text placeholder-scripture-muted"
                  />
                  <button
                    onClick={() => saveApiConfig('esv', esvApiKey)}
                    disabled={savingApi}
                    className="px-4 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                             hover:bg-scripture-accent/90 transition-colors disabled:opacity-50"
                  >
                    {savingApi ? 'Saving...' : 'Save'}
                  </button>
                </div>
                {esvClient.isConfigured() && (
                  <p className="text-xs text-green-400 mt-2">
                    ✓ Configured - ESV available
                  </p>
                )}
              </div>

              {/* Available API Translations */}
              {apiTranslations.length > 0 && (
                <div>
                  <h4 className="text-sm font-ui font-semibold text-scripture-text uppercase tracking-wider mb-3">
                    Available Translations
                  </h4>
                  <div className="space-y-2">
                    {apiTranslations.map((translation) => (
                      <div
                        key={translation.id}
                        className={`p-3 rounded-lg border transition-all duration-200 ${
                          currentModuleId === translation.id
                            ? 'bg-scripture-accent/10 border-scripture-accent/50'
                            : 'bg-scripture-elevated border-scripture-border/30 hover:border-scripture-border/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-scripture-text">
                                {translation.abbreviation}
                              </span>
                              {currentModuleId === translation.id && (
                                <span className="text-xs px-2 py-0.5 bg-scripture-accent text-scripture-bg rounded">
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-scripture-muted mt-1">
                              {translation.name}
                            </p>
                          </div>
                          {currentModuleId !== translation.id && (
                            <button
                              onClick={() => handleSelectApiTranslation(translation)}
                              className="px-3 py-1.5 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                                       hover:bg-scripture-accent/90 transition-colors"
                            >
                              Use
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SWORD / Public Domain Tab */}
          {activeTab === 'sword' && (
            <>
              {!showInstallZip ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-ui font-semibold text-scripture-text uppercase tracking-wider">
                      Public Domain Translations
                    </h3>
                    <button
                      onClick={() => setShowInstallZip(true)}
                      className="px-3 py-1.5 text-xs font-ui bg-scripture-accent text-scripture-bg rounded-lg
                               hover:bg-scripture-accent/90 transition-colors"
                    >
                      Install from ZIP
                    </button>
                  </div>
                  
                  <div className="mb-4 p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                    <p className="text-sm text-scripture-text mb-3">
                      These translations are in the public domain and can be downloaded for free from the SWORD Project.
                    </p>
                    <p className="text-xs text-scripture-muted mb-2">
                      <strong>Note:</strong> WEB, KJV, and ASV are already included with the app and will be installed automatically. 
                      They won't appear in the download list below if already installed.
                    </p>
                    <p className="text-xs text-scripture-muted">
                      If downloads fail due to CORS errors, use "Install from ZIP" and download manually from{' '}
                      <a 
                        href="https://crosswire.org/sword/modules/ModDisp.jsp?modType=Bibles"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-scripture-accent hover:underline"
                      >
                        crosswire.org
                      </a>
                    </p>
                  </div>

                  {/* Available modules list */}
                  {notInstalled.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {notInstalled.map((module) => (
                        <div
                          key={module.name}
                          className="p-3 rounded-lg border bg-scripture-elevated border-scripture-border/30"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-scripture-text">
                                {module.name}
                              </div>
                              <p className="text-xs text-scripture-muted mt-1">
                                {module.config.description || 'Bible Translation'}
                              </p>
                              {module.config.distributionLicense && (
                                <p className="text-xs text-scripture-muted mt-1">
                                  {module.config.distributionLicense}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleDownload(module)}
                              disabled={!!downloading}
                              className="px-4 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                                       hover:bg-scripture-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {downloading === module.name ? 'Installing...' : 'Download'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {notInstalled.length === 0 && availableModules.length > 0 && (
                    <p className="text-sm text-scripture-muted text-center py-4">
                      All available public domain modules are installed
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-ui font-semibold text-scripture-text uppercase tracking-wider">
                      Install from ZIP File
                    </h3>
                    <button
                      onClick={() => setShowInstallZip(false)}
                      className="text-sm text-scripture-muted hover:text-scripture-text"
                    >
                      ← Back
                    </button>
                  </div>
                  
                  <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                    <p className="text-sm text-scripture-text mb-4">
                      Install a SWORD module ZIP file you've downloaded from CrossWire or another source.
                    </p>
                    <label className="block cursor-pointer">
                      <input
                        type="file"
                        accept=".zip"
                        onChange={handleFileSelect}
                        disabled={!!downloading}
                        className="hidden"
                      />
                      <div className={`flex items-center justify-center p-6 border-2 border-dashed 
                                    rounded-lg transition-colors
                                    ${downloading 
                                      ? 'border-scripture-border/30 opacity-50 cursor-not-allowed'
                                      : 'border-scripture-border/50 hover:border-scripture-accent/50 cursor-pointer'}`}>
                        <span className="text-sm text-scripture-text">
                          {downloading ? `Installing ${downloading}...` : 'Click to select SWORD module ZIP file'}
                        </span>
                      </div>
                    </label>
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
