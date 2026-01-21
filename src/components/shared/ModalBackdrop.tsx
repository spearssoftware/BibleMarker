/**
 * Modal Backdrop Component
 * 
 * Consistent backdrop for modals with blur and click-to-close functionality.
 */

interface ModalBackdropProps {
  /** Callback when backdrop is clicked */
  onClick: (e: React.MouseEvent) => void;
  /** Z-index for the backdrop (default: 40) */
  zIndex?: number;
  /** Additional className */
  className?: string;
}

export function ModalBackdrop({ 
  onClick, 
  zIndex = 40,
  className = '',
}: ModalBackdropProps) {
  return (
    <div
      className={`fixed inset-0 bg-black/20 ${className}`}
      style={{ zIndex }}
      onClick={onClick}
      aria-hidden="true"
    />
  );
}
