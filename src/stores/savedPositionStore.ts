/**
 * Saved Position Store
 *
 * The verse the reader was on, kept on this device (never synced) so the app
 * can reopen there. It carries its own book and chapter, so it never needs
 * clearing when the reader changes chapter: the next verse report replaces it.
 * `pendingRestore` is the one gate: while it is set, nothing is saved, so the
 * launch-time "verse 1" reports cannot overwrite the stored verse.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SavedPosition {
  book: string;
  chapter: number;
  verse: number;
}

interface SavedPositionState {
  saved: SavedPosition | null;
  /** Set at launch when the saved verse is past verse 1; not persisted. */
  pendingRestore: SavedPosition | null;
  save: (book: string, chapter: number, verse: number) => void;
  /** Ends a pending restore; `clear` also forgets the saved verse. */
  settleRestore: (clear?: boolean) => void;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function parseSaved(value: unknown): SavedPosition | null {
  if (typeof value !== 'object' || value === null) return null;
  const { book, chapter, verse } = value as Record<string, unknown>;
  if (typeof book !== 'string' || !isPositiveInteger(chapter) || !isPositiveInteger(verse)) {
    return null;
  }
  return { book, chapter, verse };
}

export const useSavedPositionStore = create<SavedPositionState>()(
  persist(
    (set, get) => ({
      saved: null,
      pendingRestore: null,
      save: (book, chapter, verse) => {
        const { pendingRestore, saved } = get();
        if (pendingRestore) return;
        if (saved && saved.book === book && saved.chapter === chapter && saved.verse === verse) return;
        set({ saved: { book, chapter, verse } });
      },
      settleRestore: (clear = false) => {
        set(clear ? { pendingRestore: null, saved: null } : { pendingRestore: null });
      },
    }),
    {
      name: 'saved-reading-position',
      partialize: state => ({ saved: state.saved }),
      merge: (persisted, current) => {
        const saved = parseSaved((persisted as { saved?: unknown } | undefined)?.saved);
        return {
          ...current,
          saved,
          pendingRestore: saved && saved.verse > 1 ? saved : null,
        };
      },
    }
  )
);
