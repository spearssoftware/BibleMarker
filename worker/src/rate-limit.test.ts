import { describe, it, expect } from 'vitest';
import { clientIp } from './rate-limit';
import { MemoryRateLimiter } from './test-mocks';

describe('clientIp', () => {
  it('reads CF-Connecting-IP', () => {
    const req = new Request('https://x/auth/request', {
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    });
    expect(clientIp(req)).toBe('203.0.113.7');
  });

  it('falls back to a shared "unknown" bucket when the header is absent', () => {
    expect(clientIp(new Request('https://x/auth/request'))).toBe('unknown');
  });
});

describe('MemoryRateLimiter', () => {
  it('always allows by default and records keys', async () => {
    const rl = new MemoryRateLimiter();
    expect((await rl.limit({ key: 'a' })).success).toBe(true);
    expect((await rl.limit({ key: 'a' })).success).toBe(true);
    expect(rl.keys).toEqual(['a', 'a']);
  });

  it('always denies when allow: false', async () => {
    const rl = new MemoryRateLimiter({ allow: false });
    expect((await rl.limit({ key: 'a' })).success).toBe(false);
  });

  it('counts per key against a limit', async () => {
    const rl = new MemoryRateLimiter({ limit: 2 });
    expect((await rl.limit({ key: 'a' })).success).toBe(true);
    expect((await rl.limit({ key: 'a' })).success).toBe(true);
    expect((await rl.limit({ key: 'a' })).success).toBe(false); // 3rd over limit
    expect((await rl.limit({ key: 'b' })).success).toBe(true); // separate bucket
  });
});
