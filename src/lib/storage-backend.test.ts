import { describe, it, expect, vi, beforeEach } from 'vitest';

const readDir = vi.fn();
const readTextFile = vi.fn();
const remove = vi.fn();
const invoke = vi.fn();

vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: (...args: unknown[]) => readDir(...args),
  readTextFile: (...args: unknown[]) => readTextFile(...args),
  remove: (...args: unknown[]) => remove(...args),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import { FolderStorageBackend, HttpStorageBackend } from './storage-backend';

const ROOT = '/sync/root';

describe('FolderStorageBackend', () => {
  let backend: FolderStorageBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new FolderStorageBackend(ROOT);
  });

  describe('write', () => {
    it('writes via write_sync_file with the key joined onto the root', async () => {
      invoke.mockResolvedValue(undefined);
      await backend.write('device-1/0000000050.json', '{"a":1}');
      expect(invoke).toHaveBeenCalledWith('write_sync_file', {
        path: '/sync/root/device-1/0000000050.json',
        content: '{"a":1}',
      });
    });

    it('propagates write errors (writes must not be silently swallowed)', async () => {
      invoke.mockRejectedValue(new Error('disk full'));
      await expect(backend.write('a.json', 'x')).rejects.toThrow('disk full');
    });
  });

  describe('readText', () => {
    it('returns file content on success', async () => {
      readTextFile.mockResolvedValue('hello');
      await expect(backend.readText('device-1/meta.json')).resolves.toBe('hello');
      expect(readTextFile).toHaveBeenCalledWith('/sync/root/device-1/meta.json');
    });

    it('returns null when the file does not exist (replaces exists+read)', async () => {
      readTextFile.mockRejectedValue(new Error('ENOENT'));
      await expect(backend.readText('missing.json')).resolves.toBeNull();
    });
  });

  describe('list', () => {
    it('maps entries to { name, isDirectory }', async () => {
      readDir.mockResolvedValue([
        { name: '0000000001.json', isDirectory: false },
        { name: 'snapshots', isDirectory: true },
      ]);
      const entries = await backend.list('device-1');
      expect(readDir).toHaveBeenCalledWith('/sync/root/device-1');
      expect(entries).toEqual([
        { name: '0000000001.json', isDirectory: false },
        { name: 'snapshots', isDirectory: true },
      ]);
    });

    it('lists the root when prefix is empty (no trailing slash)', async () => {
      readDir.mockResolvedValue([]);
      await backend.list('');
      expect(readDir).toHaveBeenCalledWith('/sync/root');
    });

    it('returns [] when the directory does not exist (replaces exists guard)', async () => {
      readDir.mockRejectedValue(new Error('ENOENT'));
      await expect(backend.list('nope')).resolves.toEqual([]);
    });

    it('coerces a missing entry name to an empty string', async () => {
      readDir.mockResolvedValue([{ name: undefined, isDirectory: false }]);
      const entries = await backend.list('x');
      expect(entries).toEqual([{ name: '', isDirectory: false }]);
    });
  });

  describe('remove', () => {
    it('removes the resolved key', async () => {
      remove.mockResolvedValue(undefined);
      await backend.remove('device-1/0000000001.json');
      expect(remove).toHaveBeenCalledWith('/sync/root/device-1/0000000001.json');
    });

    it('is idempotent — swallows errors when the key is already gone', async () => {
      remove.mockRejectedValue(new Error('ENOENT'));
      await expect(backend.remove('gone.json')).resolves.toBeUndefined();
    });
  });
});

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
