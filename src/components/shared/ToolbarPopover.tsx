/**
 * ToolbarPopover
 *
 * Shared chrome for every dropdown opened from the reader's top toolbar.
 * Unifies what used to be four bespoke fixed-top modal panels onto one
 * anchored-popover pattern (reusing useDropdownPosition):
 *
 * - Desktop (>= 640px): anchored directly under its trigger button, no screen
 *   dim — a transparent full-screen catcher light-dismisses on outside click.
 *   Non-modal (role="dialog" without aria-modal).
 * - Phone (< 640px): the familiar full-width sheet under the bar with a dim
 *   backdrop and slide-down animation. Modal (aria-modal="true").
 *
 * Callers provide only the panel's inner content as children; ToolbarPopover
 * owns positioning, the backdrop, Escape handling, and focus restoration.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useDropdownPosition, type DropdownAlignment } from '@/hooks/useDropdownPosition';
import { useModal } from '@/hooks/useModal';
import { ModalBackdrop } from './ModalBackdrop';
import { Z_INDEX } from '@/lib/modalConstants';

const DESKTOP_QUERY = '(min-width: 640px)';

/**
 * True on >= 640px (Tailwind `sm`). Resilient to environments without
 * matchMedia (jsdom): defaults to desktop and skips the listener.
 */
function useIsDesktop(): boolean {
  const getMatch = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(DESKTOP_QUERY).matches
      : true;

  const [isDesktop, setIsDesktop] = useState(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

interface ToolbarPopoverProps {
  /** The toolbar button this popover anchors under (desktop). */
  triggerRef: RefObject<HTMLElement | null>;
  /** Desktop alignment relative to the trigger. */
  alignment?: DropdownAlignment;
  /** Desktop width in pixels. */
  width: number;
  /** Accessible label for the dialog. */
  label: string;
  onClose: () => void;
  /**
   * Extra classes for the panel surface — e.g. `max-h-[70vh] flex flex-col`
   * for pickers with a sticky header, or `max-h-[80vh] overflow-y-auto
   * custom-scrollbar` for a single scrolling pane.
   */
  panelClassName?: string;
  /** Element to focus on open (e.g. the current verse in a grid). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Lock body scroll while open. Honored on phone only (sheets). */
  lockScroll?: boolean;
  children: ReactNode;
}

export function ToolbarPopover({
  triggerRef,
  alignment = 'center',
  width,
  label,
  onClose,
  panelClassName = '',
  initialFocusRef,
  lockScroll = false,
  children,
}: ToolbarPopoverProps) {
  const isDesktop = useIsDesktop();
  const panelRef = useRef<HTMLDivElement>(null);

  const { top, left, width: resolvedWidth, isReady } = useDropdownPosition({
    triggerRef,
    width,
    alignment,
    offset: 8,
    observeResize: isDesktop,
  });

  const { handleBackdropClick } = useModal({
    isOpen: true,
    onClose,
    // Only lock scroll for phone sheets; a desktop popover stays non-modal.
    lockScroll: lockScroll && !isDesktop,
    handleEscape: true,
    initialFocusRef,
  });

  // Desktop is a non-modal popover with no covering backdrop, so light-dismiss
  // via an outside-pointerdown listener. This keeps the toolbar (which sits
  // above any backdrop in the z-stack) fully clickable while still closing on a
  // click anywhere outside the panel and its trigger.
  useEffect(() => {
    if (!isDesktop) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isDesktop, onClose, triggerRef]);

  const surface =
    'bg-scripture-surface rounded-2xl shadow-modal dark:shadow-modal-dark';

  if (isDesktop) {
    return (
      <div
        ref={panelRef}
        className={`fixed ${surface} transition-opacity duration-150 ${panelClassName}`}
        style={{
          top: `${top}px`,
          left: `${left}px`,
          width: `${resolvedWidth}px`,
          maxWidth: 'calc(100vw - 2rem)',
          zIndex: Z_INDEX.MODAL,
          opacity: isReady ? 1 : 0,
        }}
        role="dialog"
        aria-label={label}
      >
        {children}
      </div>
    );
  }

  return (
    <>
      <ModalBackdrop onClick={handleBackdropClick} zIndex={Z_INDEX.BACKDROP} />
      <div
        className={`fixed top-[60px] left-4 right-4 mt-safe-top animate-slide-down ${surface} ${panelClassName}`}
        style={{ zIndex: Z_INDEX.MODAL }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </>
  );
}
