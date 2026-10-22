/**
 * @vitest-environment jsdom
 *
 * useCurrentVerseTracker publishes the verse centered in the reader's scroll
 * container to useReadingPositionStore. Uses a real DOM container with stubbed
 * layout, fake timers, and manually flushed animation frames.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCurrentVerseTracker } from '../useCurrentVerseTracker';
import { useReadingPositionStore } from '@/stores/readingPositionStore';

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let resizeCallback: (() => void) | null;

function flushFrames() {
  // Run until quiescent so nested rAFs also fire.
  for (let i = 0; i < 5 && frames.size > 0; i++) {
    const pending = Array.from(frames.entries());
    frames.clear();
    pending.forEach(([, cb]) => cb(0));
  }
}

function rect(top: number, height: number): DOMRect {
  return { top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) };
}

/** Container 200px tall at top 0; verses 1-3 are 100px rows, scrolled by `scroll`. */
function makeContainer(scroll: number) {
  const container = document.createElement('div');
  const content = document.createElement('div');
  container.appendChild(content);
  [1, 2, 3].forEach((verse) => {
    const row = document.createElement('div');
    row.className = 'grid gap-4';
    row.dataset.verse = String(verse);
    row.getBoundingClientRect = () => rect((verse - 1) * 100 - scroll, 100);
    content.appendChild(row);
  });
  const decoy = document.createElement('span');
  decoy.dataset.verse = '99';
  // Fixed at the container center (target 100), closer than any row once scrolled by 40.
  decoy.getBoundingClientRect = () => rect(95, 10);
  content.appendChild(decoy);
  container.getBoundingClientRect = () => rect(0, 200);
  Object.defineProperty(container, 'scrollTop', { value: scroll, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });
  Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
  return { container, content };
}

const baseOpts = { locationKey: 'JHN:3', ready: true, minVerse: 1, maxVerse: 3 };

beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  nextFrame = 1;
  resizeCallback = null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(nextFrame, cb);
    return nextFrame++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        resizeCallback = cb;
      }
      observe() {}
      disconnect() {}
    }
  );
  useReadingPositionStore.setState({ currentVerse: null, verseTrackingPaused: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useCurrentVerseTracker', () => {
  it('debounces scroll: no update before 150ms, update after', () => {
    const { container, content } = makeContainer(50); // centers: 0, 100, 200 -> verse 2 at target 100
    const ref = { current: container };
    renderHook(() => useCurrentVerseTracker(ref, content, baseOpts));
    act(() => { flushFrames(); });
    useReadingPositionStore.setState({ currentVerse: null });
    act(() => container.dispatchEvent(new Event('scroll')));
    act(() => { vi.advanceTimersByTime(149); flushFrames(); });
    expect(useReadingPositionStore.getState().currentVerse).toBeNull();
    act(() => { vi.advanceTimersByTime(1); flushFrames(); });
    expect(useReadingPositionStore.getState().currentVerse).toBe(2);
  });

  it('does not measure while not ready', () => {
    const { container, content } = makeContainer(50);
    const ref = { current: container };
    renderHook(() => useCurrentVerseTracker(ref, content, { ...baseOpts, ready: false }));
    act(() => { resizeCallback?.(); flushFrames(); });
    expect(useReadingPositionStore.getState().currentVerse).toBeNull();
  });

  it('does not measure while paused, and measures when unpaused', () => {
    const { container, content } = makeContainer(50);
    const ref = { current: container };
    useReadingPositionStore.setState({ verseTrackingPaused: true });
    renderHook(() => useCurrentVerseTracker(ref, content, baseOpts));
    act(() => { flushFrames(); });
    expect(useReadingPositionStore.getState().currentVerse).toBeNull();
    act(() => { useReadingPositionStore.getState().setVerseTrackingPaused(false); });
    act(() => { flushFrames(); });
    expect(useReadingPositionStore.getState().currentVerse).toBe(2);
  });

  it('counts only .grid rows, ignoring inline span[data-verse]', () => {
    // The decoy (verse 99) sits exactly at the container center; it must be ignored.
    const { container, content } = makeContainer(40); // verse 2 center 110, decoy center 100
    const ref = { current: container };
    renderHook(() => useCurrentVerseTracker(ref, content, baseOpts));
    act(() => { flushFrames(); });
    expect(useReadingPositionStore.getState().currentVerse).toBe(2);
  });

  it('measures when the container or content resizes', () => {
    const { container, content } = makeContainer(50);
    const ref = { current: container };
    renderHook(() => useCurrentVerseTracker(ref, content, baseOpts));
    act(() => { flushFrames(); });
    useReadingPositionStore.setState({ currentVerse: null });
    act(() => { resizeCallback?.(); flushFrames(); });
    expect(useReadingPositionStore.getState().currentVerse).toBe(2);
  });

  it('resets to null when the location changes', () => {
    const { container, content } = makeContainer(50);
    const ref = { current: container };
    const { rerender } = renderHook(
      ({ locationKey, ready }) =>
        useCurrentVerseTracker(ref, content, { ...baseOpts, locationKey, ready }),
      { initialProps: { locationKey: 'JHN:3', ready: true } }
    );
    act(() => { flushFrames(); });
    expect(useReadingPositionStore.getState().currentVerse).toBe(2);
    rerender({ locationKey: 'JHN:4', ready: false });
    expect(useReadingPositionStore.getState().currentVerse).toBeNull();
  });

  it('re-measures when locationKey changes while ready stays true', () => {
    const { container, content } = makeContainer(50);
    const ref = { current: container };
    const { rerender } = renderHook(
      ({ locationKey }) => useCurrentVerseTracker(ref, content, { ...baseOpts, locationKey }),
      { initialProps: { locationKey: 'JHN:3' } }
    );
    act(() => { flushFrames(); });
    expect(useReadingPositionStore.getState().currentVerse).toBe(2);
    rerender({ locationKey: 'JHN:4' });
    expect(useReadingPositionStore.getState().currentVerse).toBeNull();
    act(() => { flushFrames(); });
    expect(useReadingPositionStore.getState().currentVerse).toBe(2);
  });

  it('keeps the post-navigation measure when a plain schedule fires between its rAFs', () => {
    const { container, content } = makeContainer(50);
    const ref = { current: container };
    const { rerender } = renderHook(
      ({ locationKey }) => useCurrentVerseTracker(ref, content, { ...baseOpts, locationKey }),
      { initialProps: { locationKey: 'JHN:3' } }
    );
    act(() => { flushFrames(); });
    rerender({ locationKey: 'JHN:4' });
    // Run only the outer rAF so the nested one is pending, then let a plain schedule fire.
    act(() => {
      const [[id, cb]] = Array.from(frames.entries());
      frames.delete(id);
      cb(0);
    });
    expect(frames.size).toBe(1);
    act(() => { resizeCallback?.(); });
    act(() => { flushFrames(); });
    expect(useReadingPositionStore.getState().currentVerse).toBe(2);
  });
});
