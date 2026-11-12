/**
 * Discovery Prefs Store
 *
 * Device-local UI preferences for the Discover panel. `lookCloserOpen` is
 * unset until the reader first toggles Look closer, after which their choice
 * beats the mode default. `mapLayer` is shared by the Setting map and its
 * full-map modal so a satellite choice carries between them and across
 * chapters. `markingStyle` is the style row's last choice on the discovery
 * selection sheet (highlight, underline, or text color).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MapLayer } from '@/lib/map/mapStyle';
import type { TextAnnotation } from '@/types';

export type MarkingStyleChoice = TextAnnotation['type'];

interface DiscoveryPrefsState {
  lookCloserOpen: boolean | undefined;
  setLookCloserOpen: (open: boolean) => void;
  mapLayer: MapLayer;
  setMapLayer: (layer: MapLayer) => void;
  markingStyle: MarkingStyleChoice;
  setMarkingStyle: (style: MarkingStyleChoice) => void;
  /** Set when the reader closes the Discover panel in Discover mode on a wide layout; stops it reopening by default. */
  discoverPanelClosed: boolean;
  setDiscoverPanelClosed: (closed: boolean) => void;
}

export const useDiscoveryPrefsStore = create<DiscoveryPrefsState>()(
  persist(
    set => ({
      lookCloserOpen: undefined,
      setLookCloserOpen: open => set({ lookCloserOpen: open }),
      mapLayer: 'map',
      setMapLayer: layer => set({ mapLayer: layer }),
      markingStyle: 'highlight',
      setMarkingStyle: style => set({ markingStyle: style }),
      discoverPanelClosed: false,
      setDiscoverPanelClosed: closed => set({ discoverPanelClosed: closed }),
    }),
    {
      name: 'discovery-prefs',
      partialize: state => ({
        lookCloserOpen: state.lookCloserOpen,
        mapLayer: state.mapLayer,
        markingStyle: state.markingStyle,
        discoverPanelClosed: state.discoverPanelClosed,
      }),
    }
  )
);
