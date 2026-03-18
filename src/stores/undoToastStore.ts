/**
 * Undo Toast Store
 *
 * Global state for showing a brief undo toast notification.
 */

import { create } from 'zustand';

interface UndoToastState {
  message: string | null;
  onUndo: (() => void) | null;
  show: (message: string, onUndo: () => void) => void;
  dismiss: () => void;
}

export const useUndoToastStore = create<UndoToastState>((set) => ({
  message: null,
  onUndo: null,

  show: (message, onUndo) => set({ message, onUndo }),
  dismiss: () => set({ message: null, onUndo: null }),
}));
