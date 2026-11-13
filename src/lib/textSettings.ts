/**
 * Text settings shared by Settings › Appearance and the reader's "Aa" panel.
 *
 * `annotationStore` is the single home for the values. Each handler sets the
 * store, applies the effect and saves the preference.
 */

import { useAnnotationStore } from '@/stores/annotationStore';
import { updatePreferences } from '@/lib/database';
import { SCRIPTURE_FONT_STACKS, applyScriptureFont, applyTheme, type ScriptureFont, type Theme } from '@/lib/theme';
import type { UserPreferences } from '@/types';

export type FontSizeValue = NonNullable<UserPreferences['fontSize']>;

export const FONT_SIZE_OPTIONS: ReadonlyArray<{ value: FontSizeValue; label: string }> = [
  { value: 'sm', label: 'Small' },
  { value: 'base', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
];

export const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'auto', label: 'Auto' },
];

const SCRIPTURE_FONT_LABELS: ReadonlyArray<{ id: ScriptureFont; label: string }> = [
  { id: 'crimson-pro', label: 'Crimson Pro' },
  { id: 'lora', label: 'Lora' },
  { id: 'merriweather', label: 'Merriweather' },
  { id: 'literata', label: 'Literata' },
];

export const SCRIPTURE_FONTS: ReadonlyArray<{ id: ScriptureFont; label: string; stack: string }> =
  SCRIPTURE_FONT_LABELS.map(font => ({ ...font, stack: SCRIPTURE_FONT_STACKS[font.id] }));

/** Saves a preference change, logging a failure instead of throwing. `what` names it in the log. */
export async function savePreference(update: Partial<UserPreferences>, what: string): Promise<void> {
  try {
    await updatePreferences(update);
  } catch (error) {
    console.error(`Error updating ${what}:`, error);
  }
}

export function changeFontSize(size: FontSizeValue): Promise<void> {
  useAnnotationStore.getState().setFontSize(size);
  return savePreference({ fontSize: size }, 'font size');
}

export function changeScriptureFont(font: ScriptureFont): Promise<void> {
  useAnnotationStore.getState().setScriptureFont(font);
  applyScriptureFont(font);
  return savePreference({ scriptureFont: font }, 'scripture font');
}

export function changeTheme(theme: Theme): Promise<void> {
  const store = useAnnotationStore.getState();
  store.setTheme(theme);
  applyTheme(theme, store.highContrast);
  return savePreference({ theme }, 'theme');
}

export function changeHighContrast(enabled: boolean): Promise<void> {
  const store = useAnnotationStore.getState();
  store.setHighContrast(enabled);
  applyTheme(store.theme, enabled);
  return savePreference({ highContrast: enabled }, 'high contrast');
}

export function changeShowVerseNumbers(show: boolean): Promise<void> {
  useAnnotationStore.getState().setShowVerseNumbers(show);
  return savePreference({ showVerseNumbers: show }, 'verse numbers');
}

/**
 * Fills the store from saved preferences at startup. Startup has already
 * applied the theme and font, so this only sets the store. Not called on sync
 * rehydration: synced text settings take effect on the next launch.
 */
export function hydrateTextSettings(prefs: Partial<UserPreferences>): void {
  const store = useAnnotationStore.getState();
  if (prefs.fontSize) store.setFontSize(prefs.fontSize);
  if (prefs.scriptureFont) store.setScriptureFont(prefs.scriptureFont);
  if (prefs.theme) store.setTheme(prefs.theme);
  if (prefs.highContrast !== undefined) store.setHighContrast(prefs.highContrast);
  store.setShowVerseNumbers(prefs.showVerseNumbers !== false);
}
