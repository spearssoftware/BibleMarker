import { describe, it, expect } from 'vitest';
import worker from './index';
import {
  buildFlagContext,
  buildClientConfig,
  accountContext,
  globalContext,
  FLAG_KEYS,
  FLAG_DEFAULTS,
} from './flags';
import { sha256Hex } from './auth';
import type { Session } from './auth';
import type { Env } from './env';
import {
  MemoryD1,
  MemoryFlags,
  MemoryR2,
  MemoryRateLimiter,
  asBucket,
  asDb,
  asFlags,
} from './test-mocks';

function envWith(flags: MemoryFlags, d1: MemoryD1 = new MemoryD1()): Env {
  return {
    FLAGS: asFlags(flags),
    DB: asDb(d1),
    SYNC_BUCKET: asBucket(new MemoryR2()),
    CONFIG_LIMITER: new MemoryRateLimiter(),
    MODULES_LIMITER: new MemoryRateLimiter(),
  } as unknown as Env;
}

function req(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://biblemarker.app${path}`, { headers });
}

describe('buildFlagContext', () => {
  it('reads advisory attributes from client headers and hashes on deviceId', () => {
    const ctx = buildFlagContext(
      req('/config', {
        'X-Device-Id': 'device-1',
        'X-Client-Platform': 'macos',
        'X-Client-Version': '2.1.1',
      })
    );
    expect(ctx).toEqual({
      targetingKey: 'device-1',
      deviceId: 'device-1',
      platform: 'macos',
      appVersion: '2.1.1',
    });
  });

  it('falls back to an anonymous targeting key with no device header', () => {
    const ctx = buildFlagContext(req('/config'));
    expect(ctx.targetingKey).toBe('anonymous');
    expect(ctx.deviceId).toBeUndefined();
    expect(ctx.accountId).toBeUndefined();
  });

  it('adds accountId from a verified session', () => {
    const session: Session = { accountId: 'acct-9', deviceId: 'device-1' };
    const ctx = buildFlagContext(req('/config', { 'X-Device-Id': 'device-1' }), session);
    expect(ctx.accountId).toBe('acct-9');
    expect(ctx.targetingKey).toBe('device-1'); // rollouts still hash per-install
  });

  it('ignores blank header values', () => {
    const ctx = buildFlagContext(req('/config', { 'X-Device-Id': '   ' }));
    expect(ctx.deviceId).toBeUndefined();
    expect(ctx.targetingKey).toBe('anonymous');
  });
});

describe('accountContext / globalContext', () => {
  it('keys an account-scoped check on the verified accountId, not a header', () => {
    const ctx = accountContext({ accountId: 'acct-9', deviceId: 'spoofed' });
    expect(ctx).toEqual({ targetingKey: 'acct-9', accountId: 'acct-9' });
  });

  it('uses a fixed global key for pre-auth checks', () => {
    expect(globalContext()).toEqual({ targetingKey: 'global' });
  });
});

describe('buildClientConfig', () => {
  it('returns the client flag subset with defaults when keys are absent', async () => {
    const env = envWith(new MemoryFlags());
    const cfg = await buildClientConfig(env, globalContext());
    expect(cfg.flags).toEqual({
      [FLAG_KEYS.syncEnabled]: FLAG_DEFAULTS[FLAG_KEYS.syncEnabled],
      [FLAG_KEYS.otpEnabled]: FLAG_DEFAULTS[FLAG_KEYS.otpEnabled],
      [FLAG_KEYS.httpBackend]: FLAG_DEFAULTS[FLAG_KEYS.httpBackend],
      [FLAG_KEYS.icloudMigration]: FLAG_DEFAULTS[FLAG_KEYS.icloudMigration],
    });
    expect(typeof cfg.evaluatedAt).toBe('string');
  });

  it('reflects preset flag values', async () => {
    const env = envWith(new MemoryFlags({ [FLAG_KEYS.syncEnabled]: false, [FLAG_KEYS.httpBackend]: true }));
    const cfg = await buildClientConfig(env, globalContext());
    expect(cfg.flags[FLAG_KEYS.syncEnabled]).toBe(false);
    expect(cfg.flags[FLAG_KEYS.httpBackend]).toBe(true);
  });

  it('fails open to defaults when the binding rejects', async () => {
    const throwing = { getBooleanValue: () => Promise.reject(new Error('binding down')) };
    const env = { FLAGS: throwing as unknown as Env['FLAGS'] } as unknown as Env;
    const cfg = await buildClientConfig(env, globalContext());
    expect(cfg.flags[FLAG_KEYS.syncEnabled]).toBe(true); // default, not a thrown 500
    expect(cfg.flags[FLAG_KEYS.httpBackend]).toBe(false);
  });
});

describe('GET /config dispatch', () => {
  it('returns 200 with the flag snapshot for an anonymous client', async () => {
    const env = envWith(new MemoryFlags());
    const res = await worker.fetch(req('/config', { 'X-Device-Id': 'device-1' }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const body = (await res.json()) as { flags: Record<string, boolean>; evaluatedAt: string };
    expect(body.flags[FLAG_KEYS.syncEnabled]).toBe(true);
  });

  it('degrades a bad bearer token to an anonymous evaluation (200, no accountId)', async () => {
    const flags = new MemoryFlags();
    const env = envWith(flags); // empty sessions table → token is unknown
    const res = await worker.fetch(
      req('/config', { Authorization: 'Bearer not-a-real-token', 'X-Device-Id': 'device-1' }),
      env
    );
    expect(res.status).toBe(200);
    expect((flags.lastContext as { accountId?: string }).accountId).toBeUndefined();
  });

  it('rejects non-GET methods', async () => {
    const env = envWith(new MemoryFlags());
    const res = await worker.fetch(
      new Request('https://biblemarker.app/config', { method: 'POST' }),
      env
    );
    expect(res.status).toBe(405);
  });

  it('answers the CORS preflight so the webview fetch can proceed', async () => {
    const env = envWith(new MemoryFlags());
    const res = await worker.fetch(
      new Request('https://biblemarker.app/config', { method: 'OPTIONS' }),
      env
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Device-Id');
  });

  it('tags the GET response with CORS headers', async () => {
    const env = envWith(new MemoryFlags());
    const res = await worker.fetch(req('/config', { 'X-Device-Id': 'device-1' }), env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('server-side enforcement', () => {
  it('returns 503 on /sync/* when the sync kill-switch is off', async () => {
    const d1 = new MemoryD1();
    const tokenHash = await sessionFor(d1, 'acct-1', 'a1b2c3d4-1111-2222-3333-444455556666');
    const env = envWith(new MemoryFlags({ [FLAG_KEYS.syncEnabled]: false }), d1);
    const res = await worker.fetch(
      new Request('https://biblemarker.app/sync/list', {
        headers: { Authorization: `Bearer ${tokenHash.token}` },
      }),
      env
    );
    expect(res.status).toBe(503);
  });

  it('keys the sync kill-switch on the verified accountId, not a spoofed device header', async () => {
    const d1 = new MemoryD1();
    const { token } = await sessionFor(d1, 'acct-real', 'a1b2c3d4-1111-2222-3333-444455556666');
    const flags = new MemoryFlags({ [FLAG_KEYS.syncEnabled]: true });
    const env = envWith(flags, d1);
    await worker.fetch(
      new Request('https://biblemarker.app/sync/list', {
        headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': 'spoofed-device' },
      }),
      env
    );
    const ctx = flags.lastContext as { targetingKey: string; accountId: string };
    expect(ctx.targetingKey).toBe('acct-real');
    expect(ctx.accountId).toBe('acct-real');
  });

  it('allows /sync/* when the kill-switch defaults on', async () => {
    const d1 = new MemoryD1();
    const tokenHash = await sessionFor(d1, 'acct-1', 'a1b2c3d4-1111-2222-3333-444455556666');
    const env = envWith(new MemoryFlags(), d1);
    const res = await worker.fetch(
      new Request('https://biblemarker.app/sync/list', {
        headers: { Authorization: `Bearer ${tokenHash.token}` },
      }),
      env
    );
    expect(res.status).toBe(200); // empty account → { entries: [] }
  });

  it('returns 503 on /auth/request when OTP is gated off', async () => {
    const env = envWith(new MemoryFlags({ [FLAG_KEYS.otpEnabled]: false }));
    const res = await worker.fetch(
      new Request('https://biblemarker.app/auth/request', {
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env
    );
    expect(res.status).toBe(503);
  });

  it('allows /sync/* (fails open) when the binding rejects, never 500', async () => {
    const d1 = new MemoryD1();
    const { token } = await sessionFor(d1, 'acct-1', 'a1b2c3d4-1111-2222-3333-444455556666');
    const throwing = { getBooleanValue: () => Promise.reject(new Error('binding down')) };
    const env = {
      FLAGS: throwing as unknown as Env['FLAGS'],
      DB: asDb(d1),
      SYNC_BUCKET: asBucket(new MemoryR2()),
    } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://biblemarker.app/sync/list', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(res.status).toBe(200); // default sync-enabled=true, not a 500
  });
});

/** Insert a live session into the MemoryD1 and return its plaintext token. */
async function sessionFor(d1: MemoryD1, accountId: string, deviceId: string) {
  const token = `tok-${accountId}`;
  const tokenHash = await sha256Hex(token);
  d1.sessions.set(tokenHash, {
    token_hash: tokenHash,
    account_id: accountId,
    device_id: deviceId,
    expires_at: null,
    revoked: 0,
  });
  return { token, tokenHash };
}
