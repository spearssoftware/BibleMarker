/**
 * Client attestation for the unauthenticated `/auth/*` routes.
 *
 * Official builds send `X-BM-Attest: <unix_ts>.<base64url-hmac>`, where the HMAC
 * signs `<ts>:<METHOD>:<path>:<sha256(body)>` under `ATTEST_KEY`. Binding the
 * body hash means a captured header can't be replayed against a *different*
 * request (e.g. a different email) — only the same request, and only within the
 * skew window.
 *
 * SPEED-BUMP ONLY. `ATTEST_KEY` ships inside the client and is extractable
 * (binary strings, or proxying the app's own traffic), and there is no
 * server-side nonce store, so a captured header is replayable for its own
 * request until it expires. This filters casual/scripted abuse; the durable
 * protections remain the per-email cooldown, per-IP rate limits, and per-account
 * quotas. Enforcement is gated behind the `auth-attestation-enforced` flag so
 * existing clients keep working until a build that sends the header has rolled
 * out (see `isAttestationEnforced` in flags.ts).
 */

import type { Env } from './env';
import { sha256Hex } from './auth';
import { hmacSha256, timingSafeEqual } from './hmac';

const HEADER = 'X-BM-Attest';
const HEADER_RE = /^(\d{1,15})\.([A-Za-z0-9_-]+)$/;
/** Accepted clock skew between client and edge, in seconds. */
const SKEW_SECONDS = 300;

/**
 * Whether the request carries a valid attestation for `rawBody`. Returns false
 * for a missing, malformed, expired, or mismatched header; the caller decides
 * whether that's fatal (flag on) or merely logged (soft-launch).
 */
export async function verifyAttestation(
  env: Env,
  request: Request,
  rawBody: string
): Promise<boolean> {
  const header = request.headers.get(HEADER);
  if (!header) return false;
  const m = HEADER_RE.exec(header);
  if (!m) return false;

  const ts = Number(m[1]);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SKEW_SECONDS) return false;

  const path = new URL(request.url).pathname;
  const message = `${ts}:${request.method}:${path}:${await sha256Hex(rawBody)}`;
  const expected = await hmacSha256(env.ATTEST_KEY, message);
  return timingSafeEqual(expected, m[2]);
}
