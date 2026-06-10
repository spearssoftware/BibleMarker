import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./sqlite-db', () => ({
  getSyncConfig: vi.fn(),
  setSyncConfig: vi.fn().mockResolvedValue(undefined),
  getDeviceId: vi.fn().mockReturnValue('device-xyz'),
}));

vi.mock('./platform', () => ({
  isIOS: () => false,
  isAndroid: () => false,
  isMacOS: () => true,
  isTauri: () => true,
}));

import {
  FLAG_KEYS,
  DEFAULT_FLAGS,
  readCachedFlags,
  isFlagEnabled,
  fetchRemoteFlags,
} from './feature-flags';
import { getSyncConfig, setSyncConfig, getDeviceId } from './sqlite-db';

const mockGetSyncConfig = vi.mocked(getSyncConfig);
const mockSetSyncConfig = vi.mocked(setSyncConfig);
const mockGetDeviceId = vi.mocked(getDeviceId);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('__APP_VERSION__', '9.9.9');
  mockGetDeviceId.mockReturnValue('device-xyz');
});

function cached(flags: Record<string, unknown>): string {
  return JSON.stringify({ flags, evaluatedAt: 'x', cachedAt: 'y' });
}

describe('readCachedFlags', () => {
  it('returns normalized flags from the cache', async () => {
    mockGetSyncConfig.mockResolvedValue(cached({ [FLAG_KEYS.syncEnabled]: false }));
    const flags = await readCachedFlags();
    expect(flags).not.toBeNull();
    expect(flags![FLAG_KEYS.syncEnabled]).toBe(false);
    expect(flags![FLAG_KEYS.otpEnabled]).toBe(true); // default fills the gap
  });

  it('returns null when no cache exists', async () => {
    mockGetSyncConfig.mockResolvedValue(null);
    expect(await readCachedFlags()).toBeNull();
  });

  it('returns null on corrupt JSON', async () => {
    mockGetSyncConfig.mockResolvedValue('{not json');
    expect(await readCachedFlags()).toBeNull();
  });

  it('ignores unknown keys and non-boolean values', async () => {
    mockGetSyncConfig.mockResolvedValue(cached({ bogus: true, [FLAG_KEYS.httpBackend]: 'yes' }));
    const flags = await readCachedFlags();
    expect(flags!['bogus']).toBeUndefined();
    expect(flags![FLAG_KEYS.httpBackend]).toBe(false); // non-boolean → default
  });
});

describe('isFlagEnabled', () => {
  it('reflects the cached value', async () => {
    mockGetSyncConfig.mockResolvedValue(cached({ [FLAG_KEYS.syncEnabled]: false }));
    expect(await isFlagEnabled(FLAG_KEYS.syncEnabled)).toBe(false);
  });

  it('falls back to the default with no cache', async () => {
    mockGetSyncConfig.mockResolvedValue(null);
    expect(await isFlagEnabled(FLAG_KEYS.syncEnabled)).toBe(DEFAULT_FLAGS[FLAG_KEYS.syncEnabled]);
  });

  it('uses the default for a key absent from an existing cache', async () => {
    // Cache present but only sets syncEnabled — httpBackend should be its default.
    mockGetSyncConfig.mockResolvedValue(cached({ [FLAG_KEYS.syncEnabled]: false }));
    expect(await isFlagEnabled(FLAG_KEYS.httpBackend)).toBe(DEFAULT_FLAGS[FLAG_KEYS.httpBackend]);
  });
});

describe('fetchRemoteFlags', () => {
  it('returns flags and persists the snapshot on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flags: { [FLAG_KEYS.syncEnabled]: false }, evaluatedAt: '2026-01-01T00:00:00Z' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const flags = await fetchRemoteFlags();
    expect(flags![FLAG_KEYS.syncEnabled]).toBe(false);
    expect(mockSetSyncConfig).toHaveBeenCalledOnce();

    // Sends the context headers the worker targets on.
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-Client-Version']).toBe('9.9.9');
    expect(headers['X-Client-Platform']).toBe('macos');
    expect(headers['X-Device-Id']).toBe('device-xyz');
  });

  it('returns null and does not cache on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await fetchRemoteFlags()).toBeNull();
    expect(mockSetSyncConfig).not.toHaveBeenCalled();
  });

  it('returns null and does not cache on a 200 without a flags object', async () => {
    // A proxy/captive-portal 200 with a non-flags body must not clobber the cache.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    expect(await fetchRemoteFlags()).toBeNull();
    expect(mockSetSyncConfig).not.toHaveBeenCalled();
  });

  it('returns null on a network error (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchRemoteFlags()).resolves.toBeNull();
  });

  it('returns null when the request times out (abort)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
    );
    const promise = fetchRemoteFlags();
    await vi.advanceTimersByTimeAsync(6000);
    await expect(promise).resolves.toBeNull();
    expect(mockSetSyncConfig).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('fetches anonymously when the device id is unavailable', async () => {
    mockGetDeviceId.mockImplementation(() => {
      throw new Error('DB not ready');
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flags: {} }) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchRemoteFlags();
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-Device-Id']).toBeUndefined();
    expect(headers['X-Client-Version']).toBe('9.9.9');
  });
});
