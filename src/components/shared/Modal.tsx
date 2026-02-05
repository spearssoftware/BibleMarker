/**
 * Unified Modal Component
 * 
 * Standardized modal component that provides consistent structure, styling, and behavior
 * across all modals in the application.
 */

import { ReactNode } from 'react';
import { ModalBackdrop } from './ModalBackdrop';
import { Z_INDEX } from '@/lib/modalConstants';
import { useModal } from '@/hooks/useModal';

interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Optional title for the modal header */
  title?: string;
  /** Size variant for the modal */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Whether to show close button in header */
  showCloseButton?: boolean;
  /** Z-index for the modal (defaults to Z_INDEX.MODAL) */
  zIndex?: number;
  /** Modal content */
  children: ReactNode;
  /** Optional footer content */
  footer?: ReactNode;
  /** Optional header actions (rendered next to close button) */
  headerActions?: ReactNode;
  /** Whether to lock scroll when modal is open */
  lockScroll?: boolean;
  /** Whether to handle Escape key */
  handleEscape?: boolean;
  /** Initial focus ref */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Additional className for the modal container */
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-full',
};

export function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  showCloseButton = true,
  zIndex = Z_INDEX.MODAL,
  children,
  footer,
  headerActions,
  lockScroll = true,
  handleEscape = true,
  initialFocusRef,
  className = '',
}: ModalProps) {
  const { handleBackdropClick } = useModal({
    isOpen,
    onClose,
    lockScroll,
    handleEscape,
    initialFocusRef,
  });

  if (!isOpen) return null;

  const backdropZIndex = zIndex - 1;

  return (
    <>
      <ModalBackdrop onClick={handleBackdropClick} zIndex={backdropZIndex} />
      {/* Outer container handles safe areas and centering */}
      <div
        className="fixed inset-0 flex items-center justify-center
                   pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
                   pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]
                   p-4 pointer-events-none"
        style={{ zIndex }}
      >
        {/* Inner modal container */}
        <div
          className={`${SIZE_CLASSES[size]} w-full max-h-[80vh] overflow-hidden flex flex-col
                     animate-scale-in pointer-events-auto ${className}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
        >
        <div className="bg-scripture-surface rounded-xl shadow-modal dark:shadow-modal-dark overflow-hidden flex flex-col h-full mx-2 my-2">
          {/* Header */}
          {(title || showCloseButton || headerActions) && (
            <div className="flex items-center justify-between p-4 border-b border-scripture-border/50 flex-shrink-0">
              {title && (
                <h2 id="modal-title" className="text-xl font-ui font-semibold text-scripture-text">
                  {title}
                </h2>
              )}
              <div className="flex items-center gap-2 ml-auto">
                {headerActions}
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="p-4 border-t border-scripture-border/50 flex-shrink-0">
              {footer}
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  );
}
