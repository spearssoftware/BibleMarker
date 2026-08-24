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
// Import directly from `types.ts` rather than the `chapterAnalysis` barrel —
// the barrel also re-exports the tokenizer, stopwords, repetition, and
// connector engines, which this flag/config path has no need to pull in.
import { DEFAULT_DISCOVERY_THRESHOLDS, type DiscoveryThresholds } from '@/lib/chapterAnalysis/types';

export type { DiscoveryThresholds };

/**
 * Logical flag keys, mirrored exactly in the Flagship dashboard and the worker.
 * Flagship keys allow only letters, numbers, hyphens, and underscores (no dots).
 */
export const FLAG_KEYS = {
  /** Global sync kill-switch (server-enforced + reflected here). */
  syncEnabled: 'sync-enabled',
  /** Gate the OTP sign-in UI. */
  otpEnabled: 'auth-otp-enabled',
  /** Remote kill-switch for the Discover layer (chips + connector lens). */
  discoveryEnabled: 'discovery-enabled',
} as const;

export type FlagKey = (typeof FLAG_KEYS)[keyof typeof FLAG_KEYS];

export type RemoteFlags = Record<string, boolean>;

/** Safe defaults — used until/unless the worker says otherwise. */
export const DEFAULT_FLAGS: RemoteFlags = {
  [FLAG_KEYS.syncEnabled]: true,
  [FLAG_KEYS.otpEnabled]: true,
  [FLAG_KEYS.discoveryEnabled]: true,
};

/** Logical JSON config keys, mirrored exactly in the Flagship dashboard and the worker. */
export const CONFIG_KEYS = {
  discoveryThresholds: 'discovery-thresholds',
} as const;

export interface RemoteConfig {
  discoveryThresholds: DiscoveryThresholds;
}

/** Safe defaults — used until/unless the worker says otherwise. */
export const DEFAULT_CONFIG: RemoteConfig = {
  discoveryThresholds: DEFAULT_DISCOVERY_THRESHOLDS,
};

const CONFIG_URL = 'https://biblemarker.app/config';
const CACHE_KEY = 'remote_config';
/** Give up quickly when offline so startup never stalls on the flag fetch. */
const FETCH_TIMEOUT_MS = 5000;

interface CachedConfig {
  flags: RemoteFlags;
  /** Absent in an older cached snapshot written before Discover config shipped. */
  config?: unknown;
  /** Server-side evaluation timestamp from the worker. */
  evaluatedAt: string;
  /** When this device last stored the snapshot. */
  cachedAt: string;
}

/** Coarse OS tag for dashboard targeting rules (advisory only). Reused by telemetry.ts. */
export function platformTag(): string {
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

function isValidThresholdField(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 1 && value <= 50;
}

/**
 * Coerce raw `/config` JSON into safe `RemoteConfig`, field by field. Missing
 * or malformed fields (including an entirely absent `config`, from an older
 * cached snapshot or worker) fall back to `DEFAULT_DISCOVERY_THRESHOLDS`.
 */
export function normalizeConfig(raw: unknown): RemoteConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const thresholdsRaw = obj[CONFIG_KEYS.discoveryThresholds];
  const source = thresholdsRaw && typeof thresholdsRaw === 'object' ? (thresholdsRaw as Record<string, unknown>) : {};
  return {
    discoveryThresholds: {
      repetitionMinCount: isValidThresholdField(source.repetitionMinCount)
        ? source.repetitionMinCount
        : DEFAULT_DISCOVERY_THRESHOLDS.repetitionMinCount,
      repetitionMinWordLength: isValidThresholdField(source.repetitionMinWordLength)
        ? source.repetitionMinWordLength
        : DEFAULT_DISCOVERY_THRESHOLDS.repetitionMinWordLength,
      connectorChipMinCount: isValidThresholdField(source.connectorChipMinCount)
        ? source.connectorChipMinCount
        : DEFAULT_DISCOVERY_THRESHOLDS.connectorChipMinCount,
    },
  };
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
 * Read the last cached tunable config, or `DEFAULT_CONFIG` if absent/corrupt —
 * including a pre-Discover snapshot that never stored a `config` field.
 */
export async function readCachedConfig(): Promise<RemoteConfig> {
  try {
    const raw = await getSyncConfig(CACHE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as CachedConfig;
    return normalizeConfig(parsed.config);
  } catch {
    return DEFAULT_CONFIG;
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
 * Returns the flags + tunable config on success, or `null` on any failure
 * (network, timeout, bad shape) — callers keep using the cache/defaults. A
 * response missing `config` (older worker) normalizes to defaults rather than
 * failing the whole fetch. Never throws.
 */
export async function fetchRemoteFlags(): Promise<{ flags: RemoteFlags; config: RemoteConfig } | null> {
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
    const body = (await res.json()) as { flags?: unknown; config?: unknown; evaluatedAt?: unknown };
    // Require a real flags object before caching — a 200 with a missing/array
    // body (captive portal, misconfigured proxy) must not overwrite a good
    // cached snapshot with all-defaults.
    if (typeof body?.flags !== 'object' || body.flags === null || Array.isArray(body.flags)) {
      return null;
    }
    const flags = normalizeFlags(body.flags);
    const config = normalizeConfig(body.config); // tolerates a missing `config` (older worker)
    const snapshot: CachedConfig = {
      flags,
      config: body.config,
      evaluatedAt: typeof body.evaluatedAt === 'string' ? body.evaluatedAt : new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    };
    await setSyncConfig(CACHE_KEY, JSON.stringify(snapshot));
    return { flags, config };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
