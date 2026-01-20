/**
 * Welcome Screen Component
 * 
 * First-time user welcome screen with overview of key features.
 */

import { useState } from 'react';
import { updatePreferences, getPreferences } from '@/lib/db';

interface WelcomeScreenProps {
  onComplete: () => void;
  onStartTour: () => void;
}

export function WelcomeScreen({ onComplete, onStartTour }: WelcomeScreenProps) {
  const [isDismissing, setIsDismissing] = useState(false);

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
      
      {/* Modal */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[301]
                   max-w-2xl w-[calc(100%-2rem)] max-h-[85vh] overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-scripture-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col h-full mx-2 my-2">
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
                    <div className="text-2xl flex-shrink-0">📖</div>
                    <div>
                      <div className="font-medium text-scripture-text mb-1">Read Multiple Translations</div>
                      <p className="text-scripture-muted">
                        View up to 3 translations side-by-side with synchronized scrolling. Choose from getBible (free), Biblia, ESV API, and more.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-2xl flex-shrink-0">🖍️</div>
                    <div>
                      <div className="font-medium text-scripture-text mb-1">Mark & Highlight</div>
                      <p className="text-scripture-muted">
                        Select text to highlight, color, underline, or add symbols. Smart suggestions remember your previous markings.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-2xl flex-shrink-0">🔑</div>
                    <div>
                      <div className="font-medium text-scripture-text mb-1">Key Words</div>
                      <p className="text-scripture-muted">
                        Define key words (e.g., "God", "Jesus", "love") with colors and symbols. They automatically highlight across all visible translations.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-2xl flex-shrink-0">📝</div>
                    <div>
                      <div className="font-medium text-scripture-text mb-1">Notes & Observations</div>
                      <p className="text-scripture-muted">
                        Add notes to verses (supports Markdown), create observation lists, and organize your study with section headings.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-2xl flex-shrink-0">🔍</div>
                    <div>
                      <div className="font-medium text-scripture-text mb-1">Search & Study Tools</div>
                      <p className="text-scripture-muted">
                        Search Bible text, notes, and annotations. View chapter summaries, book overviews, and theme tracking.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-2xl flex-shrink-0">💾</div>
                    <div>
                      <div className="font-medium text-scripture-text mb-1">Backup & Sync</div>
                      <p className="text-scripture-muted">
                        Export your data to cloud folders (iCloud Drive, Google Drive) for automatic syncing across devices.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Tips */}
              <div className="bg-scripture-overlay/30 rounded-lg p-4">
                <h3 className="text-sm font-ui font-semibold text-scripture-text mb-2">
                  Quick Tips
                </h3>
                <ul className="space-y-1.5 text-xs text-scripture-muted ml-4 list-disc">
                  <li>Use arrow keys or J/K to navigate between chapters</li>
                  <li>Press number keys 1-6 to quickly access toolbar tools</li>
                  <li>Press Cmd/Ctrl+F to search</li>
                  <li>Click verse numbers to add notes</li>
                  <li>Access Settings from the toolbar (⚙️ icon)</li>
                </ul>
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
    </>
  );
}
