/**
 * Effective open state of the Discover panel's Look closer section.
 *
 * Forced open (a connector prompt or lens is active) beats the reader's
 * stored choice, which beats the mode default. The mode default is open in
 * Study only. `locked` marks the forced case, where a
 * toggle could not change what is shown.
 */

import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useIsStudyMode } from '@/lib/appMode';

export function useLookCloserState(): { open: boolean; locked: boolean } {
  const forced = useDiscoveryStore(s => s.activePrompt !== null || s.lens === 'connectors');
  const stored = useDiscoveryPrefsStore(s => s.lookCloserOpen);
  const modeDefault = useIsStudyMode();
  if (forced) return { open: true, locked: true };
  return { open: stored ?? modeDefault, locked: false };
}
