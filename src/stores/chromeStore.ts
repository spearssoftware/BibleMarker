/**
 * Whether the Read-mode top bar is scrolled away, how tall it is (so the text
 * can start below it), and which parts of the app are holding it shown. Not
 * persisted: all of it is per-session.
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { useEffectiveMode } from '@/lib/appMode';
import { topBarHidden } from '@/lib/hidingChrome';
import { usePanelStore } from '@/stores/panelStore';
import { useAnnotationStore } from '@/stores/annotationStore';

interface ChromeState {
  scrollHidden: boolean;
  /** Height in px of the top bar wrapper; 0 until measured. */
  topInset: number;
  /** Keyed so a repeated hold from the same owner (StrictMode's double effects) is idempotent. */
  holds: Record<string, true>;
  setScrollHidden: (hidden: boolean) => void;
  reveal: () => void;
  setTopInset: (px: number) => void;
  setHold: (key: string, on: boolean) => void;
}

export const useChromeStore = create<ChromeState>()((set) => ({
  scrollHidden: false,
  topInset: 0,
  holds: {},
  setScrollHidden: (scrollHidden) => set((s) => (s.scrollHidden === scrollHidden ? s : { scrollHidden })),
  reveal: () => set((s) => (s.scrollHidden ? { scrollHidden: false } : s)),
  setTopInset: (topInset) => set((s) => (s.topInset === topInset ? s : { topInset })),
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
  const scrollHidden = useChromeStore((s) => s.scrollHidden);
  const held = useChromeStore((s) => Object.keys(s.holds).length > 0);
  const panelOpen = usePanelStore((s) => s.activePanel !== null && !s.isCollapsed);
  const hasSelection = useAnnotationStore((s) => s.selection !== null);
  return topBarHidden({ mode, scrollHidden, held, panelOpen, hasSelection });
}
