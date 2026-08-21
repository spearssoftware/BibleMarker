/**
 * Discover-layer flag + tunable-config accessors.
 *
 * A thin wrapper over `useFeatureFlagsStore` so callers don't reach into the
 * store shape directly — mirrors the pattern of `isFlagEnabled` in
 * `feature-flags.ts` for non-hook call sites (handlers, non-React helpers).
 */

import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { FLAG_KEYS, type DiscoveryThresholds } from '@/lib/feature-flags';

/** Non-hook read of the Discover-layer kill-switch, for handlers and non-React code. */
export function isDiscoveryEnabled(): boolean {
  return useFeatureFlagsStore.getState().isEnabled(FLAG_KEYS.discoveryEnabled);
}

/** Reactive read of the Discover-layer kill-switch. */
export function useDiscoveryEnabled(): boolean {
  return useFeatureFlagsStore((state) => state.isEnabled(FLAG_KEYS.discoveryEnabled));
}

/** Reactive read of the tunable Discover-layer thresholds. */
export function useDiscoveryConfig(): DiscoveryThresholds {
  return useFeatureFlagsStore((state) => state.config.discoveryThresholds);
}
