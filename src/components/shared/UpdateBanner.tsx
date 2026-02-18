/**
 * Update Banner Component
 *
 * Dismissible banner shown when a new app version is available.
 * On Tauri: "Get update" triggers in-app download and install.
 * On Capacitor (iOS): informational only — updates come through the App Store.
 * On web: opens the releases page.
 */

import { useState } from 'react';
import { openUrl, isTauri, isCapacitor } from '@/lib/platform';
import { installUpdate } from '@/lib/tauriUpdater';
import { ConfirmationDialog } from './ConfirmationDialog';

interface UpdateBannerProps {
  version: string;
  url: string;
  onDismiss: () => void;
}

export function UpdateBanner({ version, url, onDismiss }: UpdateBannerProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const capacitor = isCapacitor();

  const handleGetUpdate = () => {
    if (capacitor) return;
    if (isTauri()) {
      setShowConfirm(true);
    } else {
      openUrl(url);
    }
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    setIsInstalling(true);
    const result = await installUpdate();
    setIsInstalling(false);
    if (!result.installed) {
      openUrl(url);
    }
  };

  return (
    <>
      <div
        role="alert"
        className="flex items-center justify-between gap-3 px-4 py-2 bg-scripture-accent/15 text-scripture-text border-b border-scripture-accent/30"
      >
        <span className="text-sm">
          {capacitor
            ? `Version ${version} is available in the App Store.`
            : `A new version (${version}) is available.`}
        </span>
        <div className="flex items-center gap-2">
          {!capacitor && (
            <button
              type="button"
              onClick={handleGetUpdate}
              disabled={isInstalling}
              className="text-sm font-medium text-scripture-accent hover:underline disabled:opacity-50"
            >
              {isInstalling ? 'Installing…' : 'Get update'}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="text-scripture-muted hover:text-scripture-text text-sm px-1"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
      {!capacitor && (
        <ConfirmationDialog
          isOpen={showConfirm}
          title="Update available"
          message={`Version ${version} is available. Download and install now? The app will restart.`}
          confirmLabel="Update"
          cancelLabel="Later"
          destructive={false}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
