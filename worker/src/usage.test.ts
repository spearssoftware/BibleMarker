import { describe, it, expect } from 'vitest';
import {
  MAX_OBJECTS_PER_ACCOUNT,
  objectCount,
  isAtQuota,
  incrementUsage,
  decrementUsage,
} from './usage';
import { handleSync } from './sync';
import type { Session } from './auth';
import type { Env } from './env';
import { MemoryD1, MemoryR2, MemoryRateLimiter, asBucket, asDb } from './test-mocks';

const SESSION: Session = { accountId: 'acct-A', deviceId: 'dev-1' };

function syncEnv(bucket: MemoryR2, d1: MemoryD1): Env {
  return {
    SYNC_BUCKET: asBucket(bucket),
    DB: asDb(d1),
    SYNC_LIMITER: new MemoryRateLimiter(),
  } as unknown as Env;
}

function blob(method: string, key: string, body?: string): { req: Request; url: URL } {
  const url = new URL(`https://x/sync/blob/${key}`);
  return { req: new Request(url, { method, body }), url };
}

describe('usage helpers', () => {
  it('objectCount defaults to 0; increment/decrement adjust and floor at 0', async () => {
    const d1 = new MemoryD1();
    const env = { DB: asDb(d1) } as unknown as Env;
    expect(await objectCount(env, 'a')).toBe(0);
    await incrementUsage(env, 'a');
    await incrementUsage(env, 'a');
    expect(await objectCount(env, 'a')).toBe(2);
    await decrementUsage(env, 'a');
    expect(await objectCount(env, 'a')).toBe(1);
    await decrementUsage(env, 'a');
    await decrementUsage(env, 'a'); // underflow guarded
    expect(await objectCount(env, 'a')).toBe(0);
  });

  it('isAtQuota only at/above the cap', async () => {
    const d1 = new MemoryD1();
    const env = { DB: asDb(d1) } as unknown as Env;
    expect(await isAtQuota(env, 'a')).toBe(false);
    d1.usage.set('a', MAX_OBJECTS_PER_ACCOUNT - 1);
    expect(await isAtQuota(env, 'a')).toBe(false);
    d1.usage.set('a', MAX_OBJECTS_PER_ACCOUNT);
    expect(await isAtQuota(env, 'a')).toBe(true);
  });
});

describe('handleBlob storage quota', () => {
  it('rejects a NEW blob over the object-count cap with 507 and does not store it', async () => {
    const bucket = new MemoryR2();
    const d1 = new MemoryD1();
    d1.usage.set('acct-A', MAX_OBJECTS_PER_ACCOUNT);
    const { req, url } = blob('PUT', 'dev/new.json', '{}');
    const res = await handleSync(req, syncEnv(bucket, d1), SESSION, url);
    expect(res.status).toBe(507);
    expect(bucket.store.size).toBe(0);
  });

  it('allows OVERWRITING an existing blob even at the cap (no new slot)', async () => {
    const bucket = new MemoryR2();
    await bucket.put('sync/acct-A/dev/x.json', 'old');
    const d1 = new MemoryD1();
    d1.usage.set('acct-A', MAX_OBJECTS_PER_ACCOUNT);
    const { req, url } = blob('PUT', 'dev/x.json', 'new');
    const res = await handleSync(req, syncEnv(bucket, d1), SESSION, url);
    expect(res.status).toBe(204);
    expect(bucket.store.get('sync/acct-A/dev/x.json')).toBe('new');
  });

  it('increments on a new PUT, no-ops on overwrite, decrements on DELETE', async () => {
    const bucket = new MemoryR2();
    const d1 = new MemoryD1();
    const env = syncEnv(bucket, d1);
    const put = (key: string, body: string) => {
      const { req, url } = blob('PUT', key, body);
      return handleSync(req, env, SESSION, url);
    };
    const del = (key: string) => {
      const { req, url } = blob('DELETE', key);
      return handleSync(req, env, SESSION, url);
    };

    await put('dev/1.json', 'a');
    expect(d1.usage.get('acct-A')).toBe(1);
    await put('dev/1.json', 'b'); // overwrite — same slot
    expect(d1.usage.get('acct-A')).toBe(1);
    await put('dev/2.json', 'c');
    expect(d1.usage.get('acct-A')).toBe(2);

    await del('dev/1.json');
    expect(d1.usage.get('acct-A')).toBe(1);
    await del('dev/1.json'); // already absent — no underflow
    expect(d1.usage.get('acct-A')).toBe(1);
  });
});
