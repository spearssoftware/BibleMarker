/**
 * Translation Library — first-launch prompt offering free translation
 * downloads alongside the bundled ASV.
 *
 * Apple App Store compliant: non-blocking. Boxes start unchecked, the user
 * opts in, and the app is fully usable without any of these. Existing users
 * upgrading from a version that bundled NASB see "Installed" instead of an
 * Install button for whatever they already have on disk.
 */

import { useState, useEffect } from 'react';
import { updatePreferences, getPreferences } from '@/lib/database';
import {
  downloadModule,
  isModuleDownloaded,
  getModuleInfo,
} from '@/lib/bible-api';

interface LibraryModule {
  id: string;
  sizeApprox: string;
  tagline: string;
}

const LIBRARY_MODULES: LibraryModule[] = [
  {
    id: 'sword-NASB',
    sizeApprox: '~12 MB',
    tagline: 'Modern translation, popular for inductive study',
  },
  {
    id: 'sword-NASB1995',
    sizeApprox: '~12 MB',
    tagline: 'Classic NASB edition',
  },
  {
    id: 'sword-KJV',
    sizeApprox: '~3 MB',
    tagline: 'Traditional English translation',
  },
];

type ModuleStatus = 'not-installed' | 'downloading' | 'installed' | 'error';

interface TranslationLibraryProps {
  onContinue: () => void;
}

export function TranslationLibrary({ onContinue }: TranslationLibraryProps) {
  const [statuses, setStatuses] = useState<Record<string, ModuleStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initial: Record<string, ModuleStatus> = {};
      for (const m of LIBRARY_MODULES) {
        const installed = await isModuleDownloaded(m.id).catch(() => false);
        initial[m.id] = installed ? 'installed' : 'not-installed';
      }
      if (!cancelled) setStatuses(initial);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleInstall(moduleId: string) {
    setStatuses((s) => ({ ...s, [moduleId]: 'downloading' }));
    setErrors((e) => {
      const next = { ...e };
      delete next[moduleId];
      return next;
    });
    try {
      await downloadModule(moduleId);
      setStatuses((s) => ({ ...s, [moduleId]: 'installed' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatuses((s) => ({ ...s, [moduleId]: 'error' }));
      setErrors((e) => ({ ...e, [moduleId]: msg }));
    }
  }

  async function handleContinue() {
    if (isDismissing) return;
    setIsDismissing(true);
    const prefs = await getPreferences();
    await updatePreferences({
      onboarding: {
        ...prefs.onboarding!,
        hasSeenTranslationLibrary: true,
      },
    });
    onContinue();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[300] backdrop-overlay"
        onClick={handleContinue}
      />

      <div
        className="fixed inset-0 z-[301] flex items-center justify-center
                   pt-safe-top pb-safe-bottom pl-safe-left pr-safe-right p-4 pointer-events-none"
      >
        <div
          className="max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-scale-in pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-scripture-surface rounded-xl shadow-modal dark:shadow-modal-dark overflow-hidden flex flex-col h-full mx-2 my-2">
            <div className="p-6 border-b border-scripture-overlayBorder/50">
              <h1 className="text-2xl font-ui font-bold text-scripture-text mb-2">
                Get more translations
              </h1>
              <p className="text-sm text-scripture-muted">
                BibleMarker comes with the American Standard Version. Tap to add more, free.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="space-y-3">
                {LIBRARY_MODULES.map((m) => {
                  const info = getModuleInfo(m.id);
                  if (!info) return null;
                  const status = statuses[m.id] ?? 'not-installed';
                  const error = errors[m.id];
                  return (
                    <div
                      key={m.id}
                      className="p-3 bg-scripture-elevated rounded-lg border border-scripture-border/30 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-scripture-text">{info.abbreviation}</span>
                          <span className="text-xs text-scripture-muted">{m.sizeApprox}</span>
                        </div>
                        <p className="text-xs text-scripture-muted mt-0.5">{info.name}</p>
                        <p className="text-xs text-scripture-muted italic mt-0.5">{m.tagline}</p>
                        {error && (
                          <p className="text-xs text-scripture-error mt-1">{error}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {status === 'installed' && (
                          <span className="text-xs text-scripture-success font-medium">
                            Installed
                          </span>
                        )}
                        {status === 'downloading' && (
                          <span className="text-xs text-scripture-muted">Installing&hellip;</span>
                        )}
                        {(status === 'not-installed' || status === 'error') && (
                          <button
                            onClick={() => handleInstall(m.id)}
                            className="text-xs px-3 py-1.5 bg-scripture-accent text-scripture-bg rounded
                                     hover:bg-scripture-accent/90 transition-colors"
                          >
                            {status === 'error' ? 'Retry' : 'Install'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-scripture-muted mt-4 text-center">
                Need internet? You can do this anytime in Settings &rarr; Bible &rarr; Manage Translations.
              </p>
            </div>

            <div className="p-6 border-t border-scripture-overlayBorder/50">
              <button
                onClick={handleContinue}
                disabled={isDismissing}
                className="w-full px-4 py-2.5 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                         hover:bg-scripture-accent/90 transition-colors disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
