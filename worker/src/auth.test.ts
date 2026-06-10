import { describe, it, expect } from 'vitest';
import { parseBearer, sha256Hex, authenticate } from './auth';
import type { Env } from './env';

describe('parseBearer', () => {
  it('extracts the token from a Bearer header', () => {
    expect(parseBearer('Bearer abc-123_XYZ')).toBe('abc-123_XYZ');
  });

  it('rejects missing or wrong-scheme headers', () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer('Basic abc')).toBeNull();
    expect(parseBearer('Bearer ')).toBeNull();
    expect(parseBearer('Bearer a b')).toBeNull();
  });
});

describe('sha256Hex', () => {
  it('matches the known SHA-256 of the empty string', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });
});

/**
 * Minimal D1 fake: returns the session row only when the bound token hash
 * matches `expectedHash`, mirroring `WHERE token_hash = ? AND revoked = 0`.
 */
function fakeEnv(expectedHash: string | null, row: { account_id: string; device_id: string | null } | null): Env {
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (!sql.startsWith('SELECT')) return null;
              return expectedHash !== null && args[0] === expectedHash ? row : null;
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };
  return { DB: db } as unknown as Env;
}

describe('authenticate', () => {
  it('returns the session for a known, unrevoked token', async () => {
    const hash = await sha256Hex('good-token');
    const env = fakeEnv(hash, { account_id: 'acct-1', device_id: 'dev-1' });
    const req = new Request('https://x/sync/list', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(await authenticate(env, req)).toEqual({ accountId: 'acct-1', deviceId: 'dev-1' });
  });

  it('returns null for an unknown token (hash miss)', async () => {
    const hash = await sha256Hex('good-token');
    const env = fakeEnv(hash, { account_id: 'acct-1', device_id: 'dev-1' });
    const req = new Request('https://x/sync/list', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(await authenticate(env, req)).toBeNull();
  });

  it('returns null when no Authorization header is present', async () => {
    const env = fakeEnv(null, null);
    expect(await authenticate(env, new Request('https://x/sync/list'))).toBeNull();
  });
});
