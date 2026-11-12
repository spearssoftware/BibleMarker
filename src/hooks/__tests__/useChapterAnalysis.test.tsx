/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useChapterAnalysis } from '../useChapterAnalysis';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { useAppModeStore } from '@/stores/appModeStore';
import { DEFAULT_DISCOVERY_THRESHOLDS } from '@/lib/chapterAnalysis';
import { makeChapterAnalysis } from '@/lib/__test__/factories';

vi.mock('@/lib/discovery-config', () => ({
  useDiscoveryEnabled: () => true,
  useDiscoveryConfig: () => DEFAULT_DISCOVERY_THRESHOLDS,
}));

const analysis = makeChapterAnalysis();
vi.mock('@/lib/chapterAnalysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chapterAnalysis')>()),
  analyzeChapter: () => analysis,
}));

describe('useChapterAnalysis', () => {
  beforeEach(() => {
    useActiveChapterStore.setState({ book: 'Gen', chapter: 1, translationId: 'sword-NASB', verses: [] });
  });
  afterEach(cleanup);

  it('returns null in Read mode', () => {
    useAppModeStore.setState({ mode: 'read' });
    const { result } = renderHook(() => useChapterAnalysis('Gen', 1, 'sword-NASB'));
    expect(result.current).toBeNull();
  });

  it.each(['discover', 'study'] as const)('analyzes the active chapter in %s mode', (mode) => {
    useAppModeStore.setState({ mode });
    const { result } = renderHook(() => useChapterAnalysis('Gen', 1, 'sword-NASB'));
    expect(result.current).toBe(analysis);
  });
});
