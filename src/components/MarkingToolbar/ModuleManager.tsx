/**
 * Module Manager Component
 * 
 * UI for managing Bible API configurations for translations (getBible, Biblia, ESV).
 */

import { useState, useEffect, useMemo } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { getPreferences, updatePreferences } from '@/lib/db';
import type { ApiConfigRecord } from '@/lib/db';
import { 
  bibliaClient, 
  bibleGatewayClient,
  esvClient, 
  getBibleClient,
  getAllTranslations,
  clearTranslationsCache,
  saveApiConfig as saveApiConfigToDb,
  BIBLEGATEWAY_ENABLED,
  type ApiTranslation,
  type BibleApiProvider,
} from '@/lib/bible-api';
import { Modal } from '@/components/shared';

interface ModuleManagerProps {
  onClose: () => void;
  onTranslationsUpdated?: () => void;
}


export function ModuleManager({ onClose, onTranslationsUpdated }: ModuleManagerProps) {
  const { currentModuleId, setCurrentModule } = useBibleStore();
  const [apiTranslations, setApiTranslations] = useState<ApiTranslation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // API Configuration state
  const [bibliaApiKey, setBibliaApiKey] = useState('');
  const [esvApiKey, setEsvApiKey] = useState('');
  const [bibleGatewayUsername, setBibleGatewayUsername] = useState('');
  const [bibleGatewayPassword, setBibleGatewayPassword] = useState('');
  const [savingApi, setSavingApi] = useState(false);

  useEffect(() => {
    loadModules();
    loadApiConfigs();
  }, []);

  async function loadModules() {
    try {
      setLoading(true);
      // Load API translations if configured
      const translations = await getAllTranslations();
      setApiTranslations(translations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load translations');
    } finally {
      setLoading(false);
    }
  }

  // Group translations by provider and filter to only configured APIs
  const translationsByProvider = useMemo(() => {
    const grouped: Record<BibleApiProvider, ApiTranslation[]> = {
      getbible: [],
      biblia: [],
      biblegateway: [],
      esv: [],
    };

    // Only show translations from configured APIs
    for (const translation of apiTranslations) {
      const provider = translation.provider;
      if (provider === 'getbible' && getBibleClient.isConfigured()) {
        grouped.getbible.push(translation);
      } else if (provider === 'biblia' && bibliaClient.isConfigured()) {
        grouped.biblia.push(translation);
      } else if (provider === 'biblegateway' && BIBLEGATEWAY_ENABLED && bibleGatewayClient.isConfigured()) {
        grouped.biblegateway.push(translation);
      } else if (provider === 'esv' && esvClient.isConfigured()) {
        grouped.esv.push(translation);
      }
    }

    return grouped;
  }, [apiTranslations]);

  async function loadApiConfigs() {
    try {
      const prefs = await getPreferences();
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
    } catch (err) {
      console.error('Failed to load API configs:', err);
    }
  }

  async function saveApiConfig(
    provider: 'biblia' | 'esv' | 'biblegateway',
    apiKeyOrCreds: string | { username: string; password: string }
  ) {
    setSavingApi(true);
    try {
      // Use the centralized saveApiConfig function from bible-api
      // This ensures consistency and proper persistence
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

      // Save using the centralized function (which handles persistence and configuration)
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

      // Clear cache and reload translations to reflect changes
      await clearTranslationsCache();
      const translations = await getAllTranslations();
      setApiTranslations(translations);
      if (onTranslationsUpdated) onTranslationsUpdated();
      setError(null);
    } catch (err) {
      console.error('Failed to save API config:', err);
      setError(err instanceof Error ? err.message : 'Failed to save API config');
    } finally {
      setSavingApi(false);
    }
  }


  function handleSelectApiTranslation(translation: ApiTranslation) {
    setCurrentModule(translation.id);
    onClose();
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Bible Translations"
      size="lg"
    >
          {error && (
            <div className="mb-4 p-3 bg-scripture-errorBg text-scripture-errorText rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* API Configuration */}
          <div className="space-y-6">
              {/* getBible API Section - Always available (free) */}
              {translationsByProvider.getbible.length > 0 && (
                <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-scripture-text">
                      getBible API
                    </h4>
                    <span className="text-xs px-2 py-1 bg-scripture-successBg text-scripture-successText rounded border border-scripture-success/30">
                      Free • No API Key Required
                    </span>
                  </div>
                  <p className="text-xs text-scripture-muted mb-3">
                    Free, open-source Bible API with many translations available.
                  </p>
                  <div className="space-y-2">
                    {translationsByProvider.getbible.map((translation) => (
                      <div
                        key={translation.id}
                        className={`p-3 rounded-lg border transition-all duration-200 ${
                          currentModuleId === translation.id
                            ? 'bg-scripture-accent/10 border-scripture-accent/50'
                            : 'bg-scripture-surface border-scripture-border/30 hover:border-scripture-border/50'
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

              {/* Biblia API Section */}
              <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-scripture-text">
                    Biblia API
                  </h4>
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
                <p className="text-xs text-scripture-muted mb-3">
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
                <div className="flex gap-2 mb-3">
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
                    className="px-4 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                             hover:bg-scripture-accent/90 transition-colors disabled:opacity-50"
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

                {/* Show translations if configured */}
                {bibliaClient.isConfigured() && translationsByProvider.biblia.length > 0 && (
                  <div className="space-y-2 mt-4">
                    {translationsByProvider.biblia.map((translation) => (
                      <div
                        key={translation.id}
                        className={`p-3 rounded-lg border transition-all duration-200 ${
                          currentModuleId === translation.id
                            ? 'bg-scripture-accent/10 border-scripture-accent/50'
                            : 'bg-scripture-surface border-scripture-border/30 hover:border-scripture-border/50'
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
                  </div>
                )}

                {bibliaClient.isConfigured() && translationsByProvider.biblia.length === 0 && (
                  <p className="text-xs text-scripture-muted mt-2">
                    No translations available. Check your API key or try refreshing.
                  </p>
                )}
              </div>

              {/* BibleGateway API Section - hidden when BIBLEGATEWAY_ENABLED is false */}
              {BIBLEGATEWAY_ENABLED && (
              <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-scripture-text">
                    BibleGateway API
                  </h4>
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
                <p className="text-xs text-scripture-muted mb-3">
                  Use the same <strong>username</strong> (or email) and <strong>password</strong> you use to sign in at BibleGateway.com. There is no separate API signup or &quot;enable&quot; step—the API uses your regular account. Supports <strong>NASB</strong>, <strong>NIV</strong>, ESV, and many other translations.
                </p>
                <a
                  href="https://www.biblegateway.com/api/documentation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mb-3 text-xs text-scripture-accent hover:underline"
                >
                  BibleGateway API Documentation
                </a>
                <div className="mb-3 flex flex-col gap-2">
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
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => saveApiConfig('biblegateway', { username: bibleGatewayUsername, password: bibleGatewayPassword })}
                    disabled={savingApi}
                    className="px-4 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                             hover:bg-scripture-accent/90 transition-colors disabled:opacity-50"
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
                {bibleGatewayClient.isConfigured() && translationsByProvider.biblegateway.length > 0 && (
                  <div className="space-y-2 mt-4">
                    {translationsByProvider.biblegateway.map((translation) => (
                      <div
                        key={translation.id}
                        className={`p-3 rounded-lg border transition-all duration-200 ${
                          currentModuleId === translation.id
                            ? 'bg-scripture-accent/10 border-scripture-accent/50'
                            : 'bg-scripture-surface border-scripture-border/30 hover:border-scripture-border/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-scripture-text">{translation.abbreviation}</span>
                              {currentModuleId === translation.id && (
                                <span className="text-xs px-2 py-0.5 bg-scripture-accent text-scripture-bg rounded">Active</span>
                              )}
                            </div>
                            <p className="text-xs text-scripture-muted mt-1">{translation.name}</p>
                          </div>
                          {currentModuleId !== translation.id && (
                            <button
                              onClick={() => handleSelectApiTranslation(translation)}
                              className="px-3 py-1.5 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg hover:bg-scripture-accent/90 transition-colors"
                            >
                              Use
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {bibleGatewayClient.isConfigured() && translationsByProvider.biblegateway.length === 0 && (
                  <p className="text-xs text-scripture-muted mt-2">
                    No translations available. Check credentials or try refreshing.
                  </p>
                )}
              </div>
              )}

              {/* ESV API Section */}
              <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-scripture-text">
                    ESV API
                  </h4>
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
                <div className="flex gap-2 mb-3">
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
                    className="px-4 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                             hover:bg-scripture-accent/90 transition-colors disabled:opacity-50"
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

                {/* Show translations if configured */}
                {esvClient.isConfigured() && translationsByProvider.esv.length > 0 && (
                  <div className="space-y-2 mt-4">
                    {translationsByProvider.esv.map((translation) => (
                      <div
                        key={translation.id}
                        className={`p-3 rounded-lg border transition-all duration-200 ${
                          currentModuleId === translation.id
                            ? 'bg-scripture-accent/10 border-scripture-accent/50'
                            : 'bg-scripture-surface border-scripture-border/30 hover:border-scripture-border/50'
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
                  </div>
                )}

                {esvClient.isConfigured() && translationsByProvider.esv.length === 0 && (
                  <p className="text-xs text-scripture-muted mt-2">
                    No translations available. Check your API key or try refreshing.
                  </p>
                )}
              </div>

              {/* Show message if no APIs are configured */}
              {!bibliaClient.isConfigured() && !esvClient.isConfigured() && (!BIBLEGATEWAY_ENABLED || !bibleGatewayClient.isConfigured()) && translationsByProvider.getbible.length === 0 && (
                <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30 text-center">
                  <p className="text-sm text-scripture-text mb-2">
                    No API translations available
                  </p>
                  <p className="text-xs text-scripture-muted">
                    Configure an API key above to access additional translations, or getBible translations will appear here automatically.
                  </p>
                </div>
              )}
            </div>
    </Modal>
  );
}
