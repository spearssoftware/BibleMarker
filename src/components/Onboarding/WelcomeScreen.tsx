/**
 * Welcome Screen Component
 *
 * First-launch screen that asks which mode to start in (Read, Discover or
 * Study) before continuing to the translation library or the tour.
 */

import { useState } from 'react';
import { updatePreferences, getPreferences } from '@/lib/database';
import { Button } from '@/components/shared';
import { useDiscoveryEnabled } from '@/lib/discovery-config';
import { MODE_DESCRIPTIONS, MODE_LABELS, chooseInitialMode } from '@/lib/appMode';
import { APP_MODES, useAppModeStore, type AppMode } from '@/stores/appModeStore';

interface WelcomeScreenProps {
  onComplete: () => void;
  onStartTour: () => void;
}

export function WelcomeScreen({ onComplete, onStartTour }: WelcomeScreenProps) {
  const discoveryEnabled = useDiscoveryEnabled();
  const offeredModes = APP_MODES.filter(mode => mode !== 'discover' || discoveryEnabled);
  const [selected, setSelected] = useState<AppMode | null>(() => {
    const stored = useAppModeStore.getState().mode;
    return stored !== null && offeredModes.includes(stored) ? stored : null;
  });
  const [isDismissing, setIsDismissing] = useState(false);

  async function finish(next: () => void) {
    if (!selected) return;
    setIsDismissing(true);
    chooseInitialMode(selected);
    const prefs = await getPreferences();
    await updatePreferences({
      onboarding: {
        ...prefs.onboarding!,
        hasSeenWelcome: true,
      },
    });
    next();
  }

  const buttonsDisabled = selected === null || isDismissing;

  return (
    <>
      <div className="fixed inset-0 z-[300] backdrop-overlay" />

      {/* Modal - safe area aware container */}
      <div
        className="fixed inset-0 z-[301] flex items-center justify-center
                   pt-safe-top pb-safe-bottom pl-safe-left pr-safe-right p-4 pointer-events-none"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
          className="max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-scale-in pointer-events-auto"
        >
          <div className="bg-scripture-surface rounded-xl shadow-modal dark:shadow-modal-dark overflow-hidden flex flex-col h-full mx-2 my-2">
            <div className="p-6 border-b border-scripture-overlayBorder/50">
              <h1 id="welcome-title" className="text-2xl font-ui font-bold text-scripture-text mb-2">
                Welcome to BibleMarker
              </h1>
              <p className="text-sm text-scripture-muted">
                Read, discover and study the Bible, and mark it as you go.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <h2 id="welcome-choice" className="text-lg font-ui font-semibold text-scripture-text mb-4">
                How do you want to start?
              </h2>
              <div role="radiogroup" aria-labelledby="welcome-choice" className="space-y-3">
                {offeredModes.map(mode => {
                  const isSelected = selected === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelected(mode)}
                      className={`w-full min-h-[44px] text-left rounded-lg border px-4 py-3 transition-colors ${
                        isSelected
                          ? 'border-scripture-accent bg-scripture-accent/10'
                          : 'border-scripture-border/50 hover:bg-scripture-overlay/50'
                      }`}
                    >
                      <div className="font-ui font-medium text-scripture-text">{MODE_LABELS[mode]}</div>
                      <div className="text-sm text-scripture-muted">{MODE_DESCRIPTIONS[mode]}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-scripture-muted mt-4">
                You can switch any time from the top bar.
              </p>
            </div>

            <div className="p-6 border-t border-scripture-overlayBorder/50 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => finish(onComplete)}
                disabled={buttonsDisabled}
              >
                Get Started
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => finish(onStartTour)}
                disabled={buttonsDisabled}
              >
                Take Tour
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
