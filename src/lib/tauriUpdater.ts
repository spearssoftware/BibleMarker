/**
 * Tauri updater: in-app download and install.
 * Only used when running in Tauri (desktop). Web builds use openUrl to releases page.
 */

import { isTauri } from '@/lib/platform';

export interface InstallUpdateResult {
  /** True if update was installed and app will relaunch */
  installed: boolean;
  /** Error message if something went wrong */
  error?: string;
}

/**
 * Attempt to download and install the latest update via Tauri updater plugin.
 * On success, the app will relaunch. On failure or when not in Tauri, returns
 * without relaunching (caller should fall back to openUrl).
 */
export async function installUpdate(): Promise<InstallUpdateResult> {
  if (!isTauri()) {
    return { installed: false };
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const { relaunch } = await import('@tauri-apps/plugin-process');

    const update = await check();
    if (!update) {
      return { installed: false };
    }

    await update.downloadAndInstall();
    await relaunch();
    return { installed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { installed: false, error: message };
  }
}
