/**
 * useModal Hook
 * 
 * Provides common modal functionality:
 * - Keyboard handling (Esc to close)
 * - Scroll lock when modal is open
 * - Focus management
 */

import { useEffect, useRef } from 'react';

interface UseModalOptions {
  isOpen: boolean;
  onClose: () => void;
  /** Whether to lock scroll when modal is open */
  lockScroll?: boolean;
  /** Whether to handle Escape key */
  handleEscape?: boolean;
  /** Whether to restore focus on close */
  restoreFocus?: boolean;
  /** Initial focus element (optional) */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export function useModal({
  isOpen,
  onClose,
  lockScroll = true,
  handleEscape = true,
  restoreFocus = true,
  initialFocusRef,
}: UseModalOptions) {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save current active element for focus restoration
    if (restoreFocus) {
      previousActiveElement.current = document.activeElement as HTMLElement;
    }

    // Lock scroll if enabled
    if (lockScroll) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, lockScroll, restoreFocus]);

  useEffect(() => {
    if (!isOpen || !handleEscape) return;

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    // Use capture phase to ensure we catch Escape before other handlers
    document.addEventListener('keydown', handleEscapeKey, true);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey, true);
    };
  }, [isOpen, handleEscape, onClose]);

  useEffect(() => {
    if (!isOpen) {
      // Restore focus when modal closes
      if (restoreFocus && previousActiveElement.current) {
        previousActiveElement.current.focus();
        previousActiveElement.current = null;
      }
      return;
    }

    // Focus initial element or first focusable element
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else {
      // Auto-focus first focusable element in modal
      const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (modal) {
        const focusableElements = modal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0] as HTMLElement;
        if (firstFocusable) {
          firstFocusable.focus();
        }
      }
    }
  }, [isOpen, initialFocusRef, restoreFocus]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking directly on backdrop (not child elements)
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return {
    handleBackdropClick,
  };
}
