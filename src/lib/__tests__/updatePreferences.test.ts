import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserPreferences } from '@/types';

let row: UserPreferences;
let releaseRead: (() => void) | null;
let holdNextRead: boolean;
let failNextSave: boolean;

vi.mock('../platform', () => ({ waitForTauriInternals: vi.fn() }));
vi.mock('../sqlite-db', () => ({
  sqliteGetPreferences: vi.fn(async () => {
    const snapshot = { ...row };
    if (holdNextRead) {
      holdNextRead = false;
      await new Promise<void>(resolve => {
        releaseRead = resolve;
      });
    }
    return snapshot;
  }),
  sqliteSavePreferences: vi.fn(async (next: UserPreferences) => {
    if (failNextSave) {
      failNextSave = false;
      throw new Error('disk full');
    }
    row = next;
  }),
  recordChange: vi.fn(async () => {}),
}));

import { updatePreferences } from '../database';

beforeEach(() => {
  row = { id: 'main', fontSize: 'base', theme: 'auto' } as UserPreferences;
  releaseRead = null;
  holdNextRead = false;
  failNextSave = false;
});

describe('updatePreferences', () => {
  it('keeps both changes when two updates are made back to back', async () => {
    holdNextRead = true;
    const first = updatePreferences({ fontSize: 'lg' });
    const second = updatePreferences({ theme: 'dark' });

    await vi.waitFor(() => expect(releaseRead).not.toBeNull());
    releaseRead?.();
    await Promise.all([first, second]);

    expect(row.fontSize).toBe('lg');
    expect(row.theme).toBe('dark');
  });

  it('rejects a failed update for its caller without blocking the next one', async () => {
    failNextSave = true;
    await expect(updatePreferences({ fontSize: 'xl' })).rejects.toThrow('disk full');

    await updatePreferences({ theme: 'light' });
    expect(row.theme).toBe('light');
    expect(row.fontSize).toBe('base');
  });
});
