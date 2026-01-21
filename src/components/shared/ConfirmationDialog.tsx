/**
 * Confirmation Dialog Component
 * 
 * Custom confirmation dialog that properly integrates with the app's modal system.
 * Replaces native confirm() dialogs which can be blocked by overlays.
 */

import { Modal } from './Modal';
import { Button } from './Button';
import { Z_INDEX } from '@/lib/modalConstants';

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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      size="sm"
      zIndex={Z_INDEX.MODAL_CRITICAL}
      showCloseButton={false}
    >
      <p className="text-scripture-text">
        {message}
      </p>
      <div className="mt-4 flex gap-2 justify-end">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
