import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import { HttpStorageBackend } from './storage-backend';

describe('HttpStorageBackend', () => {
  let backend: HttpStorageBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new HttpStorageBackend();
  });

  it('write invokes sync_write with the logical key (no root prefixing)', async () => {
    invoke.mockResolvedValue(undefined);
    await backend.write('device-1/0000000050.json', '{"a":1}');
    expect(invoke).toHaveBeenCalledWith('sync_write', {
      key: 'device-1/0000000050.json',
      content: '{"a":1}',
    });
  });

  it('readText returns the blob, or null for a 404 (passed through from Rust)', async () => {
    invoke.mockResolvedValueOnce('hello');
    await expect(backend.readText('device-1/meta.json')).resolves.toBe('hello');
    invoke.mockResolvedValueOnce(null);
    await expect(backend.readText('missing.json')).resolves.toBeNull();
  });

  it('readText propagates a thrown SyncError (does NOT swallow to null)', async () => {
    invoke.mockRejectedValue({ kind: 'auth', statusCode: 401, message: 'not signed in' });
    await expect(backend.readText('device-1/x.json')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('list invokes sync_list and returns the entries', async () => {
    invoke.mockResolvedValue([{ name: 'device-1', isDirectory: true }]);
    await expect(backend.list('')).resolves.toEqual([{ name: 'device-1', isDirectory: true }]);
    expect(invoke).toHaveBeenCalledWith('sync_list', { prefix: '' });
  });

  it('remove invokes sync_remove', async () => {
    invoke.mockResolvedValue(undefined);
    await backend.remove('device-1/0000000001.json');
    expect(invoke).toHaveBeenCalledWith('sync_remove', { key: 'device-1/0000000001.json' });
  });
});
