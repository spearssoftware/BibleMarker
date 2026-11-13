/**
 * App mode helpers
 *
 * Labels and the `switchMode` action; effective-mode resolution lives in
 * `effectiveMode.ts` (re-exported here). The stored mode (`useAppModeStore`) is
 * what the user chose; the effective mode applies
 * the `discovery-enabled` kill switch (a stored 'discover' behaves as Read
 * while it is off) and treats an unseeded mode as Read.
 */

import { useAppModeStore, APP_MODES, type AppMode } from '@/stores/appModeStore';
import { getDiscoveryEnabled, useDiscoveryEnabled } from '@/lib/discovery-config';
import { usePanelStore, type PanelType } from '@/stores/panelStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { track } from '@/lib/telemetry';
import { effectiveMode, getEffectiveMode, useEffectiveMode, useIsStudyMode } from '@/lib/effectiveMode';

export { effectiveMode, getEffectiveMode, useEffectiveMode, useIsStudyMode };

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

export const PANELS_OFFERED: Record<AppMode, readonly PanelType[]> = {
  read: ['keywords', 'settings'],
  discover: ['keywords', 'settings', 'discovery', 'reference'],
  study: ['keywords', 'observe', 'analyze', 'reference', 'settings', 'discovery'],
};

/** Whether `mode` offers `panel`. Study lists 'discovery', but the kill switch removes it everywhere. */
export function panelOffered(mode: AppMode, discoveryEnabled: boolean, panel: PanelType): boolean {
  if (panel === 'discovery' && !discoveryEnabled) return false;
  return PANELS_OFFERED[mode].includes(panel);
}

/** Closes the active panel when `mode` does not offer it. */
export function closeUnofferedPanel(mode: AppMode): void {
  const { activePanel, closePanel } = usePanelStore.getState();
  if (activePanel && !panelOffered(mode, getDiscoveryEnabled(), activePanel)) closePanel();
}

/** The modes a user can pick: Discover drops out while the kill switch is off. */
export function availableModes(discoveryEnabled: boolean): readonly AppMode[] {
  return APP_MODES.filter(mode => mode !== 'discover' || discoveryEnabled);
}

export function commitMode(mode: AppMode): void {
  useAppModeStore.getState().setMode(mode);
  track('mode_chosen', { feature: `mode_${mode}` });
}

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

/** `mode` is the effective mode. Discover and Study always show verse numbers: their verse menu holds the cross-references and study actions. */
export function verseNumbersVisible(mode: AppMode, showVerseNumbers: boolean): boolean {
  return mode !== 'read' || showVerseNumbers;
}

/**
 * `mode` is the effective mode. Read with one translation (or none resolved
 * yet) drops the band, unless it shows an error or the fallback notice. Loading does
 * not bring the band back: every uncached chapter loads, so it would flash in
 * and out on each chapter turn and shift the text.
 */
export function translationBandVisible(mode: AppMode, translationCount: number, hasError: boolean): boolean {
  return mode !== 'read' || translationCount > 1 || hasError;
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

export function switchMode(mode: AppMode): void {
  const previous = getEffectiveMode();
  if (mode === previous) return;
  if (mode === 'discover' && !getDiscoveryEnabled()) {
    return;
  }

  (document.activeElement as HTMLElement | null)?.blur();

  const { activePanel, closePanel } = usePanelStore.getState();
  // The Key Words panel renders a different editor in Study, so it must not
  // morph mid-edit when the switch crosses that boundary.
  const crossesStudy = (previous === 'study') !== (mode === 'study');
  if (
    activePanel &&
    (!panelOffered(mode, getDiscoveryEnabled(), activePanel) || (crossesStudy && activePanel === 'keywords'))
  ) {
    closePanel();
  }

  useDiscoveryStore.getState().setLens(null);
  useAnnotationStore.getState().clearSelection();
  window.getSelection()?.removeAllRanges();

  commitMode(mode);
}

/** The Welcome screen's choice. A device with no stored mode has Read as its effective mode, so `switchMode('read')` would return early. */
export function chooseInitialMode(mode: AppMode): void {
  const store = useAppModeStore.getState();
  if (store.mode === null) {
    commitMode(mode);
    store.setModesBannerPending(false);
    return;
  }
  switchMode(mode);
  // switchMode returns early when the effective mode already matches (e.g. a
  // stored Discover with the kill switch off is effectively Read), leaving the
  // stored mode behind and sending nothing.
  if (useAppModeStore.getState().mode !== mode) {
    commitMode(mode);
  }
  store.setModesBannerPending(false);
}

export function openDiscoverPanel(): void {
  usePanelStore.getState().openPanel('discovery');
  // Opening from Study (tool bar, lens) must not undo a choice made in Discover.
  if (getEffectiveMode() === 'discover') {
    useDiscoveryPrefsStore.getState().setDiscoverPanelClosed(false);
  }
}

// Closing Discover in Discover mode on a wide layout is a choice that sticks.
function rememberDiscoverPanelClosed(wide: boolean): void {
  if (wide && getEffectiveMode() === 'discover') {
    useDiscoveryPrefsStore.getState().setDiscoverPanelClosed(true);
  }
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
  rememberDiscoverPanelClosed(orientation === 'horizontal');
}

/** The user closed the active panel (header close, or a keyword saved while unpinned). */
export function closePanelFromUser(): void {
  const { activePanel: closing, returnPanel, orientation, closePanel } = usePanelStore.getState();
  const wide = orientation === 'horizontal';
  closePanel();
  if (getEffectiveMode() !== 'discover') return;
  if (closing === 'discovery') {
    rememberDiscoverPanelClosed(wide);
    return;
  }
  if (returnPanel === 'discovery' || (wide && !useDiscoveryPrefsStore.getState().discoverPanelClosed)) {
    usePanelStore.getState().openPanel('discovery');
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
