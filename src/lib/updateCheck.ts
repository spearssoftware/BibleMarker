/**
 * Update check: fetches GitHub releases on app startup.
 * Supports stable and beta update channels.
 * Respects preference checkForUpdates (default true).
 */

import { getPreferences, updatePreferences } from '@/lib/database';
import { isAndroid, isIOS } from '@/lib/platform';

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/spearssoftware/BibleMarker/releases';
const RELEASES_PAGE_URL = 'https://github.com/spearssoftware/BibleMarker/releases';

export type UpdateChannel = 'stable' | 'beta';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

/** Parse version string into structured form. Handles "app-v1.2.3", "v1.2.3-beta.1", "1.2.3". Exported for testing. */
export function parseVersion(version: string): ParsedVersion {
  const cleaned = version.replace(/^app-v?/i, '').replace(/^v/i, '').trim();
  const [base, ...preParts] = cleaned.split('-');
  const parts = base.split('.').map((p) => parseInt(p, 10) || 0);
  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
    prerelease: preParts.length > 0 ? preParts.join('-') : null,
  };
}

/** Compare two prerelease strings. Returns negative if a < b, positive if a > b, 0 if equal. */
function comparePrerelease(a: string, b: string): number {
  const aParts = a.split('.');
  const bParts = b.split('.');
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const ap = aParts[i];
    const bp = bParts[i];
    if (ap === undefined) return -1;
    if (bp === undefined) return 1;
    const aNum = parseInt(ap, 10);
    const bNum = parseInt(bp, 10);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else {
      const cmp = ap.localeCompare(bp);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

/** True if a is newer than b (full semver with prerelease). Exported for testing. */
export function isNewer(a: string, b: string): boolean {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (av.major !== bv.major) return av.major > bv.major;
  if (av.minor !== bv.minor) return av.minor > bv.minor;
  if (av.patch !== bv.patch) return av.patch > bv.patch;
  // Same major.minor.patch: stable > prerelease
  if (av.prerelease === null && bv.prerelease !== null) return true;
  if (av.prerelease !== null && bv.prerelease === null) return false;
  if (av.prerelease !== null && bv.prerelease !== null) {
    return comparePrerelease(av.prerelease, bv.prerelease) > 0;
  }
  return false;
}

/** Check if candidate is a valid update for the given channel. */
export function isUpdateForChannel(candidate: string, current: string, channel: UpdateChannel): boolean {
  const cv = parseVersion(candidate);
  // Stable channel: only accept stable versions
  if (channel === 'stable' && cv.prerelease !== null) return false;
  return isNewer(candidate, current);
}

export interface UpdateCheckResult {
  /** Newer version string (e.g. "0.6.0" or "2.0.0-beta.1") */
  version: string;
  /** URL to the releases page or specific release */
  url: string;
  /** Whether this is a prerelease */
  isPrerelease: boolean;
}

export interface WhatsNewResult {
  version: string;
  notes: string[];
}

interface GithubRelease {
  tag_name?: string;
  prerelease?: boolean;
  body?: string;
  html_url?: string;
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
    const res = await fetch(`${GITHUB_RELEASES_URL}/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as GithubRelease;
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
      .filter(line => line.length > 0 && !line.startsWith('#'));

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
 * For stable channel: uses /releases/latest (GitHub excludes prereleases).
 * For beta channel: fetches recent releases and finds the highest version.
 */
async function fetchAndCompareVersion(channel: UpdateChannel): Promise<UpdateCheckResult | null> {
  const currentVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

  if (channel === 'beta') {
    const res = await fetch(`${GITHUB_RELEASES_URL}?per_page=10`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return null;
    const releases = (await res.json()) as GithubRelease[];

    let best: { version: string; url: string; isPrerelease: boolean } | null = null;
    for (const rel of releases) {
      if (!rel.tag_name) continue;
      const ver = rel.tag_name.replace(/^app-v?/i, '').replace(/^v/i, '').trim();
      if (!isUpdateForChannel(ver, currentVersion, 'beta')) continue;
      if (!best || isNewer(ver, best.version)) {
        best = {
          version: ver,
          url: rel.html_url || RELEASES_PAGE_URL,
          isPrerelease: rel.prerelease ?? false,
        };
      }
    }

    await updatePreferences({ lastUpdateCheck: new Date().toISOString() });
    return best;
  }

  // Stable channel: existing behavior
  const res = await fetch(`${GITHUB_RELEASES_URL}/latest`, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as GithubRelease;
  const tag = data.tag_name;
  if (!tag || typeof tag !== 'string') return null;

  const latestVersion = tag.replace(/^app-v?/i, '').replace(/^v/i, '').trim();

  await updatePreferences({ lastUpdateCheck: new Date().toISOString() });

  if (isNewer(latestVersion, currentVersion)) {
    return { version: latestVersion, url: RELEASES_PAGE_URL, isPrerelease: false };
  }
  return null;
}

/**
 * Check for a new release on GitHub on every startup.
 * Respects the checkForUpdates and updateChannel preferences.
 */
export async function checkForUpdateIfDue(): Promise<UpdateCheckResult | null> {
  if (isAndroid() || isIOS()) return null;
  const prefs = await getPreferences();
  if (prefs.checkForUpdates === false) {
    return null;
  }

  const channel: UpdateChannel = prefs.updateChannel ?? 'stable';

  try {
    return await fetchAndCompareVersion(channel);
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
    const res = await fetch(`${GITHUB_RELEASES_URL}/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as GithubRelease;
    const tag = data.tag_name;
    const body = data.body;
    if (!tag || !body) return null;

    const releaseVersion = tag.replace(/^app-v?/i, '').replace(/^v/i, '').trim();

    const match = body.match(/##\s+What['']s New\s*\n([\s\S]*?)(?:\n##|$)/i);
    if (!match) return null;

    const notes = match[1]
      .split('\n')
      .map(line => line.replace(/^[-*]\s*/, '').trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));

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
  if (isAndroid() || isIOS()) return null;
  const prefs = await getPreferences();
  const channel: UpdateChannel = prefs.updateChannel ?? 'stable';

  try {
    return await fetchAndCompareVersion(channel);
  } catch {
    // Network or parse error: still record that we tried
    await updatePreferences({ lastUpdateCheck: new Date().toISOString() });
  }
  return null;
}
