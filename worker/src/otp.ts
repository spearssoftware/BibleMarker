/**
 * Pure helpers for email-OTP sign-in: email normalization/validation, code and
 * session-token generation, and the verification decision. Kept side-effect-free
 * (the decision takes `nowMs` rather than reading the clock) so the security-
 * critical branches are exhaustively unit-tested without a DB or fake timers.
 */

import { constantTimeEqual } from './auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const OTP_DIGITS = 8;
/** Code lifetime: 10 minutes. */
export const OTP_TTL_MS = 10 * 60 * 1000;
/** Don't re-issue/re-send a code within this window of the last one. */
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** Wrong-code attempts allowed before the code is burned. */
export const MAX_OTP_ATTEMPTS = 5;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email);
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A zero-padded N-digit numeric code, drawn without modulo bias. */
export function generateNumericCode(digits = OTP_DIGITS): string {
  const max = 10 ** digits;
  const limit = Math.floor(0x100000000 / max) * max; // reject above this to avoid bias
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(n % max).padStart(digits, '0');
}

/** 32 random bytes, base64url — matches the `Bearer` token charset. */
export function generateSessionToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export type OtpDecision = 'ok' | 'no-code' | 'expired' | 'too-many-attempts' | 'mismatch';

export interface OtpRow {
  code_hash: string;
  expires_at: string; // ISO-8601
  attempts: number;
}

/**
 * Decide an OTP submission. Order matters: lockout is checked before expiry so a
 * brute-forced code can't be revived by waiting, and the hash compare is
 * constant-time and runs last.
 */
export function decideOtp(
  row: OtpRow | null,
  submittedCodeHash: string,
  nowMs: number,
  maxAttempts = MAX_OTP_ATTEMPTS
): OtpDecision {
  if (!row) return 'no-code';
  if (row.attempts >= maxAttempts) return 'too-many-attempts';
  if (Date.parse(row.expires_at) <= nowMs) return 'expired';
  if (!constantTimeEqual(row.code_hash, submittedCodeHash)) return 'mismatch';
  return 'ok';
}
