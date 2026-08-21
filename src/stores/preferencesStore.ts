/**
 * Preferences Store
 *
 * Holds the in-memory snapshot of user-facing toggle preferences — the
 * "Enable inductive tools" mode switch and opt-in telemetry — for UI
 * consumption. Not persisted via Zustand: the source of truth is the
 * `preferences` row in SQLite, hydrated once via `hydrate()` at startup
 * (see `App.tsx`). A prefs row synced in from another device applies on
 * the next launch, same as other cross-device preferences.
 */

import { create } from 'zustand';
import { updatePreferences } from '@/lib/database';
import type { UserPreferences } from '@/types/preferences';

interface PreferencesState {
  inductiveToolsEnabled: boolean;
  telemetryEnabled: boolean;
  isHydrated: boolean;
  hydrate: (prefs: UserPreferences) => void;
  setInductiveToolsEnabled: (value: boolean) => Promise<void>;
  setTelemetryEnabled: (value: boolean) => Promise<void>;
}

export const usePreferencesStore = create<PreferencesState>()((set) => ({
  inductiveToolsEnabled: false,
  telemetryEnabled: false,
  isHydrated: false,

  hydrate: (prefs) => {
    set({
      inductiveToolsEnabled: prefs.inductiveToolsEnabled ?? false,
      telemetryEnabled: prefs.telemetryEnabled ?? false,
      isHydrated: true,
    });
  },

  setInductiveToolsEnabled: async (value) => {
    set({ inductiveToolsEnabled: value });
    try {
      await updatePreferences({ inductiveToolsEnabled: value });
    } catch (error) {
      console.error('Error updating inductiveToolsEnabled preference:', error);
    }
  },

  setTelemetryEnabled: async (value) => {
    set({ telemetryEnabled: value });
    try {
      await updatePreferences({ telemetryEnabled: value });
    } catch (error) {
      console.error('Error updating telemetryEnabled preference:', error);
    }
  },
}));
