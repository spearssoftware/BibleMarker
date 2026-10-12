/**
 * @vitest-environment jsdom
 *
 * Gnosis hooks behind Worth noticing: `usePlacesSpread`, `useNameSpread`, the session-wide
 * `useHeavilyLinkedChapters`, and `useGnosisCapabilities`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BIBLE_BOOKS } from '@/types';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useGnosisCapabilities,
  useHeavilyLinkedChapters,
  useNameSpread,
  usePlacesSpread,
} from '../useGnosis';

const { getPlacesSpreadMock, getNameSpreadMock, getCrossRefCountsByChapterMock, mockProvider } = vi.hoisted(() => {
  const getPlacesSpreadMock = vi.fn();
  const getNameSpreadMock = vi.fn();
  const getCrossRefCountsByChapterMock = vi.fn();
  const mockProvider: {
    getPlacesSpread?: typeof getPlacesSpreadMock;
    getNameSpread?: typeof getNameSpreadMock;
    getCrossRefCountsByChapter?: typeof getCrossRefCountsByChapterMock;
  } = {};
  return { getPlacesSpreadMock, getNameSpreadMock, getCrossRefCountsByChapterMock, mockProvider };
});

vi.mock('@/lib/gnosis', () => ({
  getGnosisProvider: () => mockProvider,
  isGnosisAvailable: () => true,
  getGnosisMode: () => 'local' as const,
  initGnosis: vi.fn(async () => {}),
}));

describe('usePlacesSpread', () => {
  beforeEach(() => {
    getPlacesSpreadMock.mockReset();
    mockProvider.getPlacesSpread = getPlacesSpreadMock;
  });

  it('fetches the spread for the slugs and does not query with none', async () => {
    getPlacesSpreadMock.mockResolvedValue([{ slug: 'bethel', name: 'Bethel' }]);

    const { result: empty } = renderHook(() => usePlacesSpread('PlacesSpreadTest', 1, [], true));
    expect(empty.current.spread).toBeNull();
    expect(getPlacesSpreadMock).not.toHaveBeenCalled();

    const { result } = renderHook(() => usePlacesSpread('PlacesSpreadTest', 1, ['bethel'], true));
    await waitFor(() => expect(result.current.spread).toEqual([{ slug: 'bethel', name: 'Bethel' }]));
    expect(getPlacesSpreadMock).toHaveBeenCalledWith(['bethel']);
  });

  it('resolves to null when the provider lacks getPlacesSpread', async () => {
    mockProvider.getPlacesSpread = undefined;
    const { result } = renderHook(() => usePlacesSpread('PlacesSpreadMissing', 1, ['bethel'], true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.spread).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useNameSpread', () => {
  beforeEach(() => {
    getNameSpreadMock.mockReset();
    mockProvider.getNameSpread = getNameSpreadMock;
  });

  it('fetches the spread for the names and does not query with none', async () => {
    getNameSpreadMock.mockResolvedValue([{ slug: 'elam' }]);

    const { result: empty } = renderHook(() => useNameSpread('NameSpreadTest', 1, [], true));
    expect(empty.current.spread).toBeNull();
    expect(getNameSpreadMock).not.toHaveBeenCalled();

    const { result } = renderHook(() => useNameSpread('NameSpreadTest', 1, ['elam'], true));
    await waitFor(() => expect(result.current.spread).toEqual([{ slug: 'elam' }]));
    expect(getNameSpreadMock).toHaveBeenCalledWith(['elam']);
  });

  it('resolves to null when the provider lacks getNameSpread', async () => {
    mockProvider.getNameSpread = undefined;
    const { result } = renderHook(() => useNameSpread('NameSpreadMissing', 1, ['elam'], true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.spread).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

/** One reference in every chapter, so a 40-reference Ps.117 is the only chapter above the cutoff. */
const COUNTS = BIBLE_BOOKS.flatMap(b =>
  Array.from({ length: b.chapters }, (_, i) => ({ book: b.id, chapter: i + 1, count: b.id === 'Ps' && i + 1 === 117 ? 40 : 1 }))
);

describe('useHeavilyLinkedChapters', () => {
  beforeEach(() => {
    getCrossRefCountsByChapterMock.mockReset();
    mockProvider.getCrossRefCountsByChapter = getCrossRefCountsByChapterMock;
  });

  it('queries once per vote threshold per session and does nothing while disabled', async () => {
    getCrossRefCountsByChapterMock.mockResolvedValue(COUNTS);

    const { result: disabled } = renderHook(() => useHeavilyLinkedChapters(20, false));
    expect(disabled.current.chapters).toBeNull();
    expect(getCrossRefCountsByChapterMock).not.toHaveBeenCalled();

    const first = renderHook(() => useHeavilyLinkedChapters(20, true));
    await waitFor(() => expect(first.result.current.chapters).not.toBeNull());
    expect(first.result.current.chapters?.has('Ps.117')).toBe(true);
    expect(first.result.current.chapters?.has('Gen.1')).toBe(false);

    const second = renderHook(() => useHeavilyLinkedChapters(20, true));
    await waitFor(() => expect(second.result.current.chapters).not.toBeNull());
    expect(getCrossRefCountsByChapterMock).toHaveBeenCalledTimes(1);
  });

  it('reports an error and retries on the next mount after a failure', async () => {
    getCrossRefCountsByChapterMock.mockRejectedValueOnce(new Error('db down'));
    const failed = renderHook(() => useHeavilyLinkedChapters(30, true));
    await waitFor(() => expect(failed.result.current.error).toBe('db down'));

    getCrossRefCountsByChapterMock.mockResolvedValue(COUNTS);
    const retry = renderHook(() => useHeavilyLinkedChapters(30, true));
    await waitFor(() => expect(retry.result.current.chapters).not.toBeNull());
    expect(getCrossRefCountsByChapterMock).toHaveBeenCalledTimes(2);
  });
});

describe('useGnosisCapabilities', () => {
  it('reports which optional methods the provider implements', () => {
    mockProvider.getPlacesSpread = getPlacesSpreadMock;
    mockProvider.getCrossRefCountsByChapter = undefined;
    const { result } = renderHook(() => useGnosisCapabilities());
    expect(result.current).toEqual({ peopleSpread: false, placesSpread: true, nameSpread: false, crossRefCounts: false });
  });
});
