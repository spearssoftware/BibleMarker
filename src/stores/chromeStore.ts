/**
 * Whether the Read-mode top bar is scrolled away and which parts of the app
 * are holding it shown. Not persisted: all of it is per-session. The bar's
 * height is published as CSS custom properties by NavigationBar, not stored.
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { topBarCanHide, useEffectiveMode } from '@/lib/appMode';
import { topBarHidden } from '@/lib/hidingChrome';
import { usePanelStore } from '@/stores/panelStore';
import { useAnnotationStore } from '@/stores/annotationStore';

interface ChromeState {
  scrollHidden: boolean;
  /** Keyed so a repeated hold from the same owner (StrictMode's double effects) is idempotent. */
  holds: Record<string, true>;
  setScrollHidden: (hidden: boolean) => void;
  reveal: () => void;
  setHold: (key: string, on: boolean) => void;
}

export const useChromeStore = create<ChromeState>()((set) => ({
  scrollHidden: false,
  holds: {},
  setScrollHidden: (scrollHidden) => set((s) => (s.scrollHidden === scrollHidden ? s : { scrollHidden })),
  reveal: () => set((s) => (s.scrollHidden ? { scrollHidden: false } : s)),
  setHold: (key, on) =>
    set((s) => {
      if (on === (key in s.holds)) return s;
      const { [key]: _released, ...rest } = s.holds;
      return { holds: on ? { ...s.holds, [key]: true } : rest };
    }),
}));

/** Keeps the top bar shown while `active`. */
export function useChromeHold(key: string, active: boolean): void {
  const setHold = useChromeStore((s) => s.setHold);
  useEffect(() => {
    setHold(key, active);
    return () => setHold(key, false);
  }, [key, active, setHold]);
}

export function useTopBarHidden(): boolean {
  const mode = useEffectiveMode();
  // Outside Read the answer is always false, so those subscribers never re-render for these values.
  const canHide = topBarCanHide(mode);
  const scrollHidden = useChromeStore((s) => canHide && s.scrollHidden);
  const held = useChromeStore((s) => canHide && Object.keys(s.holds).length > 0);
  const panelOpen = usePanelStore((s) => canHide && s.activePanel !== null && !s.isCollapsed);
  const hasSelection = useAnnotationStore((s) => canHide && s.selection !== null);
  return topBarHidden({ mode, scrollHidden, held, panelOpen, hasSelection });
}
