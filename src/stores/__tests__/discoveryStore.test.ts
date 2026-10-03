/**
 * discoveryStore — lens selection and cross-reference hunt progress.
 *
 * Only one reading-pane lens can be on at a time. `crossRefProgress` is
 * per-row (keyed by the caller): `setCrossRefHunting` is idempotent,
 * `findCrossRefWord` is idempotent per stem (no duplicate entries), and
 * `resetForChapter` clears it along with everything else.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDiscoveryStore } from '@/stores/discoveryStore';

describe('discoveryStore — lens', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ lens: null });
  });

  it('toggleLens turns a lens on and off', () => {
    useDiscoveryStore.getState().toggleLens('connectors');
    expect(useDiscoveryStore.getState().lens).toBe('connectors');
    useDiscoveryStore.getState().toggleLens('connectors');
    expect(useDiscoveryStore.getState().lens).toBeNull();
  });

  it('turning one lens on replaces the other', () => {
    useDiscoveryStore.getState().toggleLens('connectors');
    useDiscoveryStore.getState().toggleLens('crossRefs');
    expect(useDiscoveryStore.getState().lens).toBe('crossRefs');
  });
});

describe('discoveryStore — cross-reference progress', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ crossRefProgress: {}, activeCrossRefKey: null, lens: null });
  });

  it('setCrossRefHunting sets and clears the hunt, idempotently', () => {
    const before = useDiscoveryStore.getState().crossRefProgress;
    useDiscoveryStore.getState().setCrossRefHunting('crossref:1', false);
    expect(useDiscoveryStore.getState().crossRefProgress).toBe(before); // no-op when already off

    useDiscoveryStore.getState().setCrossRefHunting('crossref:1', true);
    useDiscoveryStore.getState().setCrossRefHunting('crossref:1', true);
    expect(useDiscoveryStore.getState().crossRefProgress['crossref:1']).toEqual({ hunting: true, found: [] });

    useDiscoveryStore.getState().setCrossRefHunting('crossref:1', false);
    expect(useDiscoveryStore.getState().crossRefProgress['crossref:1'].hunting).toBe(false);
  });

  it('findCrossRefWord accumulates stems and never duplicates one', () => {
    useDiscoveryStore.getState().findCrossRefWord('crossref:1', 'beginning');
    useDiscoveryStore.getState().findCrossRefWord('crossref:1', 'god');
    useDiscoveryStore.getState().findCrossRefWord('crossref:1', 'beginning');
    expect(useDiscoveryStore.getState().crossRefProgress['crossref:1'].found).toEqual(['beginning', 'god']);
  });

  it('keeps found stems when the hunt is switched off and on', () => {
    useDiscoveryStore.getState().setCrossRefHunting('crossref:1', true);
    useDiscoveryStore.getState().findCrossRefWord('crossref:1', 'lamb');
    useDiscoveryStore.getState().setCrossRefHunting('crossref:1', false);
    useDiscoveryStore.getState().setCrossRefHunting('crossref:1', true);
    expect(useDiscoveryStore.getState().crossRefProgress['crossref:1']).toEqual({ hunting: true, found: ['lamb'] });
  });

  it('keeps separate progress per key', () => {
    useDiscoveryStore.getState().setCrossRefHunting('crossref:1', true);
    useDiscoveryStore.getState().findCrossRefWord('crossref:2', 'lamb');
    expect(useDiscoveryStore.getState().crossRefProgress['crossref:1']).toEqual({ hunting: true, found: [] });
    expect(useDiscoveryStore.getState().crossRefProgress['crossref:2']).toEqual({ hunting: false, found: ['lamb'] });
  });

  it('resetForChapter clears progress, the active row, and the lens', () => {
    useDiscoveryStore.getState().setCrossRefHunting('crossref:1', true);
    useDiscoveryStore.getState().setActiveCrossRefKey('crossref:1');
    useDiscoveryStore.getState().setLens('crossRefs');
    useDiscoveryStore.getState().resetForChapter();
    const state = useDiscoveryStore.getState();
    expect(state.crossRefProgress).toEqual({});
    expect(state.activeCrossRefKey).toBeNull();
    expect(state.lens).toBeNull();
  });
});
