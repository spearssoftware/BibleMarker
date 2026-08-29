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

const VALID_SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';

const VALID_BODY = {
  events: [{ name: 'discovery_chip_shown', feature: 'repetition' }],
  appVersion: '3.1.3',
  platform: 'ios',
  sessionId: VALID_SESSION_ID,
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

describe('handleEvents — Content-Type', () => {
  it('rejects a POST with no Content-Type header with 415', async () => {
    const { env } = envWith();
    const res = await handleEvents(
      new Request('https://biblemarker.app/events', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
      }),
      env
    );
    expect(res.status).toBe(415);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects a non-JSON Content-Type with 415, even for a simple cross-site POST', async () => {
    const { env } = envWith();
    const res = await handleEvents(
      new Request('https://biblemarker.app/events', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(VALID_BODY),
      }),
      env
    );
    expect(res.status).toBe(415);
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

  it('accepts the discovery_checklist_completed event name', async () => {
    const { env } = envWith();
    const res = await handleEvents(
      req({ ...VALID_BODY, events: [{ name: 'discovery_checklist_completed' }] }),
      env
    );
    expect(res.status).toBe(202);
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

  it('rejects a batch over 30 events', async () => {
    const { env } = envWith();
    const events = Array.from({ length: 31 }, () => ({ name: 'lens_toggled' }));
    const res = await handleEvents(req({ ...VALID_BODY, events }), env);
    expect(res.status).toBe(400);
  });

  it('accepts a batch at exactly the 30-event cap', async () => {
    const { env } = envWith();
    const events = Array.from({ length: 30 }, () => ({ name: 'lens_toggled' }));
    const res = await handleEvents(req({ ...VALID_BODY, events }), env);
    expect(res.status).toBe(202);
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

  it('rejects a sessionId that is not a UUID v4', async () => {
    const { env } = envWith();
    const res = await handleEvents(req({ ...VALID_BODY, sessionId: 'not-a-uuid' }), env);
    expect(res.status).toBe(400);
  });

  it('rejects an oversized/malformed sessionId', async () => {
    const { env } = envWith();
    const res = await handleEvents(req({ ...VALID_BODY, sessionId: 'x'.repeat(41) }), env);
    expect(res.status).toBe(400);
  });

  it('rejects a UUID v1-shaped sessionId (wrong version nibble)', async () => {
    const { env } = envWith();
    // Same shape as VALID_SESSION_ID but with a '1' version nibble instead of '4'.
    const res = await handleEvents(
      req({ ...VALID_BODY, sessionId: '123e4567-e89b-12d3-a456-426614174000' }),
      env
    );
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
    expect(point.blobs).toEqual(['discovery_chip_shown', 'repetition', '3.1.3', 'ios', VALID_SESSION_ID]);
    expect(point.doubles).toEqual([1]);
  });

  it('never writes a country/location blob, even though `request.cf` is available', async () => {
    const { env, analytics } = envWith();
    const request = req(VALID_BODY);
    // Simulate what a real deployed Worker attaches to the request.
    Object.defineProperty(request, 'cf', { value: { country: 'US' }, configurable: true });
    await handleEvents(request, env);
    const point = analytics!.points[0];
    expect(point.blobs).toHaveLength(5);
    expect(point.blobs).not.toContain('US');
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
