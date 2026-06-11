import { describe, it, expect } from 'vitest';
import { cleanupExpired } from './cleanup';
import { MemoryD1, asDb } from './test-mocks';

const NOW = '2026-06-11T12:00:00.000Z';
const PAST = '2026-06-11T11:00:00.000Z';
const FUTURE = '2026-06-11T13:00:00.000Z';

/** Seed an OTP row directly (the modeled INSERT can't set expires_at freely). */
function seedOtp(d1: MemoryD1, key: string, expires_at: string) {
  d1.otp.set(key, { email_hash: key, code_hash: 'h', expires_at, attempts: 0, created_at: PAST });
}

/** Seed a session directly (the modeled INSERT hardcodes revoked: 0). */
function seedSession(
  d1: MemoryD1,
  key: string,
  fields: { expires_at: string | null; revoked: number }
) {
  d1.sessions.set(key, {
    token_hash: key,
    account_id: 'acc',
    device_id: null,
    expires_at: fields.expires_at,
    revoked: fields.revoked,
  });
}

describe('cleanupExpired', () => {
  it('removes only expired OTP codes and dead sessions, and returns counts', async () => {
    const d1 = new MemoryD1();
    seedOtp(d1, 'otp-expired', PAST);
    seedOtp(d1, 'otp-fresh', FUTURE);

    seedSession(d1, 'sess-expired', { expires_at: PAST, revoked: 0 });
    seedSession(d1, 'sess-revoked', { expires_at: FUTURE, revoked: 1 });
    seedSession(d1, 'sess-active', { expires_at: FUTURE, revoked: 0 });
    seedSession(d1, 'sess-no-expiry', { expires_at: null, revoked: 0 });

    const result = await cleanupExpired(asDb(d1), NOW);

    expect(result).toEqual({ otpDeleted: 1, sessionsDeleted: 2 });
    expect([...d1.otp.keys()]).toEqual(['otp-fresh']);
    expect([...d1.sessions.keys()].sort()).toEqual(['sess-active', 'sess-no-expiry']);
  });

  it('returns zero counts when nothing is expired', async () => {
    const d1 = new MemoryD1();
    seedOtp(d1, 'otp-fresh', FUTURE);
    seedSession(d1, 'sess-active', { expires_at: FUTURE, revoked: 0 });

    const result = await cleanupExpired(asDb(d1), NOW);

    expect(result).toEqual({ otpDeleted: 0, sessionsDeleted: 0 });
    expect(d1.otp.size).toBe(1);
    expect(d1.sessions.size).toBe(1);
  });
});
