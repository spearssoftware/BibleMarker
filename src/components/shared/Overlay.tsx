/**
 * Unified Overlay Component
 * 
 * Standardized overlay component for bottom sheet style overlays (like toolbar overlays).
 * Provides consistent structure, animations, and z-index management.
 */

import { ReactNode } from 'react';
import { Z_INDEX } from '@/lib/modalConstants';

interface OverlayProps {
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Callback when overlay should close (optional) */
  onClose?: () => void;
  /** Maximum height for the overlay (default: 50vh) */
  maxHeight?: string;
  /** Overlay content */
  children: ReactNode;
  /** Z-index for the overlay (defaults to Z_INDEX.TOOLBAR_OVERLAY) */
  zIndex?: number;
  /** Additional className */
  className?: string;
  /** Whether to show backdrop */
  showBackdrop?: boolean;
  /** Backdrop click handler */
  onBackdropClick?: () => void;
}

export function Overlay({
  isOpen,
  onClose,
  maxHeight = '50vh',
  children,
  zIndex = Z_INDEX.TOOLBAR_OVERLAY,
  className = '',
  showBackdrop = false,
  onBackdropClick,
}: OverlayProps) {
  if (!isOpen) return null;

  const handleBackdropClick = () => {
    if (onBackdropClick) {
      onBackdropClick();
    } else if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {showBackdrop && (
        <div
          className="fixed inset-0 bg-black/40"
          style={{ zIndex: zIndex - 1 }}
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}
      <div
        className={`bg-scripture-surface animate-slide-up shadow-lg 
                   flex flex-col overflow-hidden flex-shrink-0 ${className}`}
        style={{ zIndex, maxHeight }}
        onWheel={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="bg-scripture-surface flex-1 min-h-0 flex flex-col overflow-hidden mx-2 my-2 rounded-xl">
          {children}
        </div>
      </div>
    </>
  );
}
