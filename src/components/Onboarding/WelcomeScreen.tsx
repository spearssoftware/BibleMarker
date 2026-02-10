/**
 * Welcome Screen Component
 * 
 * First-time user welcome screen with overview of key features.
 */

import { useState } from 'react';
import { updatePreferences, getPreferences } from '@/lib/database';
import { isIOS } from '@/lib/platform';

interface WelcomeScreenProps {
  onComplete: () => void;
  onStartTour: () => void;
}

export function WelcomeScreen({ onComplete, onStartTour }: WelcomeScreenProps) {
  const [isDismissing, setIsDismissing] = useState(false);
  const isTouchDevice = isIOS() || ('ontouchstart' in window);

  async function handleGetStarted() {
    setIsDismissing(true);
    const prefs = await getPreferences();
    await updatePreferences({
      onboarding: {
        ...prefs.onboarding!,
        hasSeenWelcome: true,
      },
    });
    onComplete();
  }

  async function handleStartTour() {
    setIsDismissing(true);
    const prefs = await getPreferences();
    await updatePreferences({
      onboarding: {
        ...prefs.onboarding!,
        hasSeenWelcome: true,
      },
    });
    onStartTour();
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-[300] backdrop-overlay" 
        onClick={handleGetStarted}
      />
      
      {/* Modal - safe area aware container */}
      <div
        className="fixed inset-0 z-[301] flex items-center justify-center
                   pt-safe-top pb-safe-bottom pl-safe-left pr-safe-right p-4 pointer-events-none"
      >
        <div
          className="max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-scale-in pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="bg-scripture-surface rounded-xl shadow-modal dark:shadow-modal-dark overflow-hidden flex flex-col h-full mx-2 my-2">
          {/* Header */}
          <div className="p-6 border-b border-scripture-overlayBorder/50">
            <h1 className="text-2xl font-ui font-bold text-scripture-text mb-2">
              Welcome to BibleMarker
            </h1>
            <p className="text-sm text-scripture-muted">
              A Bible study app following the Precept method, emphasizing observation through consistent marking and keyword tracking.
            </p>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="space-y-6">
              {/* Key Features */}
              <div>
                <h2 className="text-lg font-ui font-semibold text-scripture-text mb-4">
                  Key Features
                </h2>
                <div className="space-y-4 text-sm text-scripture-text">
                  <div className="flex gap-4">
                    <div className="text-2xl flex-shrink-0">{'\u{1F4D6}'}</div>
                    <div>
                      <div className="font-medium text-scripture-text mb-1">Read Multiple Translations</div>
                      <p className="text-scripture-muted">
                        View up to 3 translations side-by-side with synchronized scrolling.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-2xl flex-shrink-0">{'\u{1F58D}\uFE0F'}</div>
                    <div>
                      <div className="font-medium text-scripture-text mb-1">Mark & Highlight</div>
                      <p className="text-scripture-muted">
                        Select text to apply key words, add variants, or add to observation lists.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-2xl flex-shrink-0">{'\u{1F511}'}</div>
                    <div>
                      <div className="font-medium text-scripture-text mb-1">Key Words</div>
                      <p className="text-scripture-muted">
                        Define key words with colors and symbols. They automatically highlight across all visible translations.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-2xl flex-shrink-0">{'\u{1F4DD}'}</div>
                    <div>
                      <div className="font-medium text-scripture-text mb-1">Notes & Observations</div>
                      <p className="text-scripture-muted">
                        Add notes to verses and capture observations for time, places, contrasts, and conclusions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Tips - platform-aware */}
              <div className="bg-scripture-overlay/30 rounded-lg p-4">
                <h3 className="text-sm font-ui font-semibold text-scripture-text mb-2">
                  Quick Tips
                </h3>
                {isTouchDevice ? (
                  <ul className="space-y-1.5 text-xs text-scripture-muted ml-4 list-disc">
                    <li>Tap and hold text to select, then use the selection menu to mark or observe</li>
                    <li>Tap verse numbers to add notes</li>
                    <li>Use the toolbar at the bottom to switch between tools</li>
                    <li>Swipe left/right on the navigation bar to change chapters</li>
                  </ul>
                ) : (
                  <ul className="space-y-1.5 text-xs text-scripture-muted ml-4 list-disc">
                    <li>Select text to open the selection menu (mark, add to list, observe)</li>
                    <li>Use arrow keys or J/K to navigate between chapters</li>
                    <li>Press 1{'\u{2013}'}4 for Key Words, Observe, Study, Settings</li>
                    <li>Press Cmd/Ctrl+F to search</li>
                    <li>Click verse numbers to add notes</li>
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-scripture-overlayBorder/50 flex gap-3">
            <button
              onClick={handleGetStarted}
              className="flex-1 px-4 py-2.5 text-sm font-ui bg-scripture-surface border border-scripture-overlayBorder
                       text-scripture-text rounded-lg hover:bg-scripture-overlay/50 transition-colors disabled:opacity-50"
              disabled={isDismissing}
            >
              Get Started
            </button>
            <button
              onClick={handleStartTour}
              className="flex-1 px-4 py-2.5 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                       hover:bg-scripture-accent/90 transition-colors disabled:opacity-50"
              disabled={isDismissing}
            >
              Take Tour
            </button>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
