/**
 * Effective open state of the Discover panel's Look closer section.
 *
 * Forced open (a connector prompt or lens is active, or the repetition
 * found-toast fired) beats the reader's stored choice, which beats the mode
 * default. `useInductiveToolsVisible` is false until preferences hydrate, so
 * the section starts collapsed rather than flipping open mid-render.
 */

import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useInductiveToolsVisible } from '@/stores/preferencesStore';

export function useLookCloserOpen(): boolean {
  const forcedByState = useDiscoveryStore(s => s.activePrompt !== null || s.lens === 'connectors');
  const forcedBySession = useDiscoveryPrefsStore(s => s.lookCloserForcedOpen);
  const stored = useDiscoveryPrefsStore(s => s.lookCloserOpen);
  const modeDefault = useInductiveToolsVisible();
  if (forcedByState || forcedBySession) return true;
  return stored ?? modeDefault;
}
