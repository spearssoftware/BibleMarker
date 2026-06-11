/**
 * Session authentication for the sync routes.
 *
 * Sync requests carry an opaque session token: `Authorization: Bearer <token>`.
 * The token itself is never stored server-side — only its SHA-256 hash is, in
 * the `sessions` table — so a DB leak can't be replayed as a live token. Tokens
 * are issued in Phase 2 (`/auth/verify`); this module is the verification half.
 */

import type { Env } from './env';

const BEARER_RE = /^Bearer\s+([A-Za-z0-9_-]+)$/;

/**
 * Session lifetime: 90 days, slid forward on every authenticated request (see
 * `authenticate`). Lives here (not `otp.ts`) so `auth.ts` doesn't import back
 * from `otp.ts` — `otp.ts` already imports `constantTimeEqual` from here, and a
 * cycle would otherwise form.
 */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface Session {
  accountId: string;
  deviceId: string | null;
}

/** Extract the opaque token from an `Authorization: Bearer <token>` header. */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = BEARER_RE.exec(header);
  return m ? m[1] : null;
}

/** Constant-time equality for two equal-length strings (e.g. hex hashes). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/** Lowercase hex SHA-256 of a string. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Canonical `email_hash` for the `otp_codes` table. Single-sourced here so the
 * Phase-2 OTP writer and the account-deletion reader can't drift on email
 * normalization.
 */
export function emailHash(email: string): Promise<string> {
  return sha256Hex(email.trim().toLowerCase());
}

/**
 * Resolve the session for a request, or `null` if the token is missing,
 * malformed, unknown, or revoked. On success, best-effort updates
 * `last_used_at` (failure there is non-fatal and does not block the request).
 */
export async function authenticate(env: Env, request: Request): Promise<Session | null> {
  const token = parseBearer(request.headers.get('Authorization'));
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT account_id, device_id FROM sessions WHERE token_hash = ? AND revoked = 0 AND (expires_at IS NULL OR expires_at > ?)'
  )
    .bind(tokenHash, new Date().toISOString())
    .first<{ account_id: string; device_id: string | null }>();

  if (!row) return null;

  try {
    // Slide the expiry forward so active sessions stay alive while idle ones
    // age out in SESSION_TTL_MS. Best-effort, like last_used_at: a failed bump
    // must never fail the request — worst case the session expires at its
    // current expires_at instead of being extended.
    const nowIso = new Date().toISOString();
    await env.DB.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?')
      .bind(nowIso, new Date(Date.now() + SESSION_TTL_MS).toISOString(), tokenHash)
      .run();
  } catch {
    /* last_used_at + sliding expiry are advisory — never fail a request over them */
  }

  return { accountId: row.account_id, deviceId: row.device_id };
}
