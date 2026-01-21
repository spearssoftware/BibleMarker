/**
 * Debug Utilities
 * 
 * Centralized debug flag management for the app.
 * Debug flags are stored in user preferences and can be toggled from Settings.
 */

import { getPreferences } from './db';

// Cache for debug flags to avoid repeated DB reads
let debugFlagsCache: { keywordMatching: boolean; verseText: boolean } | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 1000; // Cache for 1 second

/**
 * Get debug flags from preferences
 * Uses a short cache to avoid excessive DB reads during rendering
 */
export async function getDebugFlags(): Promise<{ keywordMatching: boolean; verseText: boolean }> {
  const now = Date.now();
  
  // Return cached value if still valid
  if (debugFlagsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return debugFlagsCache;
  }
  
  try {
    const prefs = await getPreferences();
    const flags = {
      keywordMatching: prefs.debug?.keywordMatching ?? false,
      verseText: prefs.debug?.verseText ?? false,
    };
    
    // Update cache
    debugFlagsCache = flags;
    cacheTimestamp = now;
    
    return flags;
  } catch (error) {
    console.warn('[Debug] Failed to load debug flags:', error);
    return { keywordMatching: false, verseText: false };
  }
}

/**
 * Clear the debug flags cache (call after updating preferences)
 */
export function clearDebugFlagsCache(): void {
  debugFlagsCache = null;
  cacheTimestamp = 0;
}

/**
 * Synchronous getter for debug flags (uses cached value or defaults)
 * Use this in render functions where async is not possible
 */
export function getDebugFlagsSync(): { keywordMatching: boolean; verseText: boolean } {
  if (debugFlagsCache) {
    return debugFlagsCache;
  }
  
  // Default to false if cache not available
  return { keywordMatching: false, verseText: false };
}
