/**
 * discoveryStore — Echo Hints reveal state.
 *
 * `revealedEchoes` is per-echo (keyed by the caller), unlike `revealedRungs`
 * which is a single flat array for the Repetition Radar challenge. The one
 * behavior worth locking down: `revealEchoRung` is monotone — a `'reference'`
 * already recorded for a key must never be downgraded back to `'category'` —
 * and `resetForChapter` clears it along with everything else.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDiscoveryStore } from '@/stores/discoveryStore';

describe('discoveryStore — revealEchoRung', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ revealedEchoes: {} });
  });

  it('records the first rung revealed for a key', () => {
    useDiscoveryStore.getState().revealEchoRung('echo:1', 'category');
    expect(useDiscoveryStore.getState().revealedEchoes).toEqual({ 'echo:1': 'category' });
  });

  it('upgrades category to reference', () => {
    useDiscoveryStore.getState().revealEchoRung('echo:1', 'category');
    useDiscoveryStore.getState().revealEchoRung('echo:1', 'reference');
    expect(useDiscoveryStore.getState().revealedEchoes['echo:1']).toBe('reference');
  });

  it('never downgrades reference back to category', () => {
    useDiscoveryStore.getState().revealEchoRung('echo:1', 'category');
    useDiscoveryStore.getState().revealEchoRung('echo:1', 'reference');
    useDiscoveryStore.getState().revealEchoRung('echo:1', 'category');
    expect(useDiscoveryStore.getState().revealedEchoes['echo:1']).toBe('reference');
  });

  it('keeps separate rung state per key', () => {
    useDiscoveryStore.getState().revealEchoRung('echo:1', 'reference');
    useDiscoveryStore.getState().revealEchoRung('echo:2', 'category');
    expect(useDiscoveryStore.getState().revealedEchoes).toEqual({
      'echo:1': 'reference',
      'echo:2': 'category',
    });
  });

  it('resetForChapter clears revealedEchoes', () => {
    useDiscoveryStore.getState().revealEchoRung('echo:1', 'reference');
    useDiscoveryStore.getState().resetForChapter();
    expect(useDiscoveryStore.getState().revealedEchoes).toEqual({});
  });
});
