/**
 * Platform Detection Utilities
 * 
 * Detects which platform the app is running on (Tauri, Capacitor, or Web)
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
