/**
 * Email-OTP sign-in routes.
 *
 *   POST /auth/request {email}                request an 8-digit code (emailed)
 *   POST /auth/verify  {email, code, ...}     verify a code → { token, accountId }
 *   POST /auth/revoke                          revoke the caller's session (sign out)
 *
 * `/request` and `/verify` are unauthenticated (they establish a session).
 * To avoid account enumeration, `/request` always succeeds for a syntactically
 * valid email, and `/verify` returns the same generic error for an unknown,
 * expired, or wrong code.
 */

import type { Env } from './env';
import { sha256Hex, emailHash, parseBearer, SESSION_TTL_MS } from './auth';
import type { EmailSender } from './email';
import { jsonOk, jsonError } from './http';
import { clientIp, tooManyRequests } from './rate-limit';
import { verifyAttestation } from './attest';
import { isAttestationEnforced } from './flags';
import {
  normalizeEmail,
  isValidEmail,
  generateNumericCode,
  generateSessionToken,
  decideOtp,
  OTP_DIGITS,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  MAX_OTP_ATTEMPTS,
} from './otp';

const CODE_RE = new RegExp(`^\\d{${OTP_DIGITS}}$`);
const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep at most this many live sessions per account; prune the oldest beyond it. */
const MAX_SESSIONS_PER_ACCOUNT = 10;

export async function handleAuthRequest(
  request: Request,
  env: Env,
  sender: EmailSender
): Promise<Response> {
  // Per-IP throttle before any DB work (caps email-bomb / cost abuse).
  if (!(await env.AUTH_REQUEST_LIMITER.limit({ key: clientIp(request) })).success) {
    return tooManyRequests();
  }

  const body = await attestAndParse(env, request);
  if (body instanceof Response) return body;

  const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
  if (!isValidEmail(email)) return jsonError(400, 'Invalid email');

  const eHash = await emailHash(email);
  const now = Date.now();

  // Cooldown: if a code was issued moments ago, silently succeed without
  // re-sending (limits email spam + abuse without leaking anything).
  const recent = await env.DB.prepare(
    'SELECT created_at FROM otp_codes WHERE email_hash = ? ORDER BY created_at DESC LIMIT 1'
  )
    .bind(eHash)
    .first<{ created_at: string }>();
  if (recent && now - Date.parse(recent.created_at) < RESEND_COOLDOWN_MS) {
    return jsonOk({ ok: true });
  }

  const code = generateNumericCode();
  const codeHash = await sha256Hex(code);

  // Atomic upsert — email_hash is the PK, so this enforces one active code per
  // email and resets attempts in a single statement (no DELETE+INSERT window).
  await env.DB.prepare(
    `INSERT INTO otp_codes (email_hash, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email_hash) DO UPDATE SET
       code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       attempts = 0, created_at = excluded.created_at`
  )
    .bind(eHash, codeHash, new Date(now + OTP_TTL_MS).toISOString(), new Date(now).toISOString())
    .run();

  try {
    await sender.sendOtp(email, code);
  } catch {
    // Don't leave an undeliverable code blocking the cooldown — let a retry work.
    await env.DB.prepare('DELETE FROM otp_codes WHERE email_hash = ?').bind(eHash).run();
    // 502 (not 200) so the client can prompt a retry. This is not an enumeration
    // oracle: Postmark accepts every syntactically valid recipient (bounces are
    // async), so a 502 reflects a provider/server error, never address validity.
    return jsonError(502, 'Failed to send verification email');
  }

  return jsonOk({ ok: true });
}

export async function handleAuthVerify(request: Request, env: Env): Promise<Response> {
  // Per-IP throttle before any DB work (caps rapid brute-force guessing).
  if (!(await env.AUTH_VERIFY_LIMITER.limit({ key: clientIp(request) })).success) {
    return tooManyRequests();
  }

  const body = await attestAndParse(env, request);
  if (body instanceof Response) return body;

  const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!isValidEmail(email) || !CODE_RE.test(code)) {
    return jsonError(400, 'Invalid email or code');
  }

  const eHash = await emailHash(email);
  const row = await env.DB.prepare(
    'SELECT code_hash, expires_at, attempts FROM otp_codes WHERE email_hash = ? ORDER BY created_at DESC LIMIT 1'
  )
    .bind(eHash)
    .first<{ code_hash: string; expires_at: string; attempts: number }>();

  const submittedHash = await sha256Hex(code);
  const decision = decideOtp(row, submittedHash, Date.now());

  if (decision === 'mismatch') {
    // Conditional increment so the counter can't be pushed past the cap by
    // concurrent verifies. (A tiny TOCTOU window can still let a few concurrent
    // requests each compare on the same snapshot — negligible against a 10^8
    // keyspace with a hard lockout, and sustained brute force is already blocked
    // by random codes + the per-email resend cooldown + per-IP rate limiting.)
    await env.DB.prepare(
      'UPDATE otp_codes SET attempts = attempts + 1 WHERE email_hash = ? AND attempts < ?'
    )
      .bind(eHash, MAX_OTP_ATTEMPTS)
      .run();
    return jsonError(401, 'Incorrect or expired code');
  }
  if (decision === 'too-many-attempts') {
    await env.DB.prepare('DELETE FROM otp_codes WHERE email_hash = ?').bind(eHash).run();
    return jsonError(429, 'Too many attempts — request a new code');
  }
  if (decision !== 'ok') {
    return jsonError(401, 'Incorrect or expired code'); // no-code / expired
  }

  // Success: consume the code, upsert the account, issue a session.
  await env.DB.prepare('DELETE FROM otp_codes WHERE email_hash = ?').bind(eHash).run();

  const accountId = await upsertAccount(env, email);
  const deviceId =
    typeof body.deviceId === 'string' && DEVICE_ID_RE.test(body.deviceId) ? body.deviceId : null;

  const token = generateSessionToken();
  const tokenHash = await sha256Hex(token);
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, account_id, device_id, created_at, last_used_at, expires_at, revoked) VALUES (?, ?, ?, ?, ?, ?, 0)'
  )
    .bind(
      tokenHash,
      accountId,
      deviceId,
      nowIso,
      nowIso,
      new Date(Date.now() + SESSION_TTL_MS).toISOString()
    )
    .run();

  // Cap concurrent sessions per account: keep the newest N, prune the rest.
  // Bounds unbounded session growth and shrinks a leaked token's blast radius.
  // Best-effort — a prune failure must never fail the sign-in we just completed.
  try {
    await env.DB.prepare(
      `DELETE FROM sessions WHERE account_id = ?1 AND token_hash NOT IN (
         SELECT token_hash FROM sessions WHERE account_id = ?1
         ORDER BY created_at DESC LIMIT ?2
       )`
    )
      .bind(accountId, MAX_SESSIONS_PER_ACCOUNT)
      .run();
  } catch {
    /* session cap is best-effort — never fail a sign-in over pruning */
  }

  return jsonOk({ token, accountId });
}

export async function handleAuthRevoke(request: Request, env: Env): Promise<Response> {
  const token = parseBearer(request.headers.get('Authorization'));
  if (!token) return jsonError(401, 'Authentication required');

  // Idempotent: revoking an unknown token still returns ok (no token enumeration).
  await env.DB.prepare('UPDATE sessions SET revoked = 1 WHERE token_hash = ?')
    .bind(await sha256Hex(token))
    .run();
  return jsonOk({ ok: true });
}

/** Return the account id for `email`, creating the account if it doesn't exist. */
async function upsertAccount(env: Env, email: string): Promise<string> {
  const existing = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  try {
    await env.DB.prepare('INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)')
      .bind(id, email, new Date().toISOString())
      .run();
    return id;
  } catch {
    // Lost a race with a concurrent verify (email is UNIQUE) — re-read the winner.
    const row = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?')
      .bind(email)
      .first<{ id: string }>();
    if (row) return row.id;
    throw new Error('account upsert failed');
  }
}

/**
 * Read the raw body once, verify the client attestation against it, then parse
 * JSON. Returns the parsed body, or a `Response` to short-circuit with (403 when
 * attestation is enforced and missing/invalid, 400 for an unparseable body).
 * Reads the body as text so the attestation can bind its exact bytes — the JSON
 * parse reuses that text rather than re-reading the consumed stream.
 */
async function attestAndParse(
  env: Env,
  request: Request
): Promise<Record<string, unknown> | Response> {
  const rawBody = await request.text();

  // Attestation is only processed once `ATTEST_KEY` is configured — before the
  // secret is set (and in unit tests) the routes behave exactly as before.
  // Enforcement therefore depends on the key being present; set the secret
  // before flipping `auth-attestation-enforced` on.
  if (env.ATTEST_KEY && !(await verifyAttestation(env, request, rawBody))) {
    if (await isAttestationEnforced(env)) {
      return jsonError(403, 'Client attestation required');
    }
    // Soft-launch: log unattested traffic but allow it, so clients without the
    // header keep working until enforcement is flipped on.
    console.warn(`[attest] unattested ${new URL(request.url).pathname}`);
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    /* fall through to the 400 below */
  }
  return jsonError(400, 'Invalid JSON body');
}
