/**
 * discoveryStore — cross-reference reveal state.
 *
 * `revealedCrossRefs` is per-cross-reference (keyed by the caller), unlike `revealedRungs`
 * which is a single flat array for the Repetition Radar challenge. The one
 * behavior worth locking down: `revealCrossRefRung` is monotone — a `'reference'`
 * already recorded for a key must never be downgraded back to `'category'` —
 * and `resetForChapter` clears it along with everything else.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDiscoveryStore } from '@/stores/discoveryStore';

describe('discoveryStore — revealCrossRefRung', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ revealedCrossRefs: {} });
  });

  it('records the first rung revealed for a key', () => {
    useDiscoveryStore.getState().revealCrossRefRung('crossref:1', 'category');
    expect(useDiscoveryStore.getState().revealedCrossRefs).toEqual({ 'crossref:1': 'category' });
  });

  it('upgrades category to reference', () => {
    useDiscoveryStore.getState().revealCrossRefRung('crossref:1', 'category');
    useDiscoveryStore.getState().revealCrossRefRung('crossref:1', 'reference');
    expect(useDiscoveryStore.getState().revealedCrossRefs['crossref:1']).toBe('reference');
  });

  it('never downgrades reference back to category', () => {
    useDiscoveryStore.getState().revealCrossRefRung('crossref:1', 'category');
    useDiscoveryStore.getState().revealCrossRefRung('crossref:1', 'reference');
    useDiscoveryStore.getState().revealCrossRefRung('crossref:1', 'category');
    expect(useDiscoveryStore.getState().revealedCrossRefs['crossref:1']).toBe('reference');
  });

  it('keeps separate rung state per key', () => {
    useDiscoveryStore.getState().revealCrossRefRung('crossref:1', 'reference');
    useDiscoveryStore.getState().revealCrossRefRung('crossref:2', 'category');
    expect(useDiscoveryStore.getState().revealedCrossRefs).toEqual({
      'crossref:1': 'reference',
      'crossref:2': 'category',
    });
  });

  it('resetForChapter clears revealedCrossRefs', () => {
    useDiscoveryStore.getState().revealCrossRefRung('crossref:1', 'reference');
    useDiscoveryStore.getState().resetForChapter();
    expect(useDiscoveryStore.getState().revealedCrossRefs).toEqual({});
  });
});
