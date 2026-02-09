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
