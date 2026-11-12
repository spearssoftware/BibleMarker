/**
 * Mode seed
 *
 * Picks the starting app mode on a device that has none stored. A device that
 * has not seen the Welcome screen starts in Discover (the Welcome screen will
 * ask later). An existing device lands in the mode matching what it had: the
 * old `inductiveToolsEnabled` preference wins, otherwise Study if the user
 * has any marks or notes. Upgrade cases also raise the one-time banner.
 */

import { countRows, type UserPreferences } from '@/lib/database';
import { track } from '@/lib/telemetry';
import { useAppModeStore, type AppMode } from '@/stores/appModeStore';

async function hasUserData(): Promise<boolean> {
  const counts = await Promise.all([
    countRows('marking_presets'),
    countRows('annotations'),
    countRows('notes'),
  ]);
  return counts.some(count => count > 0);
}

export async function seedAppMode(prefs: UserPreferences): Promise<void> {
  if (useAppModeStore.getState().mode !== null) return;

  if (!prefs.onboarding?.hasSeenWelcome) {
    useAppModeStore.getState().setMode('discover');
    return;
  }

  let mode: AppMode;
  if (prefs.inductiveToolsEnabled !== undefined) {
    mode = prefs.inductiveToolsEnabled ? 'study' : 'discover';
  } else {
    mode = (await hasUserData()) ? 'study' : 'discover';
    if (useAppModeStore.getState().mode !== null) return;
  }

  const store = useAppModeStore.getState();
  store.setMode(mode);
  store.setModesBannerPending(true);
  track('mode_chosen', { feature: `mode_${mode}` });
}
