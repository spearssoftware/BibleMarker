/**
 * @vitest-environment jsdom
 *
 * useChapterEntityVerseIndex: the stuck-isLoading regression coverage shared
 * with the underlying cache machine lives in useChapterEntities.test.tsx —
 * this file covers only what's unique to this hook: the `enabled` kill
 * switch and the capability check that makes this hook resolve to
 * `index: null` without ever querying a provider that lacks
 * `getChapterEntityVerseIndex` (the API-backed provider's shape).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChapterEntityVerseIndex } from '../useGnosis';

const { getChapterEntityVerseIndexMock, mockProvider } = vi.hoisted(() => {
  const getChapterEntityVerseIndexMock = vi.fn();
  const mockProvider: { getChapterEntityVerseIndex?: typeof getChapterEntityVerseIndexMock } = {
    getChapterEntityVerseIndex: getChapterEntityVerseIndexMock,
  };
  return { getChapterEntityVerseIndexMock, mockProvider };
});

vi.mock('@/lib/gnosis', () => ({
  getGnosisProvider: () => mockProvider,
  isGnosisAvailable: () => true,
  getGnosisMode: () => 'local' as const,
  initGnosis: vi.fn(async () => {}),
}));

describe('useChapterEntityVerseIndex', () => {
  beforeEach(() => {
    getChapterEntityVerseIndexMock.mockReset();
    mockProvider.getChapterEntityVerseIndex = getChapterEntityVerseIndexMock;
  });

  it('never calls the provider when enabled is false', async () => {
    const { result } = renderHook(() => useChapterEntityVerseIndex('DisabledTest', 1, false));

    expect(result.current).toEqual({ index: null, isLoading: false, error: null });

    await act(async () => {
      await Promise.resolve();
    });
    expect(getChapterEntityVerseIndexMock).not.toHaveBeenCalled();
  });

  it('resolves to index: null and never queries when the provider lacks the method', async () => {
    delete mockProvider.getChapterEntityVerseIndex;

    const { result } = renderHook(() => useChapterEntityVerseIndex('NoCapability', 1));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.index).toBeNull();
    expect(result.current.error).toBeNull();
    expect(getChapterEntityVerseIndexMock).not.toHaveBeenCalled();
  });
});
