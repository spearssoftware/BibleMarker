/**
 * Discovery Prefs Store
 *
 * Device-local UI preferences for the Discover panel. `lookCloserOpen` is
 * unset until the reader first toggles Look closer, after which their choice
 * beats the mode default. `lookCloserForcedOpen` is session-only (never
 * persisted): something the reader just did needs the section visible.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DiscoveryPrefsState {
  lookCloserOpen: boolean | undefined;
  lookCloserForcedOpen: boolean;
  /** Records the reader's own choice and releases any session force-open so the toggle works. */
  setLookCloserOpen: (open: boolean) => void;
  forceLookCloserOpen: () => void;
}

export const useDiscoveryPrefsStore = create<DiscoveryPrefsState>()(
  persist(
    set => ({
      lookCloserOpen: undefined,
      lookCloserForcedOpen: false,
      setLookCloserOpen: open => set({ lookCloserOpen: open, lookCloserForcedOpen: false }),
      forceLookCloserOpen: () => set({ lookCloserForcedOpen: true }),
    }),
    {
      name: 'discovery-prefs',
      partialize: state => ({ lookCloserOpen: state.lookCloserOpen }),
    }
  )
);
