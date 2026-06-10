import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock('./sqlite-db', () => ({
  getSqliteDb: vi.fn().mockResolvedValue({}),
  getDeviceId: vi.fn().mockReturnValue('device-uuid-1'),
}));

import {
  requestSignInCode,
  verifySignInCode,
  getSignedInAccount,
  signOut,
  clearLocalSession,
  isSyncError,
} from './sync-account';

describe('sync-account', () => {
  beforeEach(() => invoke.mockReset());

  it('requestSignInCode invokes auth_request with the email', async () => {
    invoke.mockResolvedValue(undefined);
    await requestSignInCode('a@b.com');
    expect(invoke).toHaveBeenCalledWith('auth_request', { email: 'a@b.com' });
  });

  it('verifySignInCode passes the local device id and returns the account', async () => {
    invoke.mockResolvedValue({ accountId: 'acct-1' });
    const result = await verifySignInCode('a@b.com', '123456');
    expect(invoke).toHaveBeenCalledWith('auth_verify', {
      email: 'a@b.com',
      code: '123456',
      deviceId: 'device-uuid-1',
    });
    expect(result).toEqual({ accountId: 'acct-1' });
  });

  it('getSignedInAccount returns the account id or null', async () => {
    invoke.mockResolvedValueOnce('acct-1');
    expect(await getSignedInAccount()).toBe('acct-1');
    invoke.mockResolvedValueOnce(null);
    expect(await getSignedInAccount()).toBeNull();
  });

  it('signOut invokes auth_revoke', async () => {
    invoke.mockResolvedValue(undefined);
    await signOut();
    expect(invoke).toHaveBeenCalledWith('auth_revoke');
  });

  it('clearLocalSession invokes clear_session_token', async () => {
    invoke.mockResolvedValue(undefined);
    await clearLocalSession();
    expect(invoke).toHaveBeenCalledWith('clear_session_token');
  });
});

describe('isSyncError', () => {
  it('recognizes the structured Rust error shape', () => {
    expect(isSyncError({ kind: 'auth', statusCode: 401, message: 'x' })).toBe(true);
  });

  it('rejects plain errors and non-objects', () => {
    expect(isSyncError(new Error('boom'))).toBe(false);
    expect(isSyncError('nope')).toBe(false);
    expect(isSyncError(null)).toBe(false);
  });
});
