/**
 * Gnosis Module Entry Point
 *
 * Manages the active GnosisDataProvider (API or local DB).
 */

import type { GnosisDataProvider } from './provider';
import type { GnosisConfig } from '@/types';
import { isOnline } from '@/lib/offline';

export type { GnosisDataProvider } from './provider';

let activeProvider: GnosisDataProvider | null = null;
let currentConfig: GnosisConfig = { mode: 'auto' };

export function getGnosisProvider(): GnosisDataProvider {
  if (!activeProvider) {
    throw new Error('Gnosis not initialized. Call initGnosis() first.');
  }
  return activeProvider;
}

export function isGnosisAvailable(): boolean {
  return activeProvider !== null && activeProvider.isAvailable();
}

export function getGnosisMode(): 'api' | 'local' | null {
  return activeProvider?.mode ?? null;
}

export async function initGnosis(config: GnosisConfig): Promise<void> {
  currentConfig = config;

  if (config.mode === 'api' || (config.mode === 'auto' && config.apiKey && isOnline())) {
    if (config.apiKey) {
      const { GnosisApiClient } = await import('./api-client');
      const client = new GnosisApiClient();
      client.configure(config.apiKey);
      activeProvider = client;
      console.log('[Gnosis] Initialized in API mode');
      return;
    }
  }

  // Fall back to local DB
  try {
    const { GnosisLocalDb } = await import('./local-db');
    activeProvider = new GnosisLocalDb();
    console.log('[Gnosis] Initialized in local mode');
  } catch (e) {
    console.error('[Gnosis] Failed to initialize local DB:', e);
    throw e;
  }
}

export async function switchGnosisMode(mode: 'api' | 'local'): Promise<void> {
  await initGnosis({ ...currentConfig, mode });
}
