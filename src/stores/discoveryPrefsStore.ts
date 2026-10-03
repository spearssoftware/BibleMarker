/**
 * Discovery Prefs Store
 *
 * Device-local UI preferences for the Discover panel. `lookCloserOpen` is
 * unset until the reader first toggles Look closer, after which their choice
 * beats the mode default. `lookCloserForcedFor` is never persisted: the
 * chapter (`book:chapter`) where something the reader just did needs the
 * section visible. It stops applying once the reader moves to another chapter.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DiscoveryPrefsState {
  lookCloserOpen: boolean | undefined;
  lookCloserForcedFor: string | null;
  /** Records the reader's own choice and releases any session force-open so the toggle works. */
  setLookCloserOpen: (open: boolean) => void;
  forceLookCloserOpen: (book: string, chapter: number) => void;
}

export const useDiscoveryPrefsStore = create<DiscoveryPrefsState>()(
  persist(
    set => ({
      lookCloserOpen: undefined,
      lookCloserForcedFor: null,
      setLookCloserOpen: open => set({ lookCloserOpen: open, lookCloserForcedFor: null }),
      forceLookCloserOpen: (book, chapter) => set({ lookCloserForcedFor: `${book}:${chapter}` }),
    }),
    {
      name: 'discovery-prefs',
      partialize: state => ({ lookCloserOpen: state.lookCloserOpen }),
    }
  )
);
