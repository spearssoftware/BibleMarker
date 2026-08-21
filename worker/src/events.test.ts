import { describe, it, expect } from 'vitest';
import { handleEvents } from './events';
import type { Env } from './env';
import { MemoryAnalytics, MemoryRateLimiter, asAnalytics } from './test-mocks';

function envWith(opts: {
  limiter?: MemoryRateLimiter;
  analytics?: MemoryAnalytics | null;
} = {}): { env: Env; analytics: MemoryAnalytics | null } {
  const analytics = opts.analytics === null ? null : (opts.analytics ?? new MemoryAnalytics());
  const env = {
    EVENTS_LIMITER: opts.limiter ?? new MemoryRateLimiter(),
    ...(analytics ? { EVENTS: asAnalytics(analytics) } : {}),
  } as unknown as Env;
  return { env, analytics };
}

function req(body: unknown, init: RequestInit = {}): Request {
  return new Request('https://biblemarker.app/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
}

const VALID_BODY = {
  events: [{ name: 'discovery_chip_shown', feature: 'repetition' }],
  appVersion: '3.1.3',
  platform: 'ios',
  sessionId: 'session-abc-123',
};

describe('handleEvents — CORS + method handling', () => {
  it('answers the CORS preflight with 204', async () => {
    const { env } = envWith();
    const res = await handleEvents(
      new Request('https://biblemarker.app/events', { method: 'OPTIONS' }),
      env
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('rejects non-POST, non-OPTIONS methods with 405', async () => {
    const { env } = envWith();
    const res = await handleEvents(
      new Request('https://biblemarker.app/events', { method: 'GET' }),
      env
    );
    expect(res.status).toBe(405);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('handleEvents — rate limiting', () => {
  it('returns 429 when the per-IP limiter denies', async () => {
    const { env } = envWith({ limiter: new MemoryRateLimiter({ allow: false }) });
    const res = await handleEvents(req(VALID_BODY), env);
    expect(res.status).toBe(429);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('handleEvents — payload size', () => {
  it('returns 413 for a body over 8 KB', async () => {
    const { env } = envWith();
    const huge = {
      events: [{ name: 'discovery_chip_shown', feature: 'x'.repeat(8100) }],
      appVersion: '3.1.3',
      platform: 'ios',
    };
    const res = await handleEvents(req(huge), env);
    expect(res.status).toBe(413);
  });

  it('rejects via the declared Content-Length before reading the body', async () => {
    const { env } = envWith();
    const res = await handleEvents(
      req(VALID_BODY, { headers: { 'Content-Type': 'application/json', 'Content-Length': '999999' } }),
      env
    );
    expect(res.status).toBe(413);
  });
});

describe('handleEvents — validation', () => {
  it('accepts a valid batch and responds 202 with the accepted count', async () => {
    const { env } = envWith();
    const res = await handleEvents(req(VALID_BODY), env);
    expect(res.status).toBe(202);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as { accepted: number };
    expect(body.accepted).toBe(1);
  });

  it('rejects malformed JSON with 400', async () => {
    const { env } = envWith();
    const res = await handleEvents(
      new Request('https://biblemarker.app/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('rejects an event name outside the allowlist', async () => {
    const { env } = envWith();
    const res = await handleEvents(
      req({ ...VALID_BODY, events: [{ name: 'not_a_real_event' }] }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('rejects a malformed feature value', async () => {
    const { env } = envWith();
    const res = await handleEvents(
      req({ ...VALID_BODY, events: [{ name: 'discovery_chip_shown', feature: 'NOT VALID!' }] }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('rejects an empty events array', async () => {
    const { env } = envWith();
    const res = await handleEvents(req({ ...VALID_BODY, events: [] }), env);
    expect(res.status).toBe(400);
  });

  it('rejects a batch over 50 events', async () => {
    const { env } = envWith();
    const events = Array.from({ length: 51 }, () => ({ name: 'lens_toggled' }));
    const res = await handleEvents(req({ ...VALID_BODY, events }), env);
    expect(res.status).toBe(400);
  });

  it('rejects a malformed appVersion', async () => {
    const { env } = envWith();
    const res = await handleEvents(req({ ...VALID_BODY, appVersion: 'not a version!' }), env);
    expect(res.status).toBe(400);
  });

  it('rejects a platform outside the enum', async () => {
    const { env } = envWith();
    const res = await handleEvents(req({ ...VALID_BODY, platform: 'windows-phone' }), env);
    expect(res.status).toBe(400);
  });

  it('rejects an oversized sessionId', async () => {
    const { env } = envWith();
    const res = await handleEvents(req({ ...VALID_BODY, sessionId: 'x'.repeat(41) }), env);
    expect(res.status).toBe(400);
  });

  it('accepts a batch with no feature and no sessionId', async () => {
    const { env } = envWith();
    const res = await handleEvents(
      req({ events: [{ name: 'lens_toggled' }], appVersion: '1.0.0', platform: 'web' }),
      env
    );
    expect(res.status).toBe(202);
  });
});

describe('handleEvents — Analytics Engine point shape', () => {
  it('writes one point per event with the documented blob/index/double shape', async () => {
    const { env, analytics } = envWith();
    await handleEvents(req(VALID_BODY), env);
    expect(analytics!.points).toHaveLength(1);
    const point = analytics!.points[0];
    expect(point.indexes).toEqual(['discovery_chip_shown']);
    expect(point.blobs).toEqual(['discovery_chip_shown', 'repetition', '3.1.3', 'ios', '', 'session-abc-123']);
    expect(point.doubles).toEqual([1]);
  });

  it('writes a point per event for a multi-event batch', async () => {
    const { env, analytics } = envWith();
    await handleEvents(
      req({
        events: [{ name: 'discovery_chip_shown' }, { name: 'lens_toggled' }],
        appVersion: '3.1.3',
        platform: 'macos',
      }),
      env
    );
    expect(analytics!.points).toHaveLength(2);
  });

  it('never includes book/chapter/verse/account/device fields even if supplied', async () => {
    const { env, analytics } = envWith();
    await handleEvents(
      req({
        events: [
          {
            name: 'discovery_chip_shown',
            feature: 'repetition',
            book: 'JHN',
            chapter: 1,
            accountId: 'acct-1',
          },
        ],
        appVersion: '3.1.3',
        platform: 'ios',
      }),
      env
    );
    const point = analytics!.points[0];
    const flat = JSON.stringify(point);
    expect(flat).not.toContain('JHN');
    expect(flat).not.toContain('acct-1');
  });

  it('works when the EVENTS binding is undefined (wrangler dev / unconfigured)', async () => {
    const { env } = envWith({ analytics: null });
    const res = await handleEvents(req(VALID_BODY), env);
    expect(res.status).toBe(202);
  });
});
