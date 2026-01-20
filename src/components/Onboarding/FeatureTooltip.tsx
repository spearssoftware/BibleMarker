/**
 * Feature Tooltip Component
 * 
 * Contextual tooltip that appears on first use of a feature.
 */

import { useState, useEffect, useRef } from 'react';
import { getPreferences, updatePreferences } from '@/lib/db';

interface FeatureTooltipProps {
  id: string; // Unique ID for this tooltip
  message: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
  delay?: number; // Delay before showing (ms)
}

export function FeatureTooltip({ 
  id, 
  message, 
  position = 'top',
  children,
  delay = 500,
}: FeatureTooltipProps) {
  const [show, setShow] = useState(false);
  const [hasBeenDismissed, setHasBeenDismissed] = useState(false);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    async function checkTooltipState() {
      const prefs = await getPreferences();
      const dismissed = prefs.onboarding?.dismissedTooltips?.includes(id) ?? false;
      setHasBeenDismissed(dismissed);
      
      if (!dismissed && containerRef.current) {
        // Show tooltip after delay
        timeoutRef.current = window.setTimeout(() => {
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setTooltipRect(rect);
            setShow(true);
          }
        }, delay);
      }
    }
    
    checkTooltipState();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [id, delay]);

  async function handleDismiss() {
    setShow(false);
    setHasBeenDismissed(true);
    
    const prefs = await getPreferences();
    const dismissedTooltips = prefs.onboarding?.dismissedTooltips ?? [];
    if (!dismissedTooltips.includes(id)) {
      await updatePreferences({
        onboarding: {
          ...prefs.onboarding!,
          dismissedTooltips: [...dismissedTooltips, id],
        },
      });
    }
  }

  if (hasBeenDismissed) {
    return <>{children}</>;
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      {children}
      
      {show && tooltipRect && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[250] bg-black/20"
            onClick={handleDismiss}
          />
          
          {/* Tooltip */}
          <div
            className="fixed z-[251] max-w-xs animate-scale-in"
            style={{
              top: position === 'bottom' 
                ? tooltipRect.bottom + 8 
                : position === 'top'
                ? tooltipRect.top - 8
                : tooltipRect.top + tooltipRect.height / 2,
              left: position === 'right'
                ? tooltipRect.right + 8
                : position === 'left'
                ? tooltipRect.left - 8
                : tooltipRect.left + tooltipRect.width / 2,
              transform: position === 'top' || position === 'bottom'
                ? 'translateX(-50%)'
                : position === 'left'
                ? 'translate(-100%, -50%)'
                : 'translateY(-50%)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-scripture-surface rounded-lg shadow-lg p-3 border border-scripture-overlayBorder">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-xs text-scripture-text leading-relaxed">
                    {message}
                  </p>
                </div>
                <button
                  onClick={handleDismiss}
                  className="text-scripture-muted hover:text-scripture-text transition-colors flex-shrink-0"
                  aria-label="Dismiss tooltip"
                >
                  ✕
                </button>
              </div>
            </div>
            
            {/* Arrow */}
            <div
              className="absolute w-2 h-2 bg-scripture-surface border-l border-b border-scripture-overlayBorder"
              style={{
                top: position === 'bottom' ? -4 : position === 'top' ? 'auto' : '50%',
                bottom: position === 'top' ? -4 : undefined,
                left: position === 'left' ? 'auto' : position === 'right' ? -4 : '50%',
                right: position === 'right' ? 'auto' : undefined,
                transform: position === 'top' 
                  ? 'translateX(-50%) rotate(45deg)'
                  : position === 'bottom'
                  ? 'translateX(-50%) rotate(-135deg)'
                  : position === 'left'
                  ? 'translateY(-50%) rotate(135deg)'
                  : 'translateY(-50%) rotate(-45deg)',
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
