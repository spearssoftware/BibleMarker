import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  isValidEmail,
  generateNumericCode,
  generateSessionToken,
  decideOtp,
  type OtpRow,
} from './otp';

describe('email helpers', () => {
  it('normalizes by trimming and lowercasing', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('validates structure', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('user.name+tag@sub.example.com')).toBe(true);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
  });
});

describe('generateNumericCode', () => {
  it('always returns a zero-padded 8-digit string', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateNumericCode();
      expect(code).toMatch(/^\d{8}$/);
    }
  });
});

describe('generateSessionToken', () => {
  it('returns a bearer-charset token', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('does not repeat', () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });
});

describe('decideOtp', () => {
  const now = Date.parse('2026-06-10T12:00:00.000Z');
  const future = '2026-06-10T12:05:00.000Z';
  const past = '2026-06-10T11:55:00.000Z';
  const row = (over: Partial<OtpRow> = {}): OtpRow => ({
    code_hash: 'aaaa',
    expires_at: future,
    attempts: 0,
    ...over,
  });

  it('returns no-code when there is no row', () => {
    expect(decideOtp(null, 'aaaa', now)).toBe('no-code');
  });

  it('returns ok for a matching, fresh, un-locked code', () => {
    expect(decideOtp(row(), 'aaaa', now)).toBe('ok');
  });

  it('returns mismatch for a wrong code', () => {
    expect(decideOtp(row(), 'bbbb', now)).toBe('mismatch');
  });

  it('returns expired for a past code', () => {
    expect(decideOtp(row({ expires_at: past }), 'aaaa', now)).toBe('expired');
  });

  it('checks lockout before expiry (a brute-forced code cannot be revived by waiting)', () => {
    expect(decideOtp(row({ attempts: 5, expires_at: past }), 'aaaa', now)).toBe('too-many-attempts');
  });
});
