/**
 * Confirmation Dialog Component
 * 
 * Custom confirmation dialog that properly integrates with the app's modal system.
 * Replaces native confirm() dialogs which can be blocked by overlays.
 */

import { ModalBackdrop } from './ModalBackdrop';
import { Z_INDEX } from '@/lib/modalConstants';
import { useModal } from '@/hooks/useModal';

interface ConfirmationDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Title of the confirmation dialog */
  title: string;
  /** Message to display */
  message: string;
  /** Label for the confirm button */
  confirmLabel?: string;
  /** Label for the cancel button */
  cancelLabel?: string;
  /** Callback when user confirms */
  onConfirm: () => void;
  /** Callback when user cancels or closes */
  onCancel: () => void;
  /** Whether the confirm action is destructive (default: true) */
  destructive?: boolean;
}

export function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = true,
}: ConfirmationDialogProps) {
  const { handleBackdropClick } = useModal({
    isOpen,
    onClose: onCancel,
    lockScroll: true,
    handleEscape: true,
  });

  if (!isOpen) return null;

  return (
    <>
      <ModalBackdrop onClick={handleBackdropClick} zIndex={Z_INDEX.MODAL_CRITICAL} />
      <div
        className="fixed inset-x-4 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[61]
                   max-w-md w-full overflow-hidden flex flex-col animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-message"
      >
        <div className="bg-scripture-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col mx-2 my-2">
          {/* Header */}
          <div className="p-4 border-b border-scripture-overlayBorder/50">
            <h2 id="confirmation-title" className="text-lg font-ui font-semibold text-scripture-text">
              {title}
            </h2>
          </div>

          {/* Message */}
          <div className="p-4">
            <p id="confirmation-message" className="text-scripture-text">
              {message}
            </p>
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-scripture-overlayBorder/50 flex gap-2 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-ui bg-scripture-elevated text-scripture-text rounded-lg
                       hover:bg-scripture-border/50 transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-sm font-ui rounded-lg transition-colors ${
                destructive
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-scripture-accent text-scripture-bg hover:bg-scripture-accent/90'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
