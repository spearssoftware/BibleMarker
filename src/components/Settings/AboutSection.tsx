/**
 * About Section Component
 *
 * Displays app version, credits, and license information.
 * Checks for new releases (at most once per 24h) when checkForUpdates is enabled.
 * Provides a manual "Check now" button for on-demand update checks.
 */

import { useEffect, useState, useCallback } from 'react';
import { checkForUpdateIfDue, checkForUpdateNow, type UpdateCheckResult } from '@/lib/updateCheck';
import { isFlatpak } from '@/lib/platform';
import { UpdateBanner } from '@/components/shared';

interface AboutSectionProps {
  /** When false, no automatic update check is run on mount */
  checkForUpdates?: boolean;
  onCheckForUpdatesChange?: (value: boolean) => void;
}

export function AboutSection({
  checkForUpdates: checkForUpdatesEnabled = true,
  onCheckForUpdatesChange,
}: AboutSectionProps) {
  const version = __APP_VERSION__;
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null | 'checking'>(
    checkForUpdatesEnabled ? 'checking' : null
  );
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [inFlatpak, setInFlatpak] = useState(false);

  useEffect(() => {
    isFlatpak().then(setInFlatpak);
  }, []);

  useEffect(() => {
    if (inFlatpak) {
      queueMicrotask(() => setUpdateResult(null));
      return;
    }
    if (!checkForUpdatesEnabled) {
      queueMicrotask(() => setUpdateResult(null));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setUpdateResult('checking'));
    checkForUpdateIfDue().then((result) => {
      if (!cancelled) {
        setUpdateResult(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [checkForUpdatesEnabled, inFlatpak]);

  const handleCheckNow = useCallback(async () => {
    setUpdateResult('checking');
    const result = await checkForUpdateNow();
    setUpdateResult(result);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">About</h3>
        <div className="space-y-3 text-sm text-scripture-text">
          <div>
            <div className="font-medium mb-1">BibleMarker</div>
            <div className="text-scripture-muted text-xs">
              Version {version}
              {' · '}
              <a
                href="https://biblemarker.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-scripture-accent hover:underline"
              >
                biblemarker.app
              </a>
            </div>
            <div className="mt-2 flex items-center gap-3">
              {inFlatpak ? (
                <span className="text-xs text-scripture-muted">Updates are managed by Flathub</span>
              ) : updateResult === 'checking' ? (
                <span className="text-xs text-scripture-muted">Checking for updates…</span>
              ) : updateResult ? (
                <button
                  onClick={() => setShowUpdateBanner(true)}
                  className="text-xs text-scripture-accent hover:underline"
                >
                  A new version ({updateResult.version}) is available →
                </button>
              ) : (
                <span className="text-xs text-scripture-muted">You're up to date</span>
              )}
              {!inFlatpak && updateResult !== 'checking' && (
                <button
                  onClick={handleCheckNow}
                  className="text-xs text-scripture-accent hover:underline"
                >
                  Check now
                </button>
              )}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('showWhatsNew'))}
                className="text-xs text-scripture-accent hover:underline"
              >
                What's New
              </button>
            </div>
          </div>
          <p className="text-xs text-scripture-muted">
            An inductive Bible study app with keyword marking, observation lists, and multi-translation support.
          </p>
        </div>
      </div>

      {showUpdateBanner && updateResult && updateResult !== 'checking' && (
        <UpdateBanner
          version={updateResult.version}
          url={updateResult.url}
          onDismiss={() => setShowUpdateBanner(false)}
        />
      )}

      {!inFlatpak && onCheckForUpdatesChange && (
        <div className="flex items-center justify-between gap-4 pt-2">
          <div>
            <div className="text-sm font-medium text-scripture-text">Check for updates automatically</div>
            <div className="text-xs text-scripture-muted mt-0.5">
              Check GitHub once per day for a new release
            </div>
          </div>
          <button
            onClick={() => onCheckForUpdatesChange(!checkForUpdatesEnabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-scripture-accent focus:ring-offset-2 ${
              checkForUpdatesEnabled ? 'bg-scripture-accent' : 'bg-scripture-border'
            }`}
            role="switch"
            aria-checked={checkForUpdatesEnabled}
            aria-label="Toggle check for updates automatically"
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                checkForUpdatesEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

    </div>
  );
}
