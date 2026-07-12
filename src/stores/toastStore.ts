/**
 * Toast Store
 *
 * Global queue for brief, auto-dismissing notifications. Replaces native
 * alert() calls, which render poorly (and block the event loop) on iOS.
 *
 * Use the imperative `toast` helper from anywhere — including non-component
 * code and async callbacks — as a near 1:1 replacement for alert():
 *   toast.error('Failed to save')
 *   toast.success('Backup restored')
 */

import { create } from 'zustand';

export type ToastVariant = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, variant: ToastVariant) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, variant) =>
    set((state) => ({
      toasts: [...state.toasts, { id: crypto.randomUUID(), message, variant }],
    })),
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helper — callable outside React (event handlers, async fns). */
export const toast = {
  error: (message: string) => useToastStore.getState().show(message, 'error'),
  success: (message: string) => useToastStore.getState().show(message, 'success'),
  info: (message: string) => useToastStore.getState().show(message, 'info'),
};
