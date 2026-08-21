/**
 * `POST /events` — opt-in, anonymous Discover-layer telemetry.
 *
 * Client: `src/lib/telemetry.ts`. `track()` is a no-op unless the user has
 * flipped "Share anonymous usage data" on, so every request here already
 * represents an opted-in user. The batch is written to the `EVENTS` Analytics
 * Engine dataset (3-month retention, SQL-queryable — see the worker README).
 *
 * Payload is deliberately minimal and allowlisted: an event `name` from a
 * fixed set, an optional `feature` tag, plus batch-level `appVersion`,
 * `platform`, and an in-memory-only `sessionId`. No book/chapter/verse/word,
 * account id, device id, or IP-derived location (e.g. `cf.country`) is ever
 * accepted or written.
 */

import type { Env } from './env';
import { jsonError, jsonOk } from './http';
import { clientIp, tooManyRequests } from './rate-limit';

const MAX_BODY_BYTES = 8 * 1024;
const MIN_EVENTS_PER_BATCH = 1;
const MAX_EVENTS_PER_BATCH = 30;

/** Allowlisted event names — mirrored exactly on the client (`telemetry.ts`). */
const EVENT_NAMES = new Set([
  'discovery_chip_shown',
  'discovery_chip_tapped',
  'discovery_find_confirmed',
  'lens_toggled',
]);

/** Mirrored from `src/lib/platform.ts` platform tags. */
const PLATFORMS = new Set(['ios', 'android', 'macos', 'desktop', 'web']);

const FEATURE_RE = /^[a-z0-9_-]{1,32}$/;
const APP_VERSION_RE = /^[0-9A-Za-z.+-]{1,20}$/;
/** RFC 4122 UUID v4 — matches `crypto.randomUUID()` on the client. */
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ValidatedEvent {
  name: string;
  feature: string;
}

interface ValidatedBatch {
  events: ValidatedEvent[];
  appVersion: string;
  platform: string;
  sessionId: string;
}

/**
 * CORS headers for `/events`. Same posture as `/config` in `flags.ts`: public,
 * credential-free, so a wildcard origin is safe.
 */
const EVENTS_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Client-Version, X-Client-Platform',
  'Access-Control-Max-Age': '86400',
};

function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(EVENTS_CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

/**
 * Validate the whole request body. Any malformed field fails the entire
 * batch (400) — there is no partial acceptance.
 */
function validateBody(body: unknown): ValidatedBatch | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;

  const rawEvents = obj.events;
  if (
    !Array.isArray(rawEvents) ||
    rawEvents.length < MIN_EVENTS_PER_BATCH ||
    rawEvents.length > MAX_EVENTS_PER_BATCH
  ) {
    return null;
  }

  const events: ValidatedEvent[] = [];
  for (const raw of rawEvents) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.name !== 'string' || !EVENT_NAMES.has(r.name)) return null;

    let feature = '';
    if (r.feature !== undefined && r.feature !== null) {
      if (typeof r.feature !== 'string' || !FEATURE_RE.test(r.feature)) return null;
      feature = r.feature;
    }
    events.push({ name: r.name, feature });
  }

  if (typeof obj.appVersion !== 'string' || !APP_VERSION_RE.test(obj.appVersion)) return null;
  if (typeof obj.platform !== 'string' || !PLATFORMS.has(obj.platform)) return null;

  let sessionId = '';
  if (obj.sessionId !== undefined && obj.sessionId !== null) {
    if (typeof obj.sessionId !== 'string' || !SESSION_ID_RE.test(obj.sessionId)) return null;
    sessionId = obj.sessionId;
  }

  return { events, appVersion: obj.appVersion, platform: obj.platform, sessionId };
}

/**
 * `POST /events` — ingest an opted-in telemetry batch. Public, unauthenticated
 * (the client never sends a session token here), requires an explicit
 * `Content-Type: application/json`, rate-limited per IP, and capped at
 * 8 KB / 30 events per request.
 */
export async function handleEvents(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: EVENTS_CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return withCors(jsonError(405, 'Method Not Allowed'));
  }

  if (!(await env.EVENTS_LIMITER.limit({ key: clientIp(request) })).success) {
    return withCors(tooManyRequests());
  }

  // Require an explicit JSON content type so a cross-site "simple request"
  // (a plain <form>/fetch POST, which browsers allow without a CORS
  // preflight as long as it skips this header) can't land here and poison
  // the dataset.
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return withCors(jsonError(415, 'Unsupported Media Type'));
  }

  // Fast-path reject on the declared length before reading the body; the
  // authoritative check below covers a missing/lying Content-Length too.
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return withCors(jsonError(413, 'Payload Too Large'));
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return withCors(jsonError(413, 'Payload Too Large'));
  }

  let parsed: unknown;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return withCors(jsonError(400, 'Invalid JSON'));
  }

  const validated = validateBody(parsed);
  if (!validated) {
    return withCors(jsonError(400, 'Invalid event batch'));
  }

  const { events, appVersion, platform, sessionId } = validated;
  for (const event of events) {
    // Optional-chained: the binding is absent under `wrangler dev`, and a
    // missing dataset must never turn an opted-in user's request into a 500.
    env.EVENTS?.writeDataPoint({
      indexes: [event.name],
      blobs: [event.name, event.feature, appVersion, platform, sessionId],
      doubles: [1],
    });
  }

  const res = withCors(jsonOk({ accepted: events.length }, 202));
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
