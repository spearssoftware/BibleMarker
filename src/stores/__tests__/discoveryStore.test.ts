/**
 * discoveryStore — cross-reference "read them together" progress.
 *
 * `crossRefProgress` is per-row (keyed by the caller). The behaviors worth
 * locking down: `openCrossRef` and `showAllCrossRefWords` are idempotent
 * (once true, staying true), `findCrossRefWord` is idempotent per stem (no
 * duplicate entries), and `resetForChapter` clears it along with everything
 * else.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDiscoveryStore } from '@/stores/discoveryStore';

describe('discoveryStore — cross-reference progress', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ crossRefProgress: {} });
  });

  it('openCrossRef marks a row opened, idempotently', () => {
    useDiscoveryStore.getState().openCrossRef('crossref:1');
    useDiscoveryStore.getState().openCrossRef('crossref:1');
    expect(useDiscoveryStore.getState().crossRefProgress['crossref:1']).toEqual({
      opened: true,
      found: [],
      shownAll: false,
    });
  });

  it('findCrossRefWord accumulates stems and never duplicates one', () => {
    useDiscoveryStore.getState().findCrossRefWord('crossref:1', 'beginning');
    useDiscoveryStore.getState().findCrossRefWord('crossref:1', 'god');
    useDiscoveryStore.getState().findCrossRefWord('crossref:1', 'beginning');
    expect(useDiscoveryStore.getState().crossRefProgress['crossref:1'].found).toEqual(['beginning', 'god']);
  });

  it('showAllCrossRefWords is idempotent', () => {
    useDiscoveryStore.getState().showAllCrossRefWords('crossref:1');
    useDiscoveryStore.getState().showAllCrossRefWords('crossref:1');
    expect(useDiscoveryStore.getState().crossRefProgress['crossref:1'].shownAll).toBe(true);
  });

  it('keeps separate progress per key', () => {
    useDiscoveryStore.getState().openCrossRef('crossref:1');
    useDiscoveryStore.getState().findCrossRefWord('crossref:2', 'lamb');
    expect(useDiscoveryStore.getState().crossRefProgress['crossref:1']).toEqual({
      opened: true,
      found: [],
      shownAll: false,
    });
    expect(useDiscoveryStore.getState().crossRefProgress['crossref:2']).toEqual({
      opened: false,
      found: ['lamb'],
      shownAll: false,
    });
  });

  it('resetForChapter clears crossRefProgress', () => {
    useDiscoveryStore.getState().openCrossRef('crossref:1');
    useDiscoveryStore.getState().resetForChapter();
    expect(useDiscoveryStore.getState().crossRefProgress).toEqual({});
  });
});
