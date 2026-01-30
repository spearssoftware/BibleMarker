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

      // Constrain to viewport with margin
      left = Math.max(margin, Math.min(left, viewportWidth - width - margin));

      // Position below trigger with offset
      const top = triggerRect.bottom + offset;

      // Check if dropdown would overflow bottom of viewport
      // For now, we'll allow scrolling, but could add logic to flip above if needed
      const estimatedHeight = 300; // Rough estimate, could be passed as prop
      const wouldOverflow = top + estimatedHeight > viewportHeight;

      const nextPosition = {
        top: wouldOverflow ? triggerRect.top - estimatedHeight - offset : top,
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
