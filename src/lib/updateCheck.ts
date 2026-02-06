/**
 * Update check: fetches GitHub releases/latest at most once per 24 hours.
 * Respects preference checkForUpdates (default true).
 */

import { getPreferences, updatePreferences } from '@/lib/db';

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/spearssoftware/BibleMarker/releases/latest';
const RELEASES_PAGE_URL = 'https://github.com/spearssoftware/BibleMarker/releases';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Parse "1.2.3" or "v1.2.3" into [major, minor, patch] for comparison. Exported for testing. */
export function parseVersion(version: string): [number, number, number] {
  const cleaned = version.replace(/^v/i, '').trim();
  const parts = cleaned.split('.').map((p) => parseInt(p, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** True if a > b (semver). Exported for testing. */
export function isNewer(a: string, b: string): boolean {
  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);
  if (aMajor !== bMajor) return aMajor > bMajor;
  if (aMinor !== bMinor) return aMinor > bMinor;
  return aPatch > bPatch;
}

export interface UpdateCheckResult {
  /** Newer version string (e.g. "0.6.0") if available */
  version: string;
  /** URL to the releases page */
  url: string;
}

/**
 * Internal function to fetch and compare versions.
 * Returns the newer version info if available, null otherwise.
 */
async function fetchAndCompareVersion(): Promise<UpdateCheckResult | null> {
  const res = await fetch(GITHUB_RELEASES_URL, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { tag_name?: string };
  const tag = data.tag_name;
  if (!tag || typeof tag !== 'string') return null;

  const latestVersion = tag.replace(/^v/i, '').trim();
  const currentVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

  await updatePreferences({ lastUpdateCheck: new Date().toISOString() });

  if (isNewer(latestVersion, currentVersion)) {
    return { version: latestVersion, url: RELEASES_PAGE_URL };
  }
  return null;
}

/**
 * Check for a new release on GitHub if:
 * - checkForUpdates preference is not false
 * - last check was more than 24 hours ago (or never)
 * Returns the newer version and releases URL if one exists, otherwise null.
 */
export async function checkForUpdateIfDue(): Promise<UpdateCheckResult | null> {
  const prefs = await getPreferences();
  if (prefs.checkForUpdates === false) {
    return null;
  }
  const now = Date.now();
  const last = prefs.lastUpdateCheck ? new Date(prefs.lastUpdateCheck).getTime() : 0;
  if (last > 0 && now - last < CHECK_INTERVAL_MS) {
    return null;
  }

  try {
    return await fetchAndCompareVersion();
  } catch {
    // Network or parse error: still record that we tried
    await updatePreferences({ lastUpdateCheck: new Date().toISOString() });
  }
  return null;
}

/**
 * Manually check for updates, bypassing the 24-hour throttle.
 * Use this when the user explicitly requests an update check.
 * Returns the newer version and releases URL if one exists, otherwise null.
 */
export async function checkForUpdateNow(): Promise<UpdateCheckResult | null> {
  try {
    return await fetchAndCompareVersion();
  } catch {
    // Network or parse error: still record that we tried
    await updatePreferences({ lastUpdateCheck: new Date().toISOString() });
  }
  return null;
}
