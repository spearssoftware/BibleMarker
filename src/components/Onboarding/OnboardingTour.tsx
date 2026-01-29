/**
 * Onboarding Tour Component
 * 
 * Guided tour that highlights key features with step-by-step instructions.
 */

import { useState, useEffect, useRef } from 'react';
import { updatePreferences, getPreferences } from '@/lib/db';

interface TourStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector for element to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: () => void; // Optional action to perform before showing step
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'navigation',
    title: 'Navigation Bar',
    description: 'Use the navigation bar to select translations, books, and chapters. You can view up to 3 translations side-by-side.',
    target: '[data-nav-bar]',
    position: 'bottom',
  },
  {
    id: 'reading',
    title: 'Bible Reading',
    description: 'Read Scripture here. Select text to open the selection menu—apply key words, add to observation lists, or open Observe tools. Click verse numbers to add notes or view cross-references.',
    target: '[data-bible-reader]',
    position: 'top',
  },
  {
    id: 'toolbar',
    title: 'Marking Toolbar',
    description: 'Use the toolbar to access Key Words, Observe, Study, and Settings. All text marking is done through keywords. Press 1–4 for quick access.',
    target: '[data-marking-toolbar]',
    position: 'top',
  },
  {
    id: 'keywords',
    title: 'Key Words',
    description: 'Define key words to automatically highlight across translations. Apply them from the selection menu or here. Access from the toolbar (🔑 icon or press 1).',
    target: '[data-toolbar-keywords]',
    position: 'top',
  },
  {
    id: 'observe',
    title: 'Observe',
    description: 'Observation tools: lists, time, places, contrasts, conclusions, and more. Add to lists from the selection menu or manage them here. Access from the toolbar (🔍 icon or press 2).',
    target: '[data-toolbar-observe]',
    position: 'top',
  },
  {
    id: 'study-tools',
    title: 'Study Tools',
    description: 'View chapter summaries, book overviews, and theme tracking. Access from the toolbar (📚 icon or press 3).',
    target: '[data-toolbar-study]',
    position: 'top',
  },
  {
    id: 'search',
    title: 'Search',
    description: 'Search Bible text, notes, and annotations. Press Cmd/Ctrl+F or click the search icon in the navigation bar.',
    target: '[data-nav-search]',
    position: 'bottom',
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Configure translations, appearance, backup/restore, and more. Access from the toolbar (⚙️ icon or press 4).',
    target: '[data-toolbar-settings]',
    position: 'top',
  },
];

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; position?: string } | null>(null);
  const stepRef = useRef<number>(0);
  const [showTour, setShowTour] = useState(true);

  useEffect(() => {
    stepRef.current = currentStep;
    updateHighlight();
  }, [currentStep]);

  function updateHighlight() {
    const step = TOUR_STEPS[currentStep];
    if (!step || !step.target) {
      setHighlightRect(null);
      setTooltipPosition(null);
      return;
    }

    // Execute action if present
    if (step.action) {
      step.action();
      // Wait a bit for UI to update
      setTimeout(() => {
        updateHighlightPosition();
      }, 100);
    } else {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        updateHighlightPosition();
      }, 50);
    }
  }

  function updateHighlightPosition() {
    const step = TOUR_STEPS[stepRef.current];
    if (!step || !step.target) {
      setHighlightRect(null);
      setTooltipPosition(null);
      return;
    }

    const element = document.querySelector(step.target);
    if (!element) {
      // Element not found, skip to next step after a delay
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
    
    // Only set highlight if element is visible
    if (rect.width === 0 && rect.height === 0) {
      // Element not visible, skip to next step
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

    // Calculate tooltip position based on step position preference
    // But adjust if it would go off-screen
    const spacing = 16;
    const tooltipHeight = 220; // Estimated tooltip height (including padding)
    const tooltipWidth = 384; // max-w-sm = 384px
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    let top = 0;
    let left = 0;
    let actualPosition = step.position || 'center';

    switch (step.position) {
      case 'top':
        // Try to position above the element
        left = rect.left + rect.width / 2;
        // Check if there's enough space above (need space for full tooltip height)
        if (rect.top < tooltipHeight + spacing) {
          // Not enough space above, position below instead
          top = rect.bottom + spacing;
          actualPosition = 'bottom';
        } else {
          // Enough space above, position tooltip above
          // For toolbar elements near bottom, add extra spacing to keep tooltip well above
          const isNearBottom = rect.bottom > viewportHeight * 0.7; // If element is in bottom 30% of screen
          if (isNearBottom) {
            // Position tooltip with extra spacing above toolbar (tooltip bottom will be at rect.top - extraSpacing)
            // Since transform is translate(-50%, -100%), the top coordinate is where the bottom of tooltip will be
            const extraSpacing = spacing * 3; // Extra space above toolbar
            top = rect.top - extraSpacing;
            // Ensure tooltip doesn't go off the top of viewport
            if (top - tooltipHeight < spacing) {
              top = tooltipHeight + spacing;
            }
          } else {
            // Normal spacing for elements higher up
            top = rect.top - spacing;
          }
          actualPosition = 'top';
        }
        break;
      case 'bottom':
        // Try to position below the element
        top = rect.bottom + spacing;
        left = rect.left + rect.width / 2;
        // Check if there's enough space below
        if (rect.bottom + tooltipHeight + spacing > viewportHeight) {
          // Not enough space below, position above instead
          top = rect.top;
          actualPosition = 'top';
        } else {
          // Enough space below
          actualPosition = 'bottom';
        }
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left;
        // Check if there's enough space on the left
        if (rect.left < tooltipWidth + spacing) {
          // Not enough space left, position right instead
          left = rect.right + spacing;
          actualPosition = 'right';
        } else {
          actualPosition = 'left';
        }
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + spacing;
        // Check if there's enough space on the right
        if (rect.right + tooltipWidth + spacing > viewportWidth) {
          // Not enough space right, position left instead
          left = rect.left;
          actualPosition = 'left';
        } else {
          actualPosition = 'right';
        }
        break;
      case 'center':
      default:
        top = rect.top + rect.height / 2;
        left = rect.left + rect.width / 2;
        // For center, try to keep it in viewport
        if (top + tooltipHeight / 2 > viewportHeight) {
          top = viewportHeight - tooltipHeight / 2 - spacing;
        }
        if (top - tooltipHeight / 2 < 0) {
          top = tooltipHeight / 2 + spacing;
        }
        actualPosition = 'center';
        break;
    }

    // Final bounds check - ensure tooltip stays within viewport
    // For horizontal positioning (top/bottom)
    if (actualPosition === 'top' || actualPosition === 'bottom') {
      left = Math.max(tooltipWidth / 2 + spacing, Math.min(left, viewportWidth - tooltipWidth / 2 - spacing));
      // For 'top', ensure tooltip doesn't go above viewport
      if (actualPosition === 'top' && top < tooltipHeight + spacing) {
        top = tooltipHeight + spacing;
      }
      // For 'bottom', ensure tooltip doesn't go below viewport
      if (actualPosition === 'bottom' && top + tooltipHeight > viewportHeight - spacing) {
        top = viewportHeight - tooltipHeight - spacing;
      }
    } else {
      // For vertical positioning (left/right)
      top = Math.max(tooltipHeight / 2 + spacing, Math.min(top, viewportHeight - tooltipHeight / 2 - spacing));
      if (actualPosition === 'left' && left < tooltipWidth + spacing) {
        left = tooltipWidth + spacing;
      }
      if (actualPosition === 'right' && left + tooltipWidth > viewportWidth - spacing) {
        left = viewportWidth - tooltipWidth - spacing;
      }
    }

    setTooltipPosition({ top, left, position: actualPosition });
  }

  // Update highlight on scroll/resize
  useEffect(() => {
    if (!showTour) return;
    
    const handleUpdate = () => {
      updateHighlightPosition();
    };
    
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    
    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
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

  if (!step || !showTour) {
    return null;
  }

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

      {/* Tooltip */}
      {tooltipPosition && (
        <div
          className="fixed z-[302] max-w-sm animate-scale-in"
          style={{
            top: tooltipPosition.position === 'top'
              ? `${tooltipPosition.top}px`
              : tooltipPosition.position === 'bottom'
              ? `${tooltipPosition.top}px`
              : `${tooltipPosition.top}px`,
            left: tooltipPosition.left,
            transform: tooltipPosition.position === 'top'
              ? 'translate(-50%, -100%)' // Position above, anchor to bottom of tooltip
              : tooltipPosition.position === 'bottom'
              ? 'translateX(-50%)' // Position below, anchor to top of tooltip
              : tooltipPosition.position === 'left'
              ? 'translate(-100%, -50%)'
              : tooltipPosition.position === 'right'
              ? 'translateY(-50%)'
              : 'translate(-50%, -50%)',
            maxHeight: 'calc(100vh - 2rem)',
            maxWidth: 'calc(100vw - 2rem)',
          }}
        >
          <div className="bg-scripture-surface rounded-lg shadow-2xl p-4 border border-scripture-overlayBorder max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar">
            {/* Progress indicator */}
            <div className="mb-3">
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
            <h3 className="text-lg font-ui font-semibold text-scripture-text mb-2">
              {step.title}
            </h3>
            <p className="text-sm text-scripture-muted mb-4">
              {step.description}
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleSkip}
                className="px-3 py-2 text-xs font-ui bg-scripture-surface border border-scripture-overlayBorder
                         text-scripture-text rounded-lg hover:bg-scripture-overlay/50 transition-colors"
              >
                Skip
              </button>
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
        </div>
      )}
    </>
  );
}
