/**
 * Onboarding Tour Component
 *
 * Guided tour that highlights key features with a bottom-sheet card
 * that's always visible regardless of screen size.
 */

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { updatePreferences, getPreferences } from '@/lib/database';
import { useStudyStore } from '@/stores/studyStore';

interface TourStep {
  id: string;
  title: string;
  description: ReactNode;
  target?: string; // CSS selector for element to highlight
  action?: () => void; // Optional action to perform before showing step
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'navigation',
    title: 'Navigation Bar',
    description: 'Use the navigation bar to select translations, books, and chapters. You can view up to 3 translations side-by-side.',
    target: '[data-nav-bar]',
  },
  {
    id: 'reading',
    title: 'Bible Reading',
    description: 'Read Scripture here. Select text to open the selection menu, where you can apply key words, add as a keyword variant, add to observation lists, or jump straight to Reference for the Strong’s entry or cross-references. Click verse numbers to add notes.',
    target: '[data-bible-reader]',
  },
  {
    id: 'toolbar',
    title: 'Marking Toolbar',
    description: 'The toolbar opens Mark, Observe, Analyze, and Reference. All text marking flows through keywords for consistency across translations. Press 1–3 for quick access to Mark, Observe, and Analyze.',
    target: '[data-marking-toolbar]',
  },
  {
    id: 'keywords',
    title: 'Mark: Keyword, Variant, Apply',
    description: (
      <div className="space-y-2.5">
        <p>Three things to know:</p>
        <div>
          <div className="font-medium text-scripture-text">🔑 Keyword</div>
          <p className="ml-5">A word or concept you track. Gets a color and symbol, auto-highlights in every translation.</p>
          <p className="ml-5 italic text-xs">Example: keyword <strong>&ldquo;God&rdquo;</strong> → every &ldquo;God&rdquo; auto-highlights.</p>
        </div>
        <div>
          <div className="font-medium text-scripture-text">➕ Add as Variant</div>
          <p className="ml-5">Adds another word to an existing keyword so it also auto-matches.</p>
          <p className="ml-5 italic text-xs">Example: add <strong>&ldquo;LORD&rdquo;</strong> as a variant of &ldquo;God&rdquo; → both highlight everywhere.</p>
        </div>
        <div>
          <div className="font-medium text-scripture-text">🎯 Apply</div>
          <p className="ml-5">Marks just this one occurrence. Does <em>not</em> change what the keyword matches elsewhere.</p>
          <p className="ml-5 italic text-xs">Example: in &ldquo;And <strong>He</strong> spoke…&rdquo; the &ldquo;He&rdquo; means Jesus. Apply the Jesus keyword to that &ldquo;He&rdquo; only. Not every &ldquo;He&rdquo; in the Bible refers to Jesus, so you don&rsquo;t want it as a variant.</p>
        </div>
        <p className="text-xs">Open Mark from the toolbar (✏️ or press 1).</p>
      </div>
    ),
    target: '[data-toolbar-keywords]',
  },
  {
    id: 'observe',
    title: 'Observe',
    description: 'Capture observations from the text. Free-form lists per chapter, plus people, places, and conclusions. Add entries from the selection menu or manage them here. Access from the toolbar (magnifying glass icon or press 2).',
    target: '[data-toolbar-observe]',
  },
  {
    id: 'analyze',
    title: 'Analyze',
    description: 'Step back and look at the bigger picture: chapter summaries, book overview, themes, timeline, places map, and your interpretation and application notes. Access from the toolbar (chart icon or press 3).',
    target: '[data-toolbar-analyze]',
  },
  {
    id: 'reference',
    title: 'Reference',
    description: 'Look up the people, places, Strong’s entries, Hebrew/Greek words, and cross-references for what you’re reading. The Chapter tab shows everything tied to the current chapter; you can also lookup any word, verse, or Strong’s number directly from the selection menu. Access from the toolbar (book icon).',
    target: '[data-toolbar-reference]',
  },
  {
    id: 'search',
    title: 'Search',
    description: 'Search Bible text, notes, and annotations. Press Cmd/Ctrl+F or click the search icon in the navigation bar.',
    target: '[data-nav-search]',
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Configure translations, appearance, backup/restore, and more. Click the gear icon in the bottom toolbar.',
    target: '[data-toolbar-settings]',
  },
  {
    id: 'studies',
    title: 'Create a Study',
    description: 'Studies let you organize your keywords, notes, and observations around a topic or book. Find them under Settings \u2192 Studies. You can create one now or skip and start reading.',
  },
];

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const stepRef = useRef<number>(0);
  const [showTour, setShowTour] = useState(true);
  const [newStudyName, setNewStudyName] = useState('');
  const [studyCreated, setStudyCreated] = useState(false);
  const { createStudy, setActiveStudy } = useStudyStore();

  useEffect(() => {
    stepRef.current = currentStep;
    updateHighlight();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- updateHighlight is intentional on currentStep only
  }, [currentStep]);

  function updateHighlight() {
    const step = TOUR_STEPS[currentStep];
    if (!step?.target) {
      setHighlightRect(null);
      return;
    }

    if (step.action) {
      step.action();
      setTimeout(findAndHighlight, 100);
    } else {
      setTimeout(findAndHighlight, 50);
    }
  }

  function findAndHighlight() {
    const step = TOUR_STEPS[stepRef.current];
    if (!step?.target) {
      setHighlightRect(null);
      return;
    }

    const element = document.querySelector(step.target);
    if (!element) {
      setTimeout(() => {
        if (stepRef.current < TOUR_STEPS.length - 1) {
          setCurrentStep(stepRef.current + 1);
        } else {
          handleComplete();
        }
      }, 500);
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setTimeout(() => {
        if (stepRef.current < TOUR_STEPS.length - 1) {
          setCurrentStep(stepRef.current + 1);
        } else {
          handleComplete();
        }
      }, 500);
      return;
    }

    setHighlightRect(rect);
  }

  useEffect(() => {
    if (!showTour) return;

    const handleUpdate = () => findAndHighlight();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- findAndHighlight intentional on showTour only
  }, [showTour]);

  function handleNext() {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }

  function handleSkip() {
    handleComplete();
  }

  async function handleCreateStudy() {
    if (!newStudyName.trim()) return;
    const study = await createStudy(newStudyName.trim());
    await setActiveStudy(study.id);
    setStudyCreated(true);
    setNewStudyName('');
  }

  async function handleComplete() {
    setShowTour(false);
    const prefs = await getPreferences();
    await updatePreferences({
      onboarding: {
        ...prefs.onboarding!,
        hasCompletedTour: true,
      },
    });
    onComplete();
  }

  const step = TOUR_STEPS[currentStep];
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  // Anchor sheet to top when the highlighted element is in the bottom half, bottom otherwise
  const anchorTop = highlightRect
    ? highlightRect.top + highlightRect.height / 2 > window.innerHeight / 2
    : false;

  if (!step || !showTour) {
    return null;
  }

  const sheetContent = (
    <div className="bg-scripture-surface shadow-2xl border border-scripture-overlayBorder max-w-lg mx-auto"
      style={{ borderRadius: anchorTop ? '0 0 1rem 1rem' : '1rem 1rem 0 0' }}
    >
      {/* Progress bar */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between text-xs text-scripture-muted mb-1">
          <span>Step {currentStep + 1} of {TOUR_STEPS.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 bg-scripture-overlay rounded-full overflow-hidden">
          <div
            className="h-full bg-scripture-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-2">
        <h3 className="text-lg font-ui font-semibold text-scripture-text mb-1">
          {step.title}
        </h3>
        <div className="text-sm text-scripture-muted leading-relaxed">
          {step.description}
        </div>

        {/* Studies step: inline create form */}
        {step.id === 'studies' && (
          <div className="mt-3">
            {studyCreated ? (
              <p className="text-sm text-scripture-success font-medium">Study created! You can manage studies in Settings &rarr; Studies.</p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStudyName}
                  onChange={(e) => setNewStudyName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateStudy(); }}
                  placeholder="Study name..."
                  className="flex-1 px-3 py-2 text-sm bg-scripture-elevated border border-scripture-border/50 rounded-lg text-scripture-text placeholder:text-scripture-muted focus:outline-none focus:border-scripture-accent"
                />
                <button
                  onClick={handleCreateStudy}
                  disabled={!newStudyName.trim()}
                  className="px-3 py-2 text-sm bg-scripture-accent text-scripture-bg rounded-lg disabled:opacity-40 hover:bg-scripture-accent/90 transition-colors"
                >
                  Create
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 pb-4 pt-2">
        {currentStep < TOUR_STEPS.length - 1 && (
          <button
            onClick={handleSkip}
            className="px-3 py-2 text-xs font-ui bg-scripture-surface border border-scripture-overlayBorder
                     text-scripture-text rounded-lg hover:bg-scripture-overlay/50 transition-colors"
          >
            Skip
          </button>
        )}
        <button
          onClick={handleBack}
          disabled={currentStep === 0}
          className="px-3 py-2 text-xs font-ui bg-scripture-surface border border-scripture-overlayBorder
                   text-scripture-text rounded-lg hover:bg-scripture-overlay/50 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-scripture-surface"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex-1 px-3 py-2 text-xs font-ui bg-scripture-accent text-scripture-bg rounded-lg
                   hover:bg-scripture-accent/90 transition-colors"
        >
          {currentStep === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Backdrop with cutout */}
      <div
        className="fixed inset-0 z-[300] bg-black/60 transition-opacity"
        onClick={handleNext}
        style={{
          clipPath: highlightRect
            ? `polygon(
                0% 0%,
                0% 100%,
                ${highlightRect.left}px 100%,
                ${highlightRect.left}px ${highlightRect.top}px,
                ${highlightRect.right}px ${highlightRect.top}px,
                ${highlightRect.right}px ${highlightRect.bottom}px,
                ${highlightRect.left}px ${highlightRect.bottom}px,
                ${highlightRect.left}px 100%,
                100% 100%,
                100% 0%
              )`
            : undefined,
        }}
      />

      {/* Highlight border */}
      {highlightRect && (
        <div
          className="fixed z-[301] pointer-events-none border-2 border-scripture-accent rounded-lg shadow-lg animate-pulse"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
          }}
        />
      )}

      {/* Sheet card — anchors to top or bottom depending on where the highlight is */}
      <div
        className="fixed z-[302] left-0 right-0 px-4 animate-scale-in"
        style={anchorTop
          ? { top: 0, paddingTop: 'env(safe-area-inset-top, 0px)' }
          : { bottom: 0, paddingBottom: 'env(safe-area-inset-bottom, 16px)' }
        }
      >
        {sheetContent}
      </div>
    </>
  );
}
