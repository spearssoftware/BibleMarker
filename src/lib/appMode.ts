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
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
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

export type VerseMenuItem = 'heading' | 'note' | 'observation' | 'time' | 'crossRefs' | 'originalLanguage';

const VERSE_MENU_ITEMS: Record<AppMode, ReadonlySet<VerseMenuItem>> = {
  read: new Set(['note']),
  discover: new Set(['note', 'crossRefs', 'originalLanguage']),
  study: new Set(['heading', 'note', 'observation', 'time', 'crossRefs', 'originalLanguage']),
};

/** `mode` is the effective mode. */
export function verseMenuItems(mode: AppMode): ReadonlySet<VerseMenuItem> {
  return VERSE_MENU_ITEMS[mode];
}

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

/** `mode` is the effective mode. Discover's wide layout shows its panel instead of a bar. */
export function bottomBarVisible(mode: AppMode, wide: boolean): boolean {
  if (mode === 'study') return true;
  return mode === 'discover' && !wide;
}

export function useBottomBarVisible(): boolean {
  const mode = useEffectiveMode();
  const wide = usePanelStore(state => state.orientation === 'horizontal');
  return bottomBarVisible(mode, wide);
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

  (document.activeElement as HTMLElement | null)?.blur();

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

export function openDiscoverPanel(): void {
  usePanelStore.getState().openPanel('discovery');
  useDiscoveryPrefsStore.getState().setDiscoverPanelClosed(false);
}

export function toggleDiscoverPanel(): void {
  const { activePanel, isCollapsed, orientation, closePanel, setCollapsed } = usePanelStore.getState();
  if (activePanel !== 'discovery') {
    openDiscoverPanel();
    return;
  }
  if (isCollapsed) {
    setCollapsed(false);
    return;
  }
  closePanel();
  if (getEffectiveMode() === 'discover' && orientation === 'horizontal') {
    useDiscoveryPrefsStore.getState().setDiscoverPanelClosed(true);
  }
}

/** The wide segmented control: choosing the selected Discover segment toggles its panel. */
export function selectMode(mode: AppMode): void {
  if (mode === 'discover' && getEffectiveMode() === 'discover') {
    toggleDiscoverPanel();
    return;
  }
  switchMode(mode);
}
