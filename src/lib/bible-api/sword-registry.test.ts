import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(async () => '/data'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async () => true),
  readFile: vi.fn(async () => new Uint8Array()),
  remove: vi.fn(async () => undefined),
}));
vi.mock('@/lib/database', () => ({}));

import { invoke } from '@tauri-apps/api/core';
import { getAvailableModules, isModuleBundled, loadBundledModule, swordClient } from './sword';
import { getAllTranslations } from './index';

describe('bundled MHCC commentary stays out of translation lists', () => {
  it('is not an available or bundled translation module', () => {
    expect(getAvailableModules().map((m) => m.id)).not.toContain('sword-MHCC');
    expect(isModuleBundled('sword-MHCC')).toBe(false);
  });

  it('is excluded from installed translations even when its zip is on disk', async () => {
    const swordIds = (await swordClient.getTranslations()).map((t) => t.id);
    expect(swordIds).toContain('sword-ASV');
    expect(swordIds).not.toContain('sword-MHCC');
    expect((await getAllTranslations()).map((t) => t.id)).not.toContain('sword-MHCC');
  });
});

describe('loadBundledModule', () => {
  it('installs MHCC from its bundled resource', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The mocked readFile returns an empty file, so the load itself fails after installing.
    await expect(loadBundledModule('sword-MHCC')).rejects.toThrow();
    expect(invoke).toHaveBeenCalledWith('install_bundled_module', {
      resourceName: 'sword-MHCC.zip',
      destPath: expect.stringContaining('sword-MHCC.zip'),
    });
  });
});
