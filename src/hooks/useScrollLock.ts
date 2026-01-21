/**
 * useScrollLock Hook
 * 
 * Locks body scroll when enabled, with support for modal stack.
 * Prevents background scrolling when modals are open.
 */

import { useEffect } from 'react';

// Track how many modals are requesting scroll lock
let scrollLockCount = 0;

export function useScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    // Increment lock count
    scrollLockCount++;

    // Lock scroll if this is the first lock
    if (scrollLockCount === 1) {
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;
      
      // Calculate scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      return () => {
        scrollLockCount--;
        
        // Only restore if no other modals are locking
        if (scrollLockCount === 0) {
          document.body.style.overflow = originalOverflow;
          document.body.style.paddingRight = originalPaddingRight;
        }
      };
    } else {
      // Just decrement on cleanup
      return () => {
        scrollLockCount--;
      };
    }
  }, [isLocked]);
}
