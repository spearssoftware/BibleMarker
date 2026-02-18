/**
 * Platform Detection Utilities
 * 
 * Detects which platform the app is running on (Tauri, Capacitor, or Web)
 * and provides OS-specific checks for iCloud sync support.
 */

/**
 * Check if running in Tauri
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Check if Tauri internals (needed for invoke, plugin-sql) are available.
 * These are injected after the page loads and can lag behind React's first effects.
 */
function hasTauriInternals(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

/**
 * Wait for Tauri internals to be available before calling invoke/plugin APIs.
 * Polls up to maxMs to avoid blocking forever if Tauri never loads (e.g. web-only).
 */
export function waitForTauriInternals(maxMs = 3000): Promise<void> {
  if (hasTauriInternals()) return Promise.resolve();
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (hasTauriInternals() || Date.now() - start >= maxMs) {
        resolve();
        return;
      }
      setTimeout(check, 50);
    };
    setTimeout(check, 50);
  });
}

/**
 * Check if running in Capacitor
 */
export function isCapacitor(): boolean {
  return typeof window !== 'undefined' && 'Capacitor' in window;
}

/**
 * Check if running in web browser
 */
export function isWeb(): boolean {
  return !isTauri() && !isCapacitor();
}

/**
 * Get current platform
 */
export type Platform = 'tauri' | 'capacitor' | 'web';

export function getPlatform(): Platform {
  if (isTauri()) return 'tauri';
  if (isCapacitor()) return 'capacitor';
  return 'web';
}

/**
 * Check if running on Apple platform (iOS or macOS)
 * Used to determine iCloud sync availability
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/.test(ua);
}

/**
 * Check if running on iOS (Tauri iOS or Capacitor iOS)
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua);
}

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Mac/.test(ua) && !/iPhone|iPad|iPod/.test(ua);
}

/**
 * Check if iCloud sync is available
 * Available on iOS and macOS when running in Tauri
 */
export function isICloudAvailable(): boolean {
  return isTauri() && isApplePlatform();
}

/**
 * Open a URL in the system browser.
 * Uses tauri-plugin-opener in Tauri, falls back to window.open on web.
 */
export async function openUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl: tauriOpenUrl } = await import('@tauri-apps/plugin-opener');
    await tauriOpenUrl(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
