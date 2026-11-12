/**
 * App Mode Store
 *
 * Device-local choice between Read, Discover and Study. `mode` is null until
 * it is seeded (Welcome choice or the upgrade rule in `modeSeed.ts`) and is
 * never synced between devices. `modesBannerPending` drives the one-time
 * "three modes" banner shown to existing users after updating.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppMode = 'read' | 'discover' | 'study';

export const APP_MODES: readonly AppMode[] = ['read', 'discover', 'study'];

function isAppMode(value: unknown): value is AppMode {
  return APP_MODES.includes(value as AppMode);
}

interface AppModeState {
  mode: AppMode | null;
  modesBannerPending: boolean;
  setMode: (mode: AppMode) => void;
  setModesBannerPending: (value: boolean) => void;
}

export const useAppModeStore = create<AppModeState>()(
  persist(
    set => ({
      mode: null,
      modesBannerPending: false,
      setMode: mode => set({ mode }),
      setModesBannerPending: value => set({ modesBannerPending: value }),
    }),
    {
      name: 'app-mode',
      partialize: state => ({
        mode: state.mode,
        modesBannerPending: state.modesBannerPending,
      }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<Pick<AppModeState, 'mode' | 'modesBannerPending'>>;
        return {
          ...current,
          mode: isAppMode(stored.mode) ? stored.mode : null,
          modesBannerPending: stored.modesBannerPending === true,
        };
      },
    }
  )
);
