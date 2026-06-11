import { describe, it, expect } from 'vitest';
import {
  isValidKey,
  isValidPrefix,
  scopeKey,
  scopePrefix,
  shapeListing,
  listAll,
  handleSync,
  MAX_BLOB_BYTES,
} from './sync';
import type { Session } from './auth';
import type { Env } from './env';
import { MemoryD1, MemoryR2, MemoryRateLimiter, asBucket, asDb } from './test-mocks';

const SESSION: Session = { accountId: 'acct-A', deviceId: 'dev-1' };

function envWith(bucket: MemoryR2, d1: MemoryD1 = new MemoryD1()): Env {
  return {
    SYNC_BUCKET: asBucket(bucket),
    DB: asDb(d1),
    SYNC_LIMITER: new MemoryRateLimiter(),
  } as unknown as Env;
}

describe('key validation', () => {
  it('accepts well-formed logical keys', () => {
    expect(isValidKey('device-uuid/0000000050.json')).toBe(true);
    expect(isValidKey('snapshots/dev_50.json')).toBe(true);
    expect(isValidKey('dev/meta.json')).toBe(true);
  });

  it('rejects traversal, empty, and slash-edge keys', () => {
    expect(isValidKey('')).toBe(false);
    expect(isValidKey('../etc/passwd')).toBe(false);
    expect(isValidKey('a/../b')).toBe(false);
    expect(isValidKey('/leading')).toBe(false);
    expect(isValidKey('trailing/')).toBe(false);
    expect(isValidKey('a//b')).toBe(false);
    expect(isValidKey('a/.hidden')).toBe(false); // segment must start alnum
  });

  it('treats empty prefix as the valid account root', () => {
    expect(isValidPrefix('')).toBe(true);
    expect(isValidPrefix('device-uuid')).toBe(true);
    expect(isValidPrefix('bad/')).toBe(false);
  });
});

describe('account scoping (isolation boundary)', () => {
  it('scopes blob keys under the account', () => {
    expect(scopeKey('acct-A', 'dev/1.json')).toBe('sync/acct-A/dev/1.json');
  });

  it('produces different real keys for different accounts (no cross-read)', () => {
    expect(scopeKey('acct-A', 'dev/1.json')).not.toBe(scopeKey('acct-B', 'dev/1.json'));
  });

  it('scopes list prefixes with a trailing slash; root has none beyond the account', () => {
    expect(scopePrefix('acct-A', 'device-uuid')).toBe('sync/acct-A/device-uuid/');
    expect(scopePrefix('acct-A', '')).toBe('sync/acct-A/');
  });
});

describe('shapeListing', () => {
  const serverPrefix = 'sync/acct-A/device-uuid/';

  it('returns bare leaf names for objects (not full keys)', () => {
    const entries = shapeListing(
      serverPrefix,
      [`${serverPrefix}0000000001.json`, `${serverPrefix}meta.json`],
      []
    );
    expect(entries).toEqual([
      { name: '0000000001.json', isDirectory: false },
      { name: 'meta.json', isDirectory: false },
    ]);
  });

  it('strips the trailing slash from delimited prefixes and marks them directories', () => {
    const rootPrefix = 'sync/acct-A/';
    const entries = shapeListing(
      rootPrefix,
      [],
      [`${rootPrefix}device-uuid/`, `${rootPrefix}snapshots/`]
    );
    expect(entries).toEqual([
      { name: 'device-uuid', isDirectory: true },
      { name: 'snapshots', isDirectory: true },
    ]);
  });

  it('skips nested objects and keys outside the prefix', () => {
    const entries = shapeListing(
      serverPrefix,
      [`${serverPrefix}sub/deep.json`, 'sync/acct-B/device-uuid/x.json'],
      []
    );
    expect(entries).toEqual([]);
  });
});

describe('listAll pagination', () => {
  it('drains every page before returning', async () => {
    const bucket = new MemoryR2(2); // page size 2 forces truncation
    for (let i = 0; i < 5; i++) {
      await bucket.put(`sync/acct-A/device/${i}.json`, '{}');
    }
    const { objects } = await listAll(asBucket(bucket), 'sync/acct-A/device/');
    expect(objects).toHaveLength(5);
  });

  it('accumulates delimited prefixes that appear on later pages', async () => {
    // 3 pseudo-directories with page size 2 → prefixes span two pages. A loop
    // that only read page 0's prefixes would miss d3 and never sync that device.
    const bucket = new MemoryR2(2);
    await bucket.put('sync/acct-A/d1/a.json', '{}');
    await bucket.put('sync/acct-A/d2/a.json', '{}');
    await bucket.put('sync/acct-A/d3/a.json', '{}');
    const { delimitedPrefixes } = await listAll(asBucket(bucket), 'sync/acct-A/');
    expect(delimitedPrefixes.sort()).toEqual([
      'sync/acct-A/d1/',
      'sync/acct-A/d2/',
      'sync/acct-A/d3/',
    ]);
  });
});

describe('handleSync — list end to end', () => {
  it('lists only the requesting account, with leaf-name shaping', async () => {
    const bucket = new MemoryR2();
    await bucket.put('sync/acct-A/dev/0000000001.json', '{}');
    await bucket.put('sync/acct-A/dev/0000000002.json', '{}');
    await bucket.put('sync/acct-B/dev/0000000099.json', '{}'); // other account

    const url = new URL('https://x/sync/list?prefix=dev');
    const res = await handleSync(
      new Request(url),
      envWith(bucket),
      SESSION,
      url
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: { name: string }[] };
    expect(body.entries.map((e) => e.name).sort()).toEqual([
      '0000000001.json',
      '0000000002.json',
    ]);
  });

  it('lists the account root as device/snapshot directories', async () => {
    const bucket = new MemoryR2();
    await bucket.put('sync/acct-A/device-uuid/0000000001.json', '{}');
    await bucket.put('sync/acct-A/snapshots/device-uuid_1.json', '{}');

    const url = new URL('https://x/sync/list');
    const res = await handleSync(new Request(url), envWith(bucket), SESSION, url);
    const body = (await res.json()) as { entries: { name: string; isDirectory: boolean }[] };
    expect(body.entries).toEqual([
      { name: 'device-uuid', isDirectory: true },
      { name: 'snapshots', isDirectory: true },
    ]);
  });
});

describe('handleSync — blob', () => {
  it('round-trips a PUT then GET', async () => {
    const bucket = new MemoryR2();
    const env = envWith(bucket);

    const putUrl = new URL('https://x/sync/blob/dev/0000000001.json');
    const putRes = await handleSync(
      new Request(putUrl, { method: 'PUT', body: '{"a":1}' }),
      env,
      SESSION,
      putUrl
    );
    expect(putRes.status).toBe(204);
    expect(bucket.store.get('sync/acct-A/dev/0000000001.json')).toBe('{"a":1}');

    const getUrl = new URL('https://x/sync/blob/dev/0000000001.json');
    const getRes = await handleSync(new Request(getUrl), env, SESSION, getUrl);
    expect(getRes.status).toBe(200);
    expect(await getRes.text()).toBe('{"a":1}');
  });

  it('returns 404 for an absent blob (client maps to null)', async () => {
    const url = new URL('https://x/sync/blob/dev/missing.json');
    const res = await handleSync(new Request(url), envWith(new MemoryR2()), SESSION, url);
    expect(res.status).toBe(404);
  });

  it('DELETE is idempotent (204 even when absent)', async () => {
    const url = new URL('https://x/sync/blob/dev/missing.json');
    const res = await handleSync(
      new Request(url, { method: 'DELETE' }),
      envWith(new MemoryR2()),
      SESSION,
      url
    );
    expect(res.status).toBe(204);
  });

  it('rejects an invalid key with 400', async () => {
    const url = new URL('https://x/sync/blob/..%2Fescape');
    const res = await handleSync(new Request(url), envWith(new MemoryR2()), SESSION, url);
    expect(res.status).toBe(400);
  });

  it('rejects a malformed percent-encoded key with 400 (not 500)', async () => {
    const url = new URL('https://x/sync/blob/foo%GGbar');
    const res = await handleSync(new Request(url), envWith(new MemoryR2()), SESSION, url);
    expect(res.status).toBe(400);
  });

  it('rejects an over-size PUT with 413', async () => {
    const url = new URL('https://x/sync/blob/dev/big.json');
    const res = await handleSync(
      new Request(url, {
        method: 'PUT',
        body: 'x',
        headers: { 'Content-Length': String(MAX_BLOB_BYTES + 1) },
      }),
      envWith(new MemoryR2()),
      SESSION,
      url
    );
    expect(res.status).toBe(413);
  });
});
