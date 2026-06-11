import { describe, it, expect } from 'vitest';
import { verifyAttestation } from './attest';
import { sha256Hex } from './auth';
import { hmacSha256 } from './hmac';
import type { Env } from './env';

const KEY = 'attest-key-xyz';
const env = { ATTEST_KEY: KEY } as unknown as Env;

/** Build a request carrying a valid X-BM-Attest header for `body`. */
async function attested(
  path: string,
  method: string,
  body: string,
  opts: { key?: string; ts?: number } = {}
): Promise<Request> {
  const key = opts.key ?? KEY;
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const hmac = await hmacSha256(key, `${ts}:${method}:${path}:${await sha256Hex(body)}`);
  return new Request(`https://x${path}`, {
    method,
    body: method === 'GET' ? undefined : body,
    headers: { 'X-BM-Attest': `${ts}.${hmac}` },
  });
}

describe('verifyAttestation', () => {
  it('accepts a valid attestation bound to the body', async () => {
    const body = JSON.stringify({ email: 'a@b.com' });
    const req = await attested('/auth/request', 'POST', body);
    expect(await verifyAttestation(env, req, body)).toBe(true);
  });

  it('rejects a header signed with a different key', async () => {
    const body = '{}';
    const req = await attested('/auth/request', 'POST', body, { key: 'wrong-key' });
    expect(await verifyAttestation(env, req, body)).toBe(false);
  });

  it('rejects when the body differs from what was signed (no cross-request replay)', async () => {
    const req = await attested('/auth/request', 'POST', JSON.stringify({ email: 'a@b.com' }));
    // Replay the captured header against a different body.
    expect(await verifyAttestation(env, req, JSON.stringify({ email: 'evil@x.com' }))).toBe(false);
  });

  it('rejects a timestamp outside the skew window', async () => {
    const body = '{}';
    const req = await attested('/auth/request', 'POST', body, {
      ts: Math.floor(Date.now() / 1000) - 400,
    });
    expect(await verifyAttestation(env, req, body)).toBe(false);
  });

  it('rejects a missing or malformed header', async () => {
    const bare = new Request('https://x/auth/request', { method: 'POST', body: '{}' });
    expect(await verifyAttestation(env, bare, '{}')).toBe(false);
    const garbage = new Request('https://x/auth/request', {
      method: 'POST',
      body: '{}',
      headers: { 'X-BM-Attest': 'not-a-valid-header' },
    });
    expect(await verifyAttestation(env, garbage, '{}')).toBe(false);
  });
});
