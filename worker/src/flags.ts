/**
 * Cloudflare Flagship feature-flag evaluation.
 *
 * This is the SINGLE place in the Worker that touches the Flagship binding.
 * Every flag read funnels through the typed accessors here, so swapping the
 * provider (or falling back to static defaults) is a one-file change — the
 * reason we use the native binding instead of the OpenFeature wrapper.
 *
 * Flags are either enforced inline (kill-switches in `index.ts`) or shipped to
 * the offline client as a JSON snapshot via `GET /config`.
 */

import type { Env } from './env';
import { authenticate, type Session } from './auth';
import { jsonOk, jsonError } from './http';

/**
 * Logical flag keys, mirrored exactly in the Flagship dashboard.
 * Flagship keys allow only letters, numbers, hyphens, and underscores (no dots).
 */
export const FLAG_KEYS = {
  /** Global sync kill-switch (server-enforced on `/sync/*` + client-reflected). */
  syncEnabled: 'sync-enabled',
  /** Gate the OTP request route + the client sign-in UI. */
  otpEnabled: 'auth-otp-enabled',
  /** Toggle the HTTP storage backend vs iCloud during the Phase 3 migration. */
  httpBackend: 'sync-http-backend',
  /** Enable the one-shot iCloud drain (Phase 4). */
  icloudMigration: 'sync-icloud-migration',
} as const;

/** Safe defaults used when a flag is undefined or the binding is unreachable. */
export const FLAG_DEFAULTS: Record<string, boolean> = {
  [FLAG_KEYS.syncEnabled]: true,
  [FLAG_KEYS.otpEnabled]: true,
  [FLAG_KEYS.httpBackend]: false,
  [FLAG_KEYS.icloudMigration]: false,
};

/** The flag subset shipped to clients via `GET /config` — currently all of them. */
const CLIENT_FLAG_KEYS = Object.values(FLAG_KEYS);

/**
 * Evaluation context passed to Flagship. `targetingKey` drives consistent-hash
 * percentage rollouts; the remaining attributes are matched by dashboard rules.
 *
 * `deviceId` / `platform` / `appVersion` come from client-supplied headers and
 * are ADVISORY (spoofable) — fine for rollouts and "my devices first", never
 * for authorization. `accountId` is filled only from a verified session.
 */
export interface FlagContext {
  targetingKey: string;
  deviceId?: string;
  platform?: string;
  appVersion?: string;
  accountId?: string;
}

export interface ClientConfig {
  flags: Record<string, boolean>;
  evaluatedAt: string;
}

function header(request: Request, name: string): string | undefined {
  const v = request.headers.get(name);
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Build the evaluation context for a client `/config` request. Percentage
 * rollouts hash on the per-install `deviceId` so an account's devices can be
 * ramped independently; a signed-in request also carries `accountId` for
 * account-level targeting rules.
 */
export function buildFlagContext(request: Request, session?: Session): FlagContext {
  const deviceId = header(request, 'X-Device-Id');
  const ctx: FlagContext = {
    targetingKey: deviceId ?? 'anonymous',
    deviceId,
    platform: header(request, 'X-Client-Platform'),
    appVersion: header(request, 'X-Client-Version'),
  };
  if (session?.accountId) ctx.accountId = session.accountId;
  return ctx;
}

/**
 * Context for an authoritative, account-scoped check (the sync kill-switch).
 * Keyed on the VERIFIED `accountId` from the session, never a spoofable header,
 * so a partial rollout can't be dodged by lying about a device id.
 */
export function accountContext(session: Session): FlagContext {
  return { targetingKey: session.accountId, accountId: session.accountId };
}

/** Context for a pre-auth global check (the OTP request gate). */
export function globalContext(): FlagContext {
  return { targetingKey: 'global' };
}

// ── Binding access — the only caller of the Flagship binding ────────────────

/**
 * The single point that touches the binding; swap here to change providers.
 * Fails open: any binding rejection falls back to `def`, so a flag-provider
 * outage never turns a kill-switch into a hard 500 on `/sync`, `/auth`, or
 * `/config` — the safe default applies instead.
 */
async function getBool(env: Env, key: string, def: boolean, ctx: FlagContext): Promise<boolean> {
  try {
    return await env.FLAGS.getBooleanValue(key, def, ctx);
  } catch (err) {
    console.error(`[flags] evaluation failed for "${key}", using default ${def}`, err);
    return def;
  }
}

/**
 * Sync kill-switch, keyed on the verified account (the authoritative check
 * enforced on `/sync/*`). Defaults on if the binding is unreachable.
 */
export function isSyncEnabled(env: Env, session: Session): Promise<boolean> {
  return getBool(env, FLAG_KEYS.syncEnabled, true, accountContext(session));
}

/** OTP sign-in gate, evaluated pre-auth as a global on/off. Defaults on. */
export function isOtpEnabled(env: Env): Promise<boolean> {
  return getBool(env, FLAG_KEYS.otpEnabled, true, globalContext());
}

/** Evaluate the client-facing flag subset into a snapshot for `GET /config`. */
export async function buildClientConfig(env: Env, ctx: FlagContext): Promise<ClientConfig> {
  // Fire all evaluations concurrently — each is an independent binding read.
  const entries = await Promise.all(
    CLIENT_FLAG_KEYS.map((key) =>
      getBool(env, key, FLAG_DEFAULTS[key], ctx).then((value) => [key, value] as const)
    )
  );
  return { flags: Object.fromEntries(entries), evaluatedAt: new Date().toISOString() };
}

/**
 * `GET /config` — the client's feature-flag snapshot. Public, but enriched with
 * the verified accountId when a bearer token is present. A bad/absent token or a
 * D1 outage degrades to an anonymous evaluation (200), never a 401/500.
 */
export async function handleConfig(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return jsonError(405, 'Method Not Allowed');

  let session: Session | null = null;
  try {
    session = await authenticate(env, request);
  } catch {
    /* D1 unavailable — evaluate anonymously rather than failing the client */
  }

  const ctx = buildFlagContext(request, session ?? undefined);
  const res = jsonOk(await buildClientConfig(env, ctx));
  // Per-device-targeted — must never be served from an edge/proxy cache.
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}
