/**
 * useDropdownPosition Hook
 * 
 * Calculates optimal position for dropdown/picker modals relative to a trigger element.
 * Handles viewport constraints and alignment options.
 */

import { useEffect, useState, RefObject } from 'react';

export type DropdownAlignment = 'center' | 'left' | 'right';

interface UseDropdownPositionOptions {
  triggerRef: RefObject<HTMLElement | null>;
  /** Width of the dropdown in pixels */
  width: number;
  /** Alignment relative to trigger: center (default), left, or right */
  alignment?: DropdownAlignment;
  /** Offset from trigger bottom in pixels */
  offset?: number;
  /** Minimum margin from viewport edges */
  margin?: number;
  /** Whether to recalculate on window resize */
  observeResize?: boolean;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

export function useDropdownPosition({
  triggerRef,
  width,
  alignment = 'center',
  offset = 8,
  margin = 8,
  observeResize = true,
}: UseDropdownPositionOptions): DropdownPosition & { isReady: boolean } {
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, left: 0, width });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!triggerRef.current) {
      queueMicrotask(() => setIsReady(false));
      return;
    }

    const calculatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        queueMicrotask(() => setIsReady(false));
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Get safe area insets (fallback to reasonable values for iOS devices)
      const computedStyle = getComputedStyle(document.documentElement);
      const safeTop = parseInt(computedStyle.getPropertyValue('env(safe-area-inset-top)') || '0', 10) || 
                      (/iPhone/.test(navigator.userAgent) ? 59 : 0);
      const safeBottom = parseInt(computedStyle.getPropertyValue('env(safe-area-inset-bottom)') || '0', 10) || 
                         (/iPhone/.test(navigator.userAgent) ? 34 : 0);
      const safeLeft = parseInt(computedStyle.getPropertyValue('env(safe-area-inset-left)') || '0', 10) || 0;
      const safeRight = parseInt(computedStyle.getPropertyValue('env(safe-area-inset-right)') || '0', 10) || 0;

      // Calculate left position based on alignment
      let left: number;
      
      if (alignment === 'left') {
        left = triggerRect.left;
      } else if (alignment === 'right') {
        left = triggerRect.right - width;
      } else {
        // Center alignment (default)
        left = triggerRect.left + (triggerRect.width / 2) - (width / 2);
      }

      // Constrain to viewport with margin and safe areas
      const minLeft = margin + safeLeft;
      const maxLeft = viewportWidth - width - margin - safeRight;
      left = Math.max(minLeft, Math.min(left, maxLeft));

      // Position below trigger with offset
      const top = triggerRect.bottom + offset;

      // Check if dropdown would overflow bottom of viewport (accounting for safe area)
      const estimatedHeight = 300; // Rough estimate, could be passed as prop
      const maxBottom = viewportHeight - safeBottom - margin;
      const wouldOverflow = top + estimatedHeight > maxBottom;

      // If flipping above, ensure it doesn't go above safe area
      const minTop = safeTop + margin;
      let finalTop = wouldOverflow ? triggerRect.top - estimatedHeight - offset : top;
      finalTop = Math.max(minTop, finalTop);

      const nextPosition = {
        top: finalTop,
        left,
        width,
      };
      queueMicrotask(() => {
        setPosition(nextPosition);
        setIsReady(true);
      });
    };

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      calculatePosition();
    });

    if (observeResize) {
      window.addEventListener('resize', calculatePosition);
      window.addEventListener('scroll', calculatePosition, true);

      return () => {
        window.removeEventListener('resize', calculatePosition);
        window.removeEventListener('scroll', calculatePosition, true);
      };
    }
  }, [triggerRef, width, alignment, offset, margin, observeResize]);

  return { ...position, isReady };
}
