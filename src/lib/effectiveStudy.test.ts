/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { effectiveStudyId, getEffectiveStudyId, useEffectiveStudyId } from './effectiveStudy';
import { FLAG_KEYS, DEFAULT_FLAGS } from './feature-flags';
import { useAppModeStore, type AppMode } from '@/stores/appModeStore';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { useStudyStore } from '@/stores/studyStore';

function setDiscoveryEnabled(enabled: boolean): void {
  useFeatureFlagsStore.setState({ flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: enabled } });
}

describe('effectiveStudyId', () => {
  const cases: [AppMode, string | null, string | null][] = [
    ['read', null, null],
    ['read', 'study-1', null],
    ['discover', null, null],
    ['discover', 'study-1', null],
    ['study', null, null],
    ['study', 'study-1', 'study-1'],
  ];

  it.each(cases)('mode %s with selection %s is %s', (mode, selected, expected) => {
    expect(effectiveStudyId(mode, selected)).toBe(expected);
  });
});

describe('useEffectiveStudyId and getEffectiveStudyId', () => {
  beforeEach(() => {
    setDiscoveryEnabled(true);
    useAppModeStore.setState({ mode: 'study' });
    useStudyStore.setState({ activeStudyId: 'study-1' });
  });

  it('follows a mode switch', () => {
    const { result } = renderHook(() => useEffectiveStudyId());
    expect(result.current).toBe('study-1');
    expect(getEffectiveStudyId()).toBe('study-1');

    act(() => useAppModeStore.setState({ mode: 'read' }));
    expect(result.current).toBeNull();
    expect(getEffectiveStudyId()).toBeNull();

    act(() => useAppModeStore.setState({ mode: 'study' }));
    expect(result.current).toBe('study-1');
  });

  it('follows the selected study in Study', () => {
    const { result } = renderHook(() => useEffectiveStudyId());
    act(() => useStudyStore.setState({ activeStudyId: 'study-2' }));
    expect(result.current).toBe('study-2');
    act(() => useStudyStore.setState({ activeStudyId: null }));
    expect(result.current).toBeNull();
  });

  it('yields null for a stored Discover with the kill switch off', () => {
    setDiscoveryEnabled(false);
    useAppModeStore.setState({ mode: 'discover' });
    const { result } = renderHook(() => useEffectiveStudyId());
    expect(result.current).toBeNull();
    expect(getEffectiveStudyId()).toBeNull();
  });

  it('yields null before a mode is stored', () => {
    useAppModeStore.setState({ mode: null });
    expect(getEffectiveStudyId()).toBeNull();
  });
});
