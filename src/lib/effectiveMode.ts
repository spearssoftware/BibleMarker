/**
 * Effective mode
 *
 * Kept free of other app-mode helpers so stores can read it without an import
 * cycle. `appMode.ts` re-exports everything here.
 */

import { useAppModeStore, type AppMode } from '@/stores/appModeStore';
import { useDiscoveryEnabled } from '@/lib/discovery-config';
import { FLAG_KEYS } from '@/lib/feature-flags';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';

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

export function getEffectiveMode(): AppMode {
  return effectiveMode(
    useAppModeStore.getState().mode,
    useFeatureFlagsStore.getState().isEnabled(FLAG_KEYS.discoveryEnabled)
  );
}
