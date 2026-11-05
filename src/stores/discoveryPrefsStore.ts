/**
 * Discovery Prefs Store
 *
 * Device-local UI preferences for the Discover panel. `lookCloserOpen` is
 * unset until the reader first toggles Look closer, after which their choice
 * beats the mode default. `mapLayer` is shared by the Setting map and its
 * full-map modal so a satellite choice carries between them and across
 * chapters.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MapLayer = 'map' | 'satellite';

interface DiscoveryPrefsState {
  lookCloserOpen: boolean | undefined;
  setLookCloserOpen: (open: boolean) => void;
  mapLayer: MapLayer;
  setMapLayer: (layer: MapLayer) => void;
}

export const useDiscoveryPrefsStore = create<DiscoveryPrefsState>()(
  persist(
    set => ({
      lookCloserOpen: undefined,
      setLookCloserOpen: open => set({ lookCloserOpen: open }),
      mapLayer: 'map',
      setMapLayer: layer => set({ mapLayer: layer }),
    }),
    {
      name: 'discovery-prefs',
      partialize: state => ({ lookCloserOpen: state.lookCloserOpen, mapLayer: state.mapLayer }),
    }
  )
);
