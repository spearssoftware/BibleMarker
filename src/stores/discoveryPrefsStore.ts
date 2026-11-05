/**
 * Discovery Prefs Store
 *
 * Device-local UI preferences for the Discover panel. `lookCloserOpen` is
 * unset until the reader first toggles Look closer, after which their choice
 * beats the mode default.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DiscoveryPrefsState {
  lookCloserOpen: boolean | undefined;
  setLookCloserOpen: (open: boolean) => void;
}

export const useDiscoveryPrefsStore = create<DiscoveryPrefsState>()(
  persist(
    set => ({
      lookCloserOpen: undefined,
      setLookCloserOpen: open => set({ lookCloserOpen: open }),
    }),
    {
      name: 'discovery-prefs',
      partialize: state => ({ lookCloserOpen: state.lookCloserOpen }),
    }
  )
);
