/**
 * Module Manager Component
 *
 * UI for managing Bible translations (SWORD modules + ESV API).
 */

import { useState, useEffect } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import {
  esvClient,
  getAllTranslations,
  getAvailableModules,
  isModuleDownloaded,
  downloadModule,
  deleteModule,
  isModuleBundled,
  getModuleCopyright,
  LOCKMAN_URL,
  type ApiTranslation,
} from '@/lib/bible-api';
import { Modal, Button } from '@/components/shared';

interface ModuleManagerProps {
  onClose: () => void;
  onTranslationsUpdated?: () => void;
}

export function ModuleManager({ onClose, onTranslationsUpdated }: ModuleManagerProps) {
  const { currentModuleId, setCurrentModule } = useBibleStore();
  const [apiTranslations, setApiTranslations] = useState<ApiTranslation[]>([]);
  const [, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // SWORD module state
  const [moduleStatuses, setModuleStatuses] = useState<Record<string, 'installed' | 'downloading' | 'not-installed'>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    loadModules();
  }, []);

  async function loadModules() {
    try {
      setLoading(true);
      const translations = await getAllTranslations();
      setApiTranslations(translations);

      // Load SWORD module statuses
      const modules = getAvailableModules();
      const statuses: Record<string, 'installed' | 'not-installed'> = {};
      for (const mod of modules) {
        statuses[mod.id] = (await isModuleDownloaded(mod.id)) ? 'installed' : 'not-installed';
      }
      setModuleStatuses(statuses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load translations');
    } finally {
      setLoading(false);
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
      const translations = await getAllTranslations();
      setApiTranslations(translations);
      if (onTranslationsUpdated) onTranslationsUpdated();
    } catch (err) {
      setModuleStatuses(prev => ({ ...prev, [moduleId]: 'not-installed' }));
      setError(err instanceof Error ? err.message : 'Failed to download module');
    } finally {
      setDownloadProgress(prev => {
        const next = { ...prev };
        delete next[moduleId];
        return next;
      });
    }
  }

  async function handleDeleteModule(moduleId: string) {
    if (!confirm('Remove this Bible module? You can re-download it later.')) return;
    try {
      await deleteModule(moduleId);
      setModuleStatuses(prev => ({ ...prev, [moduleId]: 'not-installed' }));
      const translations = await getAllTranslations();
      setApiTranslations(translations);
      if (onTranslationsUpdated) onTranslationsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove module');
    }
  }

  function handleSelectTranslation(translation: ApiTranslation) {
    setCurrentModule(translation.id);
    onClose();
  }

  // ESV translations from the installed list
  const esvTranslations = apiTranslations.filter(t => t.provider === 'esv');

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

      <div className="space-y-6">
        {/* SWORD Modules */}
        <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-scripture-text">Offline Bible Modules</h4>
            <span className="text-xs px-2 py-1 bg-scripture-successBg text-scripture-successText rounded border border-scripture-success/30">
              No Internet Required
            </span>
          </div>
          <p className="text-xs text-scripture-muted mb-3">
            Download translations for offline reading.
          </p>
          <div className="space-y-2">
            {getAvailableModules().map(mod => {
              const status = moduleStatuses[mod.id] || 'not-installed';
              const progress = downloadProgress[mod.id];
              const copyright = getModuleCopyright(mod.id);
              return (
                <div
                  key={mod.id}
                  className={`p-3 rounded-lg border transition-all duration-200 ${
                    currentModuleId === mod.id
                      ? 'bg-scripture-accent/10 border-scripture-accent/50'
                      : 'bg-scripture-surface border-scripture-border/30 hover:border-scripture-border/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-scripture-text">{mod.abbreviation}</span>
                        {currentModuleId === mod.id && (
                          <span className="text-xs px-2 py-0.5 bg-scripture-accent text-scripture-bg rounded">Active</span>
                        )}
                      </div>
                      <p className="text-xs text-scripture-muted mt-1">{mod.name}</p>
                      {copyright && (
                        <p className="text-[10px] text-scripture-muted mt-1 leading-tight">
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
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {status === 'installed' && currentModuleId !== mod.id && (
                        <Button variant="primary" size="sm" onClick={() => handleSelectTranslation({ id: mod.id, name: mod.name, abbreviation: mod.abbreviation, language: 'en', provider: 'sword' })}>
                          Use
                        </Button>
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
                        <Button variant="primary" size="sm" onClick={() => handleDownloadModule(mod.id)}>
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ESV API Section */}
        {esvClient.isConfigured() && esvTranslations.length > 0 && (
          <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-scripture-text">ESV API</h4>
              <span className="text-xs px-2 py-1 bg-scripture-successBg text-scripture-successText border border-scripture-success/30 rounded">
                ✓ Configured
              </span>
            </div>
            <div className="space-y-2">
              {esvTranslations.map((translation) => (
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
                      {translation.copyright && (
                        <p className="text-xs text-scripture-muted mt-1">{translation.copyright}</p>
                      )}
                    </div>
                    {currentModuleId !== translation.id && (
                      <Button variant="primary" size="sm" onClick={() => handleSelectTranslation(translation)}>
                        Use
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No translations available */}
        {Object.values(moduleStatuses).every(s => s === 'not-installed') && !esvClient.isConfigured() && (
          <div className="p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30 text-center">
            <p className="text-sm text-scripture-text mb-2">No translations available</p>
            <p className="text-xs text-scripture-muted">
              Download a Bible module above, or configure an ESV API key in Settings.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
