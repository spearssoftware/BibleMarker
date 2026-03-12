/**
 * Update check: fetches GitHub releases/latest on every app startup.
 * Respects preference checkForUpdates (default true).
 */

import { getPreferences, updatePreferences } from '@/lib/database';

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/spearssoftware/BibleMarker/releases/latest';
const RELEASES_PAGE_URL = 'https://github.com/spearssoftware/BibleMarker/releases';

/** Parse version string into [major, minor, patch]. Handles "app-v1.2.3", "v1.2.3", "1.2.3". Exported for testing. */
export function parseVersion(version: string): [number, number, number] {
  const cleaned = version.replace(/^app-v?/i, '').replace(/^v/i, '').trim();
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

export interface WhatsNewResult {
  version: string;
  notes: string[];
}

/**
 * Fetches the latest GitHub release and extracts the ## What's New section.
 * Returns null if offline, no section found, or the version was already seen.
 */
export async function fetchWhatsNew(): Promise<WhatsNewResult | null> {
  const prefs = await getPreferences();
  const currentVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

  // Don't show on first install (no lastSeenVersion means fresh install)
  if (!prefs.lastSeenVersion) {
    await updatePreferences({ lastSeenVersion: currentVersion });
    return null;
  }

  // Already seen this version
  if (prefs.lastSeenVersion === currentVersion) {
    return null;
  }

  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { tag_name?: string; body?: string };
    const tag = data.tag_name;
    const body = data.body;
    if (!tag || !body) return null;

    const releaseVersion = tag.replace(/^app-v?/i, '').replace(/^v/i, '').trim();

    // Only show if this release matches the current app version
    if (releaseVersion !== currentVersion) return null;

    // Parse ## What's New section
    const match = body.match(/##\s+What['']s New\s*\n([\s\S]*?)(?:\n##|$)/i);
    if (!match) return null;

    const notes = match[1]
      .split('\n')
      .map(line => line.replace(/^[-*]\s*/, '').trim())
      .filter(line => line.length > 0);

    if (notes.length === 0) return null;

    // Mark as seen
    await updatePreferences({ lastSeenVersion: currentVersion });

    return { version: currentVersion, notes };
  } catch {
    return null;
  }
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

  const latestVersion = tag.replace(/^app-v?/i, '').replace(/^v/i, '').trim();
  const currentVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

  await updatePreferences({ lastUpdateCheck: new Date().toISOString() });

  if (isNewer(latestVersion, currentVersion)) {
    return { version: latestVersion, url: RELEASES_PAGE_URL };
  }
  return null;
}

/**
 * Check for a new release on GitHub on every startup.
 * Respects the checkForUpdates preference (default true).
 */
export async function checkForUpdateIfDue(): Promise<UpdateCheckResult | null> {
  const prefs = await getPreferences();
  if (prefs.checkForUpdates === false) {
    return null;
  }

  try {
    return await fetchAndCompareVersion();
  } catch {
    await updatePreferences({ lastUpdateCheck: new Date().toISOString() });
  }
  return null;
}

/**
 * Fetch the What's New notes for the latest release, ignoring whether the user has already seen it.
 * Used for manual "Show What's New" triggers from the Help panel.
 */
export async function fetchWhatsNewForced(): Promise<WhatsNewResult | null> {
  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { tag_name?: string; body?: string };
    const tag = data.tag_name;
    const body = data.body;
    if (!tag || !body) return null;

    const releaseVersion = tag.replace(/^app-v?/i, '').replace(/^v/i, '').trim();

    const match = body.match(/##\s+What['']s New\s*\n([\s\S]*?)(?:\n##|$)/i);
    if (!match) return null;

    const notes = match[1]
      .split('\n')
      .map(line => line.replace(/^[-*]\s*/, '').trim())
      .filter(line => line.length > 0);

    if (notes.length === 0) return null;

    return { version: releaseVersion, notes };
  } catch {
    return null;
  }
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
