/**
 * Update Banner / Dialog Component
 *
 * Tauri (desktop): shows a modal dialog immediately prompting the user to update,
 *   with a progress bar during download and automatic relaunch.
 * Capacitor (iOS): informational banner — updates come through the App Store.
 * Web: banner with link to releases page.
 */

import { useState } from 'react';
import { openUrl, isTauri, isCapacitor } from '@/lib/platform';
import { installUpdate } from '@/lib/tauriUpdater';
import { Modal } from './Modal';
import { Button } from './Button';
import { Z_INDEX } from '@/lib/modalConstants';

interface UpdateBannerProps {
  version: string;
  url: string;
  onDismiss: () => void;
}

type UpdatePhase = 'prompt' | 'downloading' | 'installing' | 'error';

export function UpdateBanner({ version, url, onDismiss }: UpdateBannerProps) {
  const capacitor = isCapacitor();
  const tauri = isTauri();

  const [showDialog, setShowDialog] = useState(tauri);
  const [phase, setPhase] = useState<UpdatePhase>('prompt');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const handleDismiss = () => {
    setShowDialog(false);
    onDismiss();
  };

  const handleUpdate = async () => {
    setPhase('downloading');
    const result = await installUpdate((percent) => {
      setProgress(percent);
      if (percent >= 100) {
        setPhase('installing');
      }
    });
    if (!result.installed) {
      if (result.error) {
        setErrorMessage(result.error);
        setPhase('error');
      } else {
        openUrl(url);
        handleDismiss();
      }
    }
  };

  const isInterruptible = phase === 'prompt' || phase === 'error';

  if (tauri) {
    return (
      <Modal
        isOpen={showDialog}
        onClose={isInterruptible ? handleDismiss : () => {}}
        title="Update available"
        size="sm"
        zIndex={Z_INDEX.MODAL_CRITICAL}
        showCloseButton={false}
        handleEscape={isInterruptible}
      >
        {phase === 'prompt' && (
          <>
            <p className="text-scripture-text">
              Version {version} is ready to install. The app will restart after updating.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="secondary" onClick={handleDismiss}>
                Later
              </Button>
              <Button variant="primary" onClick={handleUpdate}>
                Update now
              </Button>
            </div>
          </>
        )}

        {phase === 'downloading' && (
          <>
            <p className="text-scripture-text mb-3">Downloading update…</p>
            <div className="w-full bg-scripture-muted/20 rounded-full h-2 overflow-hidden">
              <div
                className="bg-scripture-accent h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-scripture-muted text-sm mt-2 text-right">{Math.round(progress)}%</p>
          </>
        )}

        {phase === 'installing' && (
          <p className="text-scripture-text">Installing update and restarting…</p>
        )}

        {phase === 'error' && (
          <>
            <p className="text-scripture-text">
              Update failed: {errorMessage || 'Unknown error'}
            </p>
            <p className="text-scripture-muted text-sm mt-1">
              You can download the update manually from the releases page.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="secondary" onClick={handleDismiss}>
                Dismiss
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  openUrl(url);
                  handleDismiss();
                }}
              >
                Download manually
              </Button>
            </div>
          </>
        )}
      </Modal>
    );
  }

  return (
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
            onClick={() => openUrl(url)}
            className="text-sm font-medium text-scripture-accent hover:underline"
          >
            Get update
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
  );
}
