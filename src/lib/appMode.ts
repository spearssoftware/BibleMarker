/**
 * App mode helpers
 *
 * Labels, effective-mode resolution and the `switchMode` action. The stored
 * mode (`useAppModeStore`) is what the user chose; the effective mode applies
 * the `discovery-enabled` kill switch (a stored 'discover' behaves as Read
 * while it is off) and treats an unseeded mode as Read.
 */

import { useAppModeStore, type AppMode } from '@/stores/appModeStore';
import { useDiscoveryEnabled } from '@/lib/discovery-config';
import { FLAG_KEYS } from '@/lib/feature-flags';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { usePanelStore, type PanelType } from '@/stores/panelStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { track } from '@/lib/telemetry';

export const MODE_LABELS: Record<AppMode, string> = {
  read: 'Read',
  discover: 'Discover',
  study: 'Study',
};

export const MODE_DESCRIPTIONS: Record<AppMode, string> = {
  read: 'Just the text. Highlight and mark as you go.',
  discover: 'See the setting, people, places and commentary beside the text.',
  study: 'The full inductive toolset: key words, observation lists, chapter titles and analysis.',
};

const PANELS_OFFERED: Record<AppMode, readonly PanelType[]> = {
  read: ['keywords', 'settings'],
  discover: ['keywords', 'settings', 'discovery', 'reference'],
  study: ['keywords', 'observe', 'analyze', 'reference', 'settings', 'discovery'],
};

export function effectiveMode(mode: AppMode | null, discoveryEnabled: boolean): AppMode {
  if (mode === null) return 'read';
  if (mode === 'discover' && !discoveryEnabled) return 'read';
  return mode;
}

export function useEffectiveMode(): AppMode {
  const mode = useAppModeStore(state => state.mode);
  const discoveryEnabled = useDiscoveryEnabled();
  return effectiveMode(mode, discoveryEnabled);
}

export function useIsStudyMode(): boolean {
  return useEffectiveMode() === 'study';
}

/** Discover exists in Discover and Study, and only while the kill switch is on. */
export function discoverAvailable(mode: AppMode | null, discoveryEnabled: boolean): boolean {
  return discoveryEnabled && effectiveMode(mode, discoveryEnabled) !== 'read';
}

export function useDiscoverAvailable(): boolean {
  const mode = useAppModeStore(state => state.mode);
  const discoveryEnabled = useDiscoveryEnabled();
  return discoverAvailable(mode, discoveryEnabled);
}

export function useBottomBarVisible(): boolean {
  return useEffectiveMode() !== 'read';
}

export function getEffectiveMode(): AppMode {
  return effectiveMode(
    useAppModeStore.getState().mode,
    useFeatureFlagsStore.getState().isEnabled(FLAG_KEYS.discoveryEnabled)
  );
}

export function switchMode(mode: AppMode): void {
  const previous = getEffectiveMode();
  if (mode === previous) return;
  if (mode === 'discover' && !useFeatureFlagsStore.getState().isEnabled(FLAG_KEYS.discoveryEnabled)) {
    return;
  }

  const { activePanel, closePanel } = usePanelStore.getState();
  // The Key Words panel renders a different editor in Study, so it must not
  // morph mid-edit when the switch crosses that boundary.
  const crossesStudy = (previous === 'study') !== (mode === 'study');
  if (
    activePanel &&
    (!PANELS_OFFERED[mode].includes(activePanel) || (crossesStudy && activePanel === 'keywords'))
  ) {
    closePanel();
  }

  useDiscoveryStore.getState().setLens(null);
  useAnnotationStore.getState().clearSelection();
  window.getSelection()?.removeAllRanges();

  useAppModeStore.getState().setMode(mode);
  track('mode_chosen', { feature: `mode_${mode}` });
}
