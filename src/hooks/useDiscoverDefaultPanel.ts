import { useEffect } from 'react';
import { useEffectiveMode } from '@/lib/appMode';
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { usePanelStore } from '@/stores/panelStore';

/**
 * Opens the Discover panel by default in Discover mode on a wide layout.
 * Call it after `useLayoutOrientation()` in the same component: `wide` is a
 * dependency only, because the render-time value can be a stale persisted
 * orientation that the layout hook corrects in the same commit.
 */
export function useDiscoverDefaultPanel(): void {
  const effectiveMode = useEffectiveMode();
  const wide = usePanelStore(state => state.orientation === 'horizontal');
  const discoverPanelClosed = useDiscoveryPrefsStore(state => state.discoverPanelClosed);

  useEffect(() => {
    if (effectiveMode !== 'discover' || discoverPanelClosed) return;
    const { orientation, activePanel, openPanel } = usePanelStore.getState();
    if (orientation !== 'horizontal' || activePanel !== null) return;
    openPanel('discovery');
  }, [effectiveMode, wide, discoverPanelClosed]);
}
