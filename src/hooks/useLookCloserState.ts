/**
 * Effective open state of the Discover panel's Look closer section.
 *
 * Forced open (a connector prompt or lens is active) beats the reader's
 * stored choice, which beats the mode default. `useInductiveToolsVisible` is
 * false until preferences hydrate, so the section starts collapsed rather
 * than flipping open mid-render. `locked` marks the forced case, where a
 * toggle could not change what is shown.
 */

import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useInductiveToolsVisible } from '@/stores/preferencesStore';

export function useLookCloserState(): { open: boolean; locked: boolean } {
  const forced = useDiscoveryStore(s => s.activePrompt !== null || s.lens === 'connectors');
  const stored = useDiscoveryPrefsStore(s => s.lookCloserOpen);
  const modeDefault = useInductiveToolsVisible();
  if (forced) return { open: true, locked: true };
  return { open: stored ?? modeDefault, locked: false };
}
