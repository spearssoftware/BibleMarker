import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeToken, verifyToken, handleModuleRequest } from './modules';
import type { Env } from './env';
import { MemoryR2, MemoryRateLimiter, asBucket } from './test-mocks';

const KEY = 'test-signing-key-1234567890abcdef';

describe('computeToken / verifyToken', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifies a fresh token from the same key', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const token = await computeToken('NASB-2020.zip', ts, KEY);
    const auth = `BibleMarker ${ts}.${token}`;
    expect(await verifyToken(auth, 'NASB-2020.zip', KEY)).toBe(true);
  });

  it('rejects a token from a different key', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const token = await computeToken('NASB-2020.zip', ts, 'other-key');
    const auth = `BibleMarker ${ts}.${token}`;
    expect(await verifyToken(auth, 'NASB-2020.zip', KEY)).toBe(false);
  });

  it('rejects a token computed for a different module', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const token = await computeToken('NASB-1995.zip', ts, KEY);
    const auth = `BibleMarker ${ts}.${token}`;
    expect(await verifyToken(auth, 'NASB-2020.zip', KEY)).toBe(false);
  });

  it('rejects a stale token (more than 1 hour old)', async () => {
    const oldTs = Math.floor(Date.now() / 1000) - 3700;
    const token = await computeToken('NASB-2020.zip', oldTs, KEY);
    const auth = `BibleMarker ${oldTs}.${token}`;
    expect(await verifyToken(auth, 'NASB-2020.zip', KEY)).toBe(false);
  });

  it('rejects a future-dated token (more than 1 hour ahead)', async () => {
    const futureTs = Math.floor(Date.now() / 1000) + 3700;
    const token = await computeToken('NASB-2020.zip', futureTs, KEY);
    const auth = `BibleMarker ${futureTs}.${token}`;
    expect(await verifyToken(auth, 'NASB-2020.zip', KEY)).toBe(false);
  });

  it('accepts tokens slightly out of sync (within 1 hour)', async () => {
    const skewTs = Math.floor(Date.now() / 1000) + 1800;
    const token = await computeToken('NASB-2020.zip', skewTs, KEY);
    const auth = `BibleMarker ${skewTs}.${token}`;
    expect(await verifyToken(auth, 'NASB-2020.zip', KEY)).toBe(true);
  });

  it('rejects malformed Authorization headers', async () => {
    expect(await verifyToken('Bearer abc', 'NASB-2020.zip', KEY)).toBe(false);
    expect(await verifyToken('BibleMarker abc', 'NASB-2020.zip', KEY)).toBe(false);
    expect(await verifyToken('BibleMarker 12345', 'NASB-2020.zip', KEY)).toBe(false);
    expect(await verifyToken('', 'NASB-2020.zip', KEY)).toBe(false);
  });

  it('rejects a tampered token (correct timestamp, wrong signature)', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const auth = `BibleMarker ${ts}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(await verifyToken(auth, 'NASB-2020.zip', KEY)).toBe(false);
  });
});

describe('handleModuleRequest — rate limit + serve', () => {
  function modEnv(limiter: MemoryRateLimiter = new MemoryRateLimiter()) {
    const bucket = new MemoryR2();
    const env = {
      SIGNING_KEY: KEY,
      MODULES_BUCKET: asBucket(bucket),
      MODULES_LIMITER: limiter,
    } as unknown as Env;
    return { env, bucket };
  }

  it('returns 429 when the modules limiter denies (before auth)', async () => {
    const { env } = modEnv(new MemoryRateLimiter({ allow: false }));
    const url = new URL('https://x/modules/NASB-2020.zip');
    const res = await handleModuleRequest(
      new Request(url, { headers: { Authorization: 'BibleMarker still-rejected' } }),
      env,
      url
    );
    expect(res.status).toBe(429);
  });

  it('serves a module to a validly signed request', async () => {
    const { env, bucket } = modEnv();
    await bucket.put('NASB-2020.zip', 'ZIPDATA');
    const ts = Math.floor(Date.now() / 1000);
    const token = await computeToken('NASB-2020.zip', ts, KEY);
    const url = new URL('https://x/modules/NASB-2020.zip');
    const res = await handleModuleRequest(
      new Request(url, { headers: { Authorization: `BibleMarker ${ts}.${token}` } }),
      env,
      url
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ZIPDATA');
  });
});
