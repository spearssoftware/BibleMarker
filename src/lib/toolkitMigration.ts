/**
 * Toolkit Migration ("upgrade nicety")
 *
 * Users who already have annotations, key words, or notes from before the
 * discovery-first pivot should not have the Precept toolkit disappear out
 * from under them. On first launch after updating, auto-enable "inductive
 * tools" for any account that already has data — the toggle only ever
 * flips this once, since after it runs `inductiveToolsEnabled` is no longer
 * `undefined`.
 */

import { countRows, type UserPreferences } from '@/lib/database';
import { usePreferencesStore } from '@/stores/preferencesStore';

/**
 * Auto-enables inductive tools for an existing user with data, once.
 * Returns true if it flipped the preference (caller should show the
 * one-shot "your tools are back" banner).
 */
export async function maybeEnableInductiveTools(prefs: UserPreferences): Promise<boolean> {
  if (prefs.inductiveToolsEnabled !== undefined) return false;
  if (!prefs.onboarding?.hasSeenWelcome) return false;

  const [presetCount, annotationCount, noteCount] = await Promise.all([
    countRows('marking_presets'),
    countRows('annotations'),
    countRows('notes'),
  ]);

  if (presetCount === 0 && annotationCount === 0 && noteCount === 0) return false;

  await usePreferencesStore.getState().setInductiveToolsEnabled(true);
  return true;
}
