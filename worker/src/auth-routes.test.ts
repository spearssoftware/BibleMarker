import { describe, it, expect, vi } from 'vitest';
import { handleAuthRequest, handleAuthVerify, handleAuthRevoke } from './auth-routes';
import { authenticate, sha256Hex } from './auth';
import { hmacSha256 } from './hmac';
import { SERVER_FLAG_KEYS } from './flags';
import type { Env } from './env';
import type { EmailSender } from './email';
import { MemoryD1, MemoryFlags, asDb, asFlags, MemoryRateLimiter } from './test-mocks';

class FakeSender implements EmailSender {
  readonly sent: { to: string; code: string }[] = [];
  shouldThrow = false;
  async sendOtp(to: string, code: string): Promise<void> {
    if (this.shouldThrow) throw new Error('postmark down');
    this.sent.push({ to, code });
  }
}

function envWith(
  d1: MemoryD1,
  limiters: { request?: MemoryRateLimiter; verify?: MemoryRateLimiter } = {}
): Env {
  return {
    DB: asDb(d1),
    AUTH_REQUEST_LIMITER: limiters.request ?? new MemoryRateLimiter(),
    AUTH_VERIFY_LIMITER: limiters.verify ?? new MemoryRateLimiter(),
  } as unknown as Env;
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://x${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Drive a full request→verify and return the issued session. */
async function signIn(d1: MemoryD1, env: Env, email: string) {
  const sender = new FakeSender();
  await handleAuthRequest(post('/auth/request', { email }), env, sender);
  const code = sender.sent.at(-1)!.code;
  const res = await handleAuthVerify(post('/auth/verify', { email, code }), env);
  return { res, body: (await res.json()) as { token: string; accountId: string }, code };
}

describe('handleAuthRequest', () => {
  it('emails a code and stores its hash', async () => {
    const d1 = new MemoryD1();
    const sender = new FakeSender();
    const res = await handleAuthRequest(post('/auth/request', { email: 'a@b.com' }), envWith(d1), sender);
    expect(res.status).toBe(200);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].code).toMatch(/^\d{8}$/);
    expect(d1.otp.size).toBe(1);
  });

  it('returns 429 when the per-IP request limiter denies', async () => {
    const d1 = new MemoryD1();
    const env = envWith(d1, { request: new MemoryRateLimiter({ allow: false }) });
    const sender = new FakeSender();
    const res = await handleAuthRequest(post('/auth/request', { email: 'a@b.com' }), env, sender);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(sender.sent).toHaveLength(0); // throttled before any email
    expect(d1.otp.size).toBe(0); // throttled before any DB write
  });

  it('throttles per IP — distinct IPs get independent buckets', async () => {
    const d1 = new MemoryD1();
    const env = envWith(d1, { request: new MemoryRateLimiter({ limit: 1 }) });
    const sender = new FakeSender();
    const ip1 = { 'CF-Connecting-IP': '1.1.1.1' };
    const ip2 = { 'CF-Connecting-IP': '2.2.2.2' };

    const a = await handleAuthRequest(post('/auth/request', { email: 'a@b.com' }, ip1), env, sender);
    const b = await handleAuthRequest(post('/auth/request', { email: 'c@d.com' }, ip1), env, sender);
    const c = await handleAuthRequest(post('/auth/request', { email: 'e@f.com' }, ip2), env, sender);
    expect(a.status).toBe(200); // first from ip1
    expect(b.status).toBe(429); // second from ip1 over the limit
    expect(c.status).toBe(200); // ip2 has its own bucket
  });

  it('rejects an invalid email with 400', async () => {
    const res = await handleAuthRequest(post('/auth/request', { email: 'nope' }), envWith(new MemoryD1()), new FakeSender());
    expect(res.status).toBe(400);
  });

  it('does not re-send within the cooldown window', async () => {
    const d1 = new MemoryD1();
    const env = envWith(d1);
    const sender = new FakeSender();
    await handleAuthRequest(post('/auth/request', { email: 'a@b.com' }), env, sender);
    await handleAuthRequest(post('/auth/request', { email: 'a@b.com' }), env, sender);
    expect(sender.sent).toHaveLength(1); // second call suppressed by cooldown
  });

  it('deletes the code and returns 502 if the email fails to send', async () => {
    const d1 = new MemoryD1();
    const sender = new FakeSender();
    sender.shouldThrow = true;
    const res = await handleAuthRequest(post('/auth/request', { email: 'a@b.com' }), envWith(d1), sender);
    expect(res.status).toBe(502);
    expect(d1.otp.size).toBe(0); // no stranded code blocking a retry
  });
});

describe('handleAuthVerify', () => {
  it('issues a session for the correct code and creates the account', async () => {
    const d1 = new MemoryD1();
    const env = envWith(d1);
    const { res, body } = await signIn(d1, env, 'a@b.com');
    expect(res.status).toBe(200);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(d1.accounts).toHaveLength(1);
    expect(d1.accounts[0].email).toBe('a@b.com');
    expect(d1.sessions.size).toBe(1);
    expect(d1.otp.size).toBe(0); // code consumed

    // The issued token authenticates.
    const session = await authenticate(env, new Request('https://x/sync/list', {
      headers: { Authorization: `Bearer ${body.token}` },
    }));
    expect(session).toEqual({ accountId: body.accountId, deviceId: null });
  });

  it('binds a valid device id and ignores a malformed one', async () => {
    const d1 = new MemoryD1();
    const env = envWith(d1);
    const sender = new FakeSender();
    const uuid = '11111111-2222-3333-4444-555555555555';

    await handleAuthRequest(post('/auth/request', { email: 'a@b.com' }), env, sender);
    await handleAuthVerify(
      post('/auth/verify', { email: 'a@b.com', code: sender.sent[0].code, deviceId: uuid }),
      env
    );
    expect([...d1.sessions.values()][0].device_id).toBe(uuid);

    const sender2 = new FakeSender();
    await handleAuthRequest(post('/auth/request', { email: 'c@d.com' }), env, sender2);
    await handleAuthVerify(
      post('/auth/verify', { email: 'c@d.com', code: sender2.sent[0].code, deviceId: 'not-a-uuid' }),
      env
    );
    const session = [...d1.sessions.values()].find((s) => s.account_id !== [...d1.sessions.values()][0].account_id);
    expect(session?.device_id).toBeNull();
  });

  it('reuses the same account on a second sign-in with the same email', async () => {
    const d1 = new MemoryD1();
    const env = envWith(d1);
    const first = await signIn(d1, env, 'a@b.com');
    const second = await signIn(d1, env, 'a@b.com');
    expect(second.body.accountId).toBe(first.body.accountId);
    expect(d1.accounts).toHaveLength(1);
  });

  it('rejects a wrong code with 401 and increments attempts', async () => {
    const d1 = new MemoryD1();
    const env = envWith(d1);
    const sender = new FakeSender();
    await handleAuthRequest(post('/auth/request', { email: 'a@b.com' }), env, sender);
    const real = sender.sent[0].code;
    const wrong = real.split('').map((d) => (d === '0' ? '1' : '0')).join(''); // differs at every digit

    const res = await handleAuthVerify(post('/auth/verify', { email: 'a@b.com', code: wrong }), env);
    expect(res.status).toBe(401);
    expect([...d1.otp.values()][0].attempts).toBe(1);
  });

  it('locks the code after too many attempts (429)', async () => {
    const d1 = new MemoryD1();
    const env = envWith(d1);
    const sender = new FakeSender();
    await handleAuthRequest(post('/auth/request', { email: 'a@b.com' }), env, sender);
    const real = sender.sent[0].code;
    const wrong = real.split('').map((d) => (d === '0' ? '1' : '0')).join('');

    for (let i = 0; i < 5; i++) {
      const r = await handleAuthVerify(post('/auth/verify', { email: 'a@b.com', code: wrong }), env);
      expect(r.status).toBe(401);
    }
    const locked = await handleAuthVerify(post('/auth/verify', { email: 'a@b.com', code: wrong }), env);
    expect(locked.status).toBe(429);
  });

  it('returns 429 when the per-IP verify limiter denies, before touching the DB', async () => {
    const d1 = new MemoryD1();
    const env = envWith(d1, { verify: new MemoryRateLimiter({ allow: false }) });
    const sender = new FakeSender();
    await handleAuthRequest(post('/auth/request', { email: 'a@b.com' }), env, sender);
    const res = await handleAuthVerify(
      post('/auth/verify', { email: 'a@b.com', code: sender.sent[0].code }),
      env
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(d1.otp.size).toBe(1); // code untouched — no verify attempt consumed
  });

  it('rejects an expired code with 401', async () => {
    const d1 = new MemoryD1();
    const env = envWith(d1);
    const sender = new FakeSender();
    await handleAuthRequest(post('/auth/request', { email: 'a@b.com' }), env, sender);
    const real = sender.sent[0].code;
    [...d1.otp.values()][0].expires_at = new Date(Date.now() - 1000).toISOString();

    const res = await handleAuthVerify(post('/auth/verify', { email: 'a@b.com', code: real }), env);
    expect(res.status).toBe(401);
  });
});

describe('handleAuthRevoke', () => {
  it('revokes the session so its token no longer authenticates', async () => {
    const d1 = new MemoryD1();
    const env = envWith(d1);
    const { body } = await signIn(d1, env, 'a@b.com');

    const res = await handleAuthRevoke(
      post('/auth/revoke', {}, { Authorization: `Bearer ${body.token}` }),
      env
    );
    expect(res.status).toBe(200);

    const session = await authenticate(env, new Request('https://x/sync/list', {
      headers: { Authorization: `Bearer ${body.token}` },
    }));
    expect(session).toBeNull();
  });
});

describe('per-account session cap', () => {
  it('keeps 10 sessions and never prunes the just-issued one', async () => {
    // Freeze the clock so all 11 sign-ins share an identical created_at — the
    // exact tie case where a prune without a rowid tiebreaker would delete the
    // session it just issued. Each full sign-in still consumes its code, so the
    // next request issues a fresh one (no cooldown) even under a frozen clock.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T00:00:00.000Z'));
    try {
      const d1 = new MemoryD1();
      const env = envWith(d1);
      let lastToken = '';
      for (let i = 0; i < 11; i++) lastToken = (await signIn(d1, env, 'a@b.com')).body.token;

      expect(d1.accounts).toHaveLength(1);
      expect(d1.sessions.size).toBe(10);

      // The most recently issued token must survive the prune (highest rowid).
      const session = await authenticate(
        env,
        new Request('https://x/sync/list', { headers: { Authorization: `Bearer ${lastToken}` } })
      );
      expect(session).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('attestation enforcement', () => {
  const KEY = 'attest-key';

  function attestEnv(d1: MemoryD1, enforced: boolean): Env {
    return {
      DB: asDb(d1),
      AUTH_REQUEST_LIMITER: new MemoryRateLimiter(),
      AUTH_VERIFY_LIMITER: new MemoryRateLimiter(),
      ATTEST_KEY: KEY,
      FLAGS: asFlags(new MemoryFlags({ [SERVER_FLAG_KEYS.attestEnforced]: enforced })),
    } as unknown as Env;
  }

  async function attestedRequest(email: string): Promise<Request> {
    const body = JSON.stringify({ email });
    const ts = Math.floor(Date.now() / 1000);
    const hmac = await hmacSha256(KEY, `${ts}:POST:/auth/request:${await sha256Hex(body)}`);
    return new Request('https://x/auth/request', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json', 'X-BM-Attest': `${ts}.${hmac}` },
    });
  }

  it('rejects an unattested request with 403 when enforced', async () => {
    const res = await handleAuthRequest(
      post('/auth/request', { email: 'a@b.com' }),
      attestEnv(new MemoryD1(), true),
      new FakeSender()
    );
    expect(res.status).toBe(403);
  });

  it('accepts a validly attested request when enforced', async () => {
    const sender = new FakeSender();
    const res = await handleAuthRequest(await attestedRequest('a@b.com'), attestEnv(new MemoryD1(), true), sender);
    expect(res.status).toBe(200);
    expect(sender.sent).toHaveLength(1);
  });

  it('allows an unattested request when not enforced (soft-launch)', async () => {
    const res = await handleAuthRequest(
      post('/auth/request', { email: 'a@b.com' }),
      attestEnv(new MemoryD1(), false),
      new FakeSender()
    );
    expect(res.status).toBe(200);
  });
});
