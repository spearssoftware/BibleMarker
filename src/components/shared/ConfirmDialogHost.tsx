/**
 * ConfirmDialogHost
 *
 * Renders the single active confirm dialog from useConfirmDialogStore. Mount
 * once at the app root. Application code triggers it via `confirmDialog(...)`.
 */

import { ConfirmationDialog } from './ConfirmationDialog';
import { useConfirmDialogStore } from '@/stores/confirmDialogStore';

export function ConfirmDialogHost() {
  const { current, resolve } = useConfirmDialogStore();

  return (
    <ConfirmationDialog
      isOpen={current !== null}
      title={current?.title ?? ''}
      message={current?.message ?? ''}
      confirmLabel={current?.confirmLabel}
      cancelLabel={current?.cancelLabel}
      destructive={current?.destructive ?? true}
      onConfirm={() => resolve(true)}
      onCancel={() => resolve(false)}
    />
  );
}
