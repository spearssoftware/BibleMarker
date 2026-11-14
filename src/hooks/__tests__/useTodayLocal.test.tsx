/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTodayLocal } from '../useTodayLocal';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 13, 23, 59, 0));
});
afterEach(() => vi.useRealTimers());

describe('useTodayLocal', () => {
  it('returns the local date and rolls over at midnight', () => {
    const { result } = renderHook(() => useTodayLocal());
    expect(result.current).toBe('2026-11-13');

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toBe('2026-11-14');
  });

  it('refreshes when the app becomes visible again', () => {
    const { result } = renderHook(() => useTodayLocal());
    vi.setSystemTime(new Date(2026, 10, 15, 8, 0, 0));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('2026-11-15');
  });
});
