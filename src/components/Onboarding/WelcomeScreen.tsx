/**
 * Welcome Screen Component
 *
 * First-launch screen that asks which mode to start in (Read, Discover or
 * Study) before continuing to the translation library or the tour.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import { updatePreferences, getPreferences } from '@/lib/database';
import { Button } from '@/components/shared';
import { useDiscoveryEnabled } from '@/lib/discovery-config';
import { MODE_DESCRIPTIONS, MODE_LABELS, chooseInitialMode } from '@/lib/appMode';
import { useModal } from '@/hooks/useModal';
import { APP_MODES, useAppModeStore, type AppMode } from '@/stores/appModeStore';

function noop() {}

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
  const cardRefs = useRef<Partial<Record<AppMode, HTMLButtonElement | null>>>({});
  const tabStopRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const tabStop = selected !== null && offeredModes.includes(selected) ? selected : offeredModes[0];

  // Focus handling and scroll lock come from the shared modal hook; the Welcome
  // screen is not dismissable, so Escape is left alone.
  useModal({ isOpen: true, onClose: noop, handleEscape: false, initialFocusRef: tabStopRef });

  async function finish(next: () => void) {
    if (!selected) return;
    setIsDismissing(true);
    chooseInitialMode(selected);
    try {
      const prefs = await getPreferences();
      await updatePreferences({
        onboarding: {
          ...prefs.onboarding!,
          hasSeenWelcome: true,
        },
      });
    } catch (error) {
      console.error('Failed to save the welcome preference; continuing onboarding.', error);
    } finally {
      setIsDismissing(false);
      next();
    }
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLButtonElement>, mode: AppMode) {
    const step = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1
      : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1
      : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = offeredModes.indexOf(mode);
    const nextMode = offeredModes[(index + step + offeredModes.length) % offeredModes.length];
    setSelected(nextMode);
    cardRefs.current[nextMode]?.focus();
  }

  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"])')
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const buttonsDisabled = selected === null || isDismissing;
  const hintId = buttonsDisabled ? 'welcome-hint' : undefined;

  return (
    <>
      <div className="fixed inset-0 z-[300] backdrop-overlay" />

      {/* Modal - safe area aware container */}
      <div
        className="fixed inset-0 z-[301] flex items-center justify-center
                   pt-safe-top pb-safe-bottom pl-safe-left pr-safe-right p-4 pointer-events-none"
      >
        <div
          ref={dialogRef}
          onKeyDown={trapTab}
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
                      tabIndex={mode === tabStop ? 0 : -1}
                      ref={element => {
                        cardRefs.current[mode] = element;
                        if (mode === tabStop) tabStopRef.current = element;
                      }}
                      onClick={() => setSelected(mode)}
                      onKeyDown={event => handleCardKeyDown(event, mode)}
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
              <span id="welcome-hint" className="sr-only">Choose a mode to continue</span>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => finish(onComplete)}
                disabled={buttonsDisabled}
                aria-describedby={hintId}
              >
                Get Started
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => finish(onStartTour)}
                disabled={buttonsDisabled}
                aria-describedby={hintId}
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
