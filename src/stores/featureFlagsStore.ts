/**
 * Feature Flags Store
 *
 * Holds the current remote-config flag snapshot for UI consumption. On load it
 * hydrates from the SQLite cache immediately (offline-safe), then refreshes from
 * the worker in the background. Gating that must run before the store hydrates
 * (e.g. sync) should call `isFlagEnabled` from `@/lib/feature-flags` directly.
 *
 * Not persisted via Zustand — the source of truth is the SQLite cache.
 */

import { create } from 'zustand';
import {
  DEFAULT_FLAGS,
  readCachedFlags,
  fetchRemoteFlags,
  type FlagKey,
  type RemoteFlags,
} from '@/lib/feature-flags';

interface FeatureFlagsState {
  flags: RemoteFlags;
  isLoaded: boolean;
  loadFlags: () => Promise<void>;
  isEnabled: (key: FlagKey) => boolean;
}

export const useFeatureFlagsStore = create<FeatureFlagsState>()((set, get) => ({
  flags: { ...DEFAULT_FLAGS },
  isLoaded: false,

  loadFlags: async () => {
    try {
      const cached = await readCachedFlags();
      if (cached) set({ flags: cached });

      const remote = await fetchRemoteFlags();
      if (remote) set({ flags: remote });
    } finally {
      set({ isLoaded: true });
    }
  },

  isEnabled: (key) => {
    const { flags } = get();
    return flags[key] ?? DEFAULT_FLAGS[key];
  },
}));
