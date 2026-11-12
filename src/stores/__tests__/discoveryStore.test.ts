/**
 * discoveryStore — lens selection, chapter reset and cross-reference taps.
 *
 * Only one reading-pane lens can be on at a time, and `resetForChapter`
 * clears every piece of UI state except the published context.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { presetMarksToken, useDiscoveryStore } from '@/stores/discoveryStore';
import { makeCrossRefPassageRow, makeDiscoveryContext, makeMarkingPreset } from '@/lib/__test__/factories';

const trackMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track: trackMock }));

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

  it('resetForChapter clears the lens and the active row, but not the context', () => {
    useDiscoveryStore.setState({ context: makeDiscoveryContext() });
    useDiscoveryStore.getState().setActiveCrossRefKey('crossref:1');
    useDiscoveryStore.getState().setLens('crossRefs');
    useDiscoveryStore.getState().resetForChapter();
    const state = useDiscoveryStore.getState();
    expect(state.activeCrossRefKey).toBeNull();
    expect(state.lens).toBeNull();
    expect(state.context).toEqual(makeDiscoveryContext());
  });
});

describe('discoveryStore — activateCrossRef telemetry', () => {
  beforeEach(() => {
    trackMock.mockClear();
    useDiscoveryStore.setState({
      context: makeDiscoveryContext(),
      activeCrossRefKey: null,
      laterCrossRefPassages: { rows: [makeCrossRefPassageRow({ key: 'later-key' })], expand: () => {} },
    });
  });

  it('records a later row under crossref_later', () => {
    useDiscoveryStore.getState().activateCrossRef('later-key');
    expect(useDiscoveryStore.getState().activeCrossRefKey).toBe('later-key');
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith('discovery_chip_tapped', {
      feature: 'crossref_later',
      dedupeKey: 'discovery_chip_tapped:crossref_later:John:1:sword-NASB',
    });
  });

  it('records any other row under crossref', () => {
    useDiscoveryStore.getState().activateCrossRef('older-key');
    expect(trackMock).toHaveBeenCalledWith('discovery_chip_tapped', { feature: 'crossref', dedupeKey: 'crossref-tap:older-key' });
  });

  it('never records a later row as crossref, even without a chapter context', () => {
    useDiscoveryStore.setState({ context: null });
    useDiscoveryStore.getState().activateCrossRef('later-key');
    expect(useDiscoveryStore.getState().activeCrossRefKey).toBe('later-key');
    expect(trackMock).not.toHaveBeenCalled();
  });
});

describe('presetMarksToken', () => {
  const inJohn1 = (preset: ReturnType<typeof makeMarkingPreset>) => presetMarksToken(preset, 'word', 'John', 1, 'sword-NASB');

  it('matches a preset whose word singularizes to the token, within scope', () => {
    expect(inJohn1(makeMarkingPreset({ word: 'Words', scopes: [{ book: 'John', chapter: 1 }] }))).toBe(true);
    expect(inJohn1(makeMarkingPreset({ word: 'Word', scopes: [{ book: 'John' }] }))).toBe(true);
  });

  it('matches through a variant that applies to the chapter', () => {
    expect(inJohn1(makeMarkingPreset({ word: 'logos', variants: [{ text: 'word' }] }))).toBe(true);
    expect(inJohn1(makeMarkingPreset({ word: 'logos', variants: [{ text: 'word', bookScope: 'John', chapterScope: 2 }] }))).toBe(false);
  });

  it('rejects a preset scoped to another chapter or pinned to another translation', () => {
    expect(inJohn1(makeMarkingPreset({ word: 'word', scopes: [{ book: 'John', chapter: 2 }] }))).toBe(false);
    expect(inJohn1(makeMarkingPreset({ word: 'word', moduleScope: 'sword-KJV' }))).toBe(false);
    expect(inJohn1(makeMarkingPreset({ word: 'word', moduleScope: 'sword-NASB' }))).toBe(true);
  });
});
