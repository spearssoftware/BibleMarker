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
 *
 * @param onProgress Called with download percentage (0–100).
 */
export async function installUpdate(
  onProgress?: (percent: number) => void,
): Promise<InstallUpdateResult> {
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

    let totalBytes = 0;
    let downloadedBytes = 0;

    await update.downloadAndInstall((event) => {
      if (event.event === 'Started' && event.data.contentLength) {
        totalBytes = event.data.contentLength;
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength;
        if (totalBytes > 0) {
          onProgress?.(Math.min((downloadedBytes / totalBytes) * 100, 99));
        }
      } else if (event.event === 'Finished') {
        onProgress?.(100);
      }
    });

    await relaunch();
    return { installed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { installed: false, error: message };
  }
}
