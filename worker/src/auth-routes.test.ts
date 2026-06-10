import { describe, it, expect } from 'vitest';
import { handleAuthRequest, handleAuthVerify, handleAuthRevoke } from './auth-routes';
import { authenticate } from './auth';
import type { Env } from './env';
import type { EmailSender } from './email';
import { MemoryD1, asDb } from './test-mocks';

class FakeSender implements EmailSender {
  readonly sent: { to: string; code: string }[] = [];
  shouldThrow = false;
  async sendOtp(to: string, code: string): Promise<void> {
    if (this.shouldThrow) throw new Error('postmark down');
    this.sent.push({ to, code });
  }
}

function envWith(d1: MemoryD1): Env {
  return { DB: asDb(d1) } as unknown as Env;
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
    expect(sender.sent[0].code).toMatch(/^\d{6}$/);
    expect(d1.otp.size).toBe(1);
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
