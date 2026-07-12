/**
 * Confirm Dialog Store
 *
 * Promise-based imperative wrapper over <ConfirmationDialog>. Replaces native
 * confirm() with a minimal control-flow change — just add `await`:
 *
 *   if (await confirmDialog({ title: 'Delete study?', message: '…' })) {
 *     await deleteStudy(id);
 *   }
 *
 * Mount <ConfirmDialogHost /> once at the app root.
 */

import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Whether the confirm action is destructive (red button). Default true. */
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

interface ConfirmDialogState {
  current: PendingConfirm | null;
  open: (options: ConfirmOptions) => Promise<boolean>;
  resolve: (confirmed: boolean) => void;
}

export const useConfirmDialogStore = create<ConfirmDialogState>((set, get) => ({
  current: null,
  open: (options) =>
    new Promise<boolean>((resolve) => {
      // If a prior confirm is somehow still open, cancel it so its promise
      // never hangs (native confirm() was blocking, so this shouldn't happen).
      get().current?.resolve(false);
      set({ current: { ...options, resolve } });
    }),
  resolve: (confirmed) => {
    const pending = get().current;
    if (pending) pending.resolve(confirmed);
    set({ current: null });
  },
}));

/** Imperative helper — resolves true if confirmed, false if cancelled/closed. */
export const confirmDialog = (options: ConfirmOptions): Promise<boolean> =>
  useConfirmDialogStore.getState().open(options);
