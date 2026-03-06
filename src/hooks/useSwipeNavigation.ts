import { useRef, useCallback } from 'react';

interface SwipeNavigationOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  threshold?: number;
  edgeZone?: number;
}

/**
 * Adds horizontal swipe gesture detection for chapter navigation.
 * Only triggers from edge swipes (starting near screen edges) to avoid
 * conflicting with text selection and vertical scrolling.
 */
export function useSwipeNavigation(
  { onSwipeLeft, onSwipeRight, threshold = 80, edgeZone = 40 }: SwipeNavigationOptions
) {
  const touchStart = useRef<{ x: number; y: number; time: number; fromEdge: boolean } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const viewportWidth = window.innerWidth;
    const fromEdge = touch.clientX < edgeZone || touch.clientX > viewportWidth - edgeZone;

    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      fromEdge,
    };
  }, [edgeZone]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current?.fromEdge) {
      touchStart.current = null;
      return;
    }

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    const elapsed = Date.now() - touchStart.current.time;

    touchStart.current = null;

    // Must be mostly horizontal (not a scroll) and fast enough
    if (Math.abs(dx) < threshold || Math.abs(dy) > Math.abs(dx) || elapsed > 500) return;

    if (dx > 0) {
      onSwipeRight();
    } else {
      onSwipeLeft();
    }
  }, [threshold, onSwipeLeft, onSwipeRight]);

  return { handleTouchStart, handleTouchEnd };
}
