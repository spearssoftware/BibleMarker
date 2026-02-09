/**
 * Virtual Keyboard Hook
 *
 * Handles iOS virtual keyboard avoidance by tracking the visual viewport
 * and exposing the keyboard height as a CSS custom property (--keyboard-height).
 * Fixed-position elements can use this to stay above the keyboard.
 *
 * Also scrolls the focused input into view when the keyboard opens.
 */

import { useEffect } from 'react';
import { isIOS } from '@/lib/platform';

export function useVirtualKeyboard(): void {
  useEffect(() => {
    // Only needed on iOS where the keyboard overlaps the WebView
    if (!isIOS()) return;

    const vv = window.visualViewport;
    if (!vv) return;

    function onResize() {
      if (!vv) return;

      // The keyboard height is the difference between the layout viewport
      // and the visual viewport heights.
      const keyboardHeight = Math.max(0, window.innerHeight - vv.height);
      document.documentElement.style.setProperty(
        '--keyboard-height',
        `${keyboardHeight}px`,
      );

      // Scroll the focused element into view when the keyboard opens
      if (keyboardHeight > 0 && document.activeElement) {
        const el = document.activeElement as HTMLElement;
        if (
          el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable
        ) {
          // Small delay lets the viewport settle before scrolling
          requestAnimationFrame(() => {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          });
        }
      }
    }

    vv.addEventListener('resize', onResize);
    // Set initial value
    onResize();

    return () => {
      vv.removeEventListener('resize', onResize);
      document.documentElement.style.removeProperty('--keyboard-height');
    };
  }, []);
}
