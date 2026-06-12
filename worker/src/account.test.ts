import { describe, it, expect } from 'vitest';
import { deleteAllAccountBlobs, handleAccountDelete } from './account';
import type { Env } from './env';
import type { Session } from './auth';
import { MemoryR2, asBucket } from './test-mocks';

describe('deleteAllAccountBlobs', () => {
  it('deletes only the target account, draining all pages', async () => {
    const bucket = new MemoryR2(2); // small page size to force pagination
    for (let i = 0; i < 5; i++) await bucket.put(`sync/acct-A/dev/${i}.json`, '{}');
    await bucket.put('sync/acct-B/dev/0.json', '{}'); // other account must survive

    await deleteAllAccountBlobs(asBucket(bucket), 'acct-A');

    const remaining = [...bucket.store.keys()];
    expect(remaining).toEqual(['sync/acct-B/dev/0.json']);
  });
});

describe('handleAccountDelete', () => {
  it('wipes the account blobs and runs the D1 deletes', async () => {
    const bucket = new MemoryR2();
    await bucket.put('sync/acct-A/dev/0.json', '{}');
    await bucket.put('sync/acct-B/dev/0.json', '{}');

    const batched: string[] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async first() {
                return sql.startsWith('SELECT') ? { email: 'user@example.com' } : null;
              },
              _sql: sql,
            };
          },
        };
      },
      async batch(stmts: { _sql: string }[]) {
        batched.push(...stmts.map((s) => s._sql.split(' ').slice(0, 3).join(' ')));
        return [];
      },
    };

    const env = { SYNC_BUCKET: asBucket(bucket), DB: db } as unknown as Env;
    const session: Session = { accountId: 'acct-A', deviceId: 'dev-1' };

    const res = await handleAccountDelete(env, session);
    expect(res.status).toBe(200);

    // Account A's blob gone, account B untouched.
    expect([...bucket.store.keys()]).toEqual(['sync/acct-B/dev/0.json']);

    // sessions, devices, usage, accounts, and (email known) otp_codes all deleted.
    expect(batched).toEqual([
      'DELETE FROM sessions',
      'DELETE FROM devices',
      'DELETE FROM account_usage',
      'DELETE FROM accounts',
      'DELETE FROM otp_codes',
    ]);
  });
});
