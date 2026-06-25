/**
 * Feature flags — client side.
 *
 * The worker (`/config`) evaluates Cloudflare Flagship server-side and ships a
 * JSON snapshot of the client-facing flags. We never run a flag SDK inside the
 * offline webview: we fetch the snapshot, cache it in SQLite, and fall back to
 * baked-in defaults so the app always has a usable value — first run, offline,
 * or worker-down.
 *
 * `sync_config` (not a synced table) is the cache, so each device keeps its own
 * per-device-evaluated flags.
 */

import { getSyncConfig, setSyncConfig, getDeviceId, getSqliteDb } from './sqlite-db';
import { isIOS, isAndroid, isMacOS, isTauri } from './platform';

/**
 * Logical flag keys, mirrored exactly in the Flagship dashboard and the worker.
 * Flagship keys allow only letters, numbers, hyphens, and underscores (no dots).
 */
export const FLAG_KEYS = {
  /** Global sync kill-switch (server-enforced + reflected here). */
  syncEnabled: 'sync-enabled',
  /** Gate the OTP sign-in UI. */
  otpEnabled: 'auth-otp-enabled',
} as const;

export type FlagKey = (typeof FLAG_KEYS)[keyof typeof FLAG_KEYS];

export type RemoteFlags = Record<string, boolean>;

/** Safe defaults — used until/unless the worker says otherwise. */
export const DEFAULT_FLAGS: RemoteFlags = {
  [FLAG_KEYS.syncEnabled]: true,
  [FLAG_KEYS.otpEnabled]: true,
};

const CONFIG_URL = 'https://biblemarker.app/config';
const CACHE_KEY = 'remote_config';
/** Give up quickly when offline so startup never stalls on the flag fetch. */
const FETCH_TIMEOUT_MS = 5000;

interface CachedConfig {
  flags: RemoteFlags;
  /** Server-side evaluation timestamp from the worker. */
  evaluatedAt: string;
  /** When this device last stored the snapshot. */
  cachedAt: string;
}

/** Coarse OS tag for dashboard targeting rules (advisory only). */
function platformTag(): string {
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  if (isMacOS()) return 'macos';
  if (isTauri()) return 'desktop';
  return 'web';
}

/** Keep only known boolean flags, layered over the defaults. */
function normalizeFlags(raw: unknown): RemoteFlags {
  const flags: RemoteFlags = { ...DEFAULT_FLAGS };
  if (raw && typeof raw === 'object') {
    for (const key of Object.values(FLAG_KEYS)) {
      const value = (raw as Record<string, unknown>)[key];
      if (typeof value === 'boolean') flags[key] = value;
    }
  }
  return flags;
}

/** Read the last cached snapshot, or `null` if absent/corrupt. */
export async function readCachedFlags(): Promise<RemoteFlags | null> {
  try {
    const raw = await getSyncConfig(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedConfig;
    return normalizeFlags(parsed.flags);
  } catch {
    return null;
  }
}

/**
 * Resolve a single flag without the store — reads the SQLite cache directly and
 * falls back to the default. Used by sync gating, which runs before the store
 * may have hydrated.
 */
export async function isFlagEnabled(key: FlagKey): Promise<boolean> {
  const cached = await readCachedFlags();
  // normalizeFlags guarantees every key is present, so no second fallback needed.
  return (cached ?? DEFAULT_FLAGS)[key];
}

/**
 * Fetch the latest snapshot from the worker and persist it to the cache.
 * Returns the flags on success, or `null` on any failure (network, timeout,
 * bad shape) — callers keep using the cache/defaults. Never throws.
 */
export async function fetchRemoteFlags(): Promise<RemoteFlags | null> {
  const headers: Record<string, string> = {
    'X-Client-Version': __APP_VERSION__,
    'X-Client-Platform': platformTag(),
  };
  try {
    await getSqliteDb(); // ensure cachedDeviceId is set before reading it
    headers['X-Device-Id'] = getDeviceId();
  } catch {
    /* DB init failed — fetch anonymously, flag targeting won't match device rules */
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(CONFIG_URL, { headers, signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { flags?: unknown; evaluatedAt?: unknown };
    // Require a real flags object before caching — a 200 with a missing/array
    // body (captive portal, misconfigured proxy) must not overwrite a good
    // cached snapshot with all-defaults.
    if (typeof body?.flags !== 'object' || body.flags === null || Array.isArray(body.flags)) {
      return null;
    }
    const flags = normalizeFlags(body.flags);
    const snapshot: CachedConfig = {
      flags,
      evaluatedAt: typeof body.evaluatedAt === 'string' ? body.evaluatedAt : new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    };
    await setSyncConfig(CACHE_KEY, JSON.stringify(snapshot));
    return flags;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
