/**
 * @vitest-environment jsdom
 *
 * useRestoreReadingPosition saves the verse being read and scrolls back to the
 * saved one once per launch. jsdom has no layout, so rows, the container and
 * scrollTop are stubbed; jsdom neither clamps scrollTop nor fires scroll, so
 * the tests assert the value written.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { restoreScrollTop, useRestoreReadingPosition } from '../useRestoreReadingPosition';
import { useBibleStore } from '@/stores/bibleStore';
import { useReadingPositionStore } from '@/stores/readingPositionStore';
import { useSavedPositionStore } from '@/stores/savedPositionStore';

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let resizeCallback: (() => void) | null;
let shift: number;

function flushFrames() {
  const pending = Array.from(frames.entries());
  frames.clear();
  pending.forEach(([, cb]) => cb(0));
}

function rect(top: number, height: number): DOMRect {
  return { top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) };
}

/**
 * Container 200px tall at top 0 with 100px rows for verses 1-30. `shift`
 * moves every row down, as late headings or notes would.
 */
function makeContainer(initialScroll = 0) {
  const container = document.createElement('div');
  const content = document.createElement('div');
  container.appendChild(content);
  let scrollTop = initialScroll;
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
    configurable: true,
  });
  Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });
  container.getBoundingClientRect = () => rect(0, 200);
  for (let verse = 1; verse <= 30; verse++) {
    const row = document.createElement('div');
    row.className = 'grid gap-4';
    row.dataset.verse = String(verse);
    row.getBoundingClientRect = () => rect((verse - 1) * 100 + shift - scrollTop, 100);
    content.appendChild(row);
  }
  return { container, content };
}

const position = (verse: number, chapter = 3) => ({ book: 'John', chapter, verse });

function setPending(verse: number, chapter = 3) {
  useSavedPositionStore.setState({ saved: position(verse, chapter), pendingRestore: position(verse, chapter) });
}

const readyOpts = { ready: true, minVerse: 1, maxVerse: 30, book: 'John', chapter: 3 };

function renderRestore(container: HTMLElement, content: HTMLElement | null, opts = readyOpts) {
  return renderHook(
    (props: { content: HTMLElement | null; opts: typeof readyOpts }) =>
      useRestoreReadingPosition({ current: container }, props.content, props.opts),
    { initialProps: { content, opts } }
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  nextFrame = 1;
  resizeCallback = null;
  shift = 0;
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
      disconnect() {
        resizeCallback = null;
      }
    }
  );
  localStorage.clear();
  useReadingPositionStore.setState({ currentVerse: null, verseTrackingPaused: false });
  useSavedPositionStore.setState({ saved: null, pendingRestore: null });
  useBibleStore.setState({ currentBook: 'John', currentChapter: 3, navSelectedVerse: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('restoreScrollTop', () => {
  it('centres a short row in the container', () => {
    expect(restoreScrollTop(rect(0, 200), rect(1500, 100), 0, 200)).toBe(1450);
  });

  it('accounts for the current scroll and the container offset', () => {
    // Row sits 300px into the visible container, which starts 50px down the page.
    expect(restoreScrollTop(rect(50, 200), rect(350, 100), 400, 200)).toBe(650);
  });

  it('aligns the top of a row taller than the container', () => {
    expect(restoreScrollTop(rect(0, 200), rect(1500, 400), 0, 200)).toBe(1500);
  });

  it('centres a short row in the area below the top inset', () => {
    // 200px container, 60px covered: the visible 140px centres a 40px row at 60 + 50.
    expect(restoreScrollTop(rect(0, 200), rect(1500, 40), 0, 200, 60)).toBe(1500 - 60 - 50);
  });

  it('aligns a row taller than the visible area to the inset', () => {
    expect(restoreScrollTop(rect(0, 200), rect(1500, 150), 0, 200, 60)).toBe(1440);
  });

  it('never returns a negative scrollTop', () => {
    expect(restoreScrollTop(rect(0, 200), rect(10, 150), 0, 200, 60)).toBe(0);
  });
});

describe('useRestoreReadingPosition', () => {
  it('scrolls to the saved verse while keeping saving gated', () => {
    setPending(16);
    const { container, content } = makeContainer();
    renderRestore(container, content);

    flushFrames();
    expect(container.scrollTop).toBe(1450);

    useReadingPositionStore.getState().setCurrentVerse(1);
    expect(useSavedPositionStore.getState().saved).toEqual(position(16));
  });

  it('restores when the content element mounts after the hook', () => {
    setPending(16);
    const { container, content } = makeContainer();
    const { rerender } = renderRestore(container, null);

    flushFrames();
    expect(container.scrollTop).toBe(0);
    expect(useSavedPositionStore.getState().pendingRestore).not.toBeNull();

    rerender({ content, opts: readyOpts });
    flushFrames();
    expect(container.scrollTop).toBe(1450);
  });

  it('waits until the chapter is ready', () => {
    setPending(16);
    const { container, content } = makeContainer();
    const { rerender } = renderRestore(container, content, { ...readyOpts, ready: false });

    flushFrames();
    expect(container.scrollTop).toBe(0);
    expect(useSavedPositionStore.getState().pendingRestore).not.toBeNull();

    rerender({ content, opts: readyOpts });
    flushFrames();
    expect(container.scrollTop).toBe(1450);
  });

  it('forgets a verse beyond the end of the chapter', () => {
    setPending(40);
    const { container, content } = makeContainer();
    renderRestore(container, content);

    flushFrames();
    expect(container.scrollTop).toBe(0);
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();
    expect(useSavedPositionStore.getState().saved).toBeNull();
  });

  it('skips, but keeps, an in-range verse whose row is not in the page', () => {
    setPending(40);
    const { container, content } = makeContainer();
    renderRestore(container, content, { ...readyOpts, maxVerse: 50 });

    flushFrames();
    expect(container.scrollTop).toBe(0);
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();
    expect(useSavedPositionStore.getState().saved).toEqual(position(40));
  });

  it('keeps anchoring while the content element is momentarily missing', () => {
    setPending(16);
    const { container, content } = makeContainer();
    const { rerender } = renderRestore(container, content);
    flushFrames();

    rerender({ content: null, opts: readyOpts });
    expect(useSavedPositionStore.getState().pendingRestore).not.toBeNull();

    shift = 50;
    rerender({ content, opts: readyOpts });
    flushFrames();
    expect(container.scrollTop).toBe(1500);
  });

  it('settles without scrolling when the saved verse is in another chapter', () => {
    setPending(16, 4);
    const { container, content } = makeContainer();
    renderRestore(container, content);

    flushFrames();
    expect(container.scrollTop).toBe(0);
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();
    expect(useSavedPositionStore.getState().saved).toEqual(position(16, 4));
  });

  it('skips the restore when something has already scrolled the chapter', () => {
    setPending(16);
    const { container, content } = makeContainer();
    renderRestore(container, content);
    container.scrollTop = 800;

    flushFrames();
    expect(container.scrollTop).toBe(800);
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();
  });

  it('skips the restore when a named-verse jump is under way', () => {
    setPending(16);
    useBibleStore.setState({ navSelectedVerse: 5 });
    const { container, content } = makeContainer();
    renderRestore(container, content);

    flushFrames();
    expect(container.scrollTop).toBe(0);
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();
  });

  it('re-places the verse when content resizes, until the reader takes over', () => {
    setPending(16);
    const { container, content } = makeContainer();
    renderRestore(container, content);
    flushFrames();
    expect(container.scrollTop).toBe(1450);

    shift = 50;
    resizeCallback?.();
    expect(container.scrollTop).toBe(1500);

    container.dispatchEvent(new Event('wheel'));
    shift = 100;
    resizeCallback?.();
    expect(container.scrollTop).toBe(1500);
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();
  });

  it('keeps anchoring when the effect re-runs mid-window', () => {
    setPending(16);
    const { container, content } = makeContainer();
    const { rerender } = renderRestore(container, content);
    flushFrames();
    expect(container.scrollTop).toBe(1450);

    // A second translation finishing changes the verse range and re-runs the effect.
    vi.advanceTimersByTime(500);
    shift = 50;
    rerender({ content, opts: { ...readyOpts, maxVerse: 31 } });
    flushFrames();
    expect(container.scrollTop).toBe(1500);
    expect(useSavedPositionStore.getState().pendingRestore).not.toBeNull();

    // The window is not restarted by the re-run.
    vi.advanceTimersByTime(1500);
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();
    expect(useSavedPositionStore.getState().saved).toEqual(position(16));
  });

  it('lets a named-verse jump during anchoring win, and saves where the reader ended up', () => {
    setPending(16);
    const { container, content } = makeContainer();
    renderRestore(container, content);
    flushFrames();
    expect(container.scrollTop).toBe(1450);

    useBibleStore.setState({ navSelectedVerse: 28 });
    container.scrollTop = 2650;
    useReadingPositionStore.getState().setCurrentVerse(28);
    shift = 8;
    resizeCallback?.();
    expect(container.scrollTop).toBe(2650);
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();

    vi.advanceTimersByTime(2000);
    expect(useSavedPositionStore.getState().saved).toEqual(position(28));
  });

  it('ends anchoring instead of resuming when the chapter goes back to loading', () => {
    setPending(16);
    const { container, content } = makeContainer();
    const { rerender } = renderRestore(container, content);
    flushFrames();
    useReadingPositionStore.getState().setCurrentVerse(16);

    rerender({ content, opts: { ...readyOpts, ready: false } });
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();

    container.scrollTop = 300;
    rerender({ content, opts: readyOpts });
    flushFrames();
    expect(container.scrollTop).toBe(300);
  });

  it('saves the restored verse when the anchoring window ends, then follows the reader', () => {
    setPending(16);
    const { container, content } = makeContainer();
    renderRestore(container, content);
    flushFrames();
    expect(useSavedPositionStore.getState().pendingRestore).not.toBeNull();

    vi.advanceTimersByTime(2000);
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();
    expect(useSavedPositionStore.getState().saved).toEqual(position(16));

    useReadingPositionStore.getState().setCurrentVerse(18);
    expect(useSavedPositionStore.getState().saved).toEqual(position(18));
  });

  it('does not save a verse reported while the restore is pending', () => {
    setPending(16);
    const { container, content } = makeContainer();
    renderRestore(container, content);

    useReadingPositionStore.getState().setCurrentVerse(1);
    expect(useSavedPositionStore.getState().saved).toEqual(position(16));
  });

  it('writes nothing when unmounted before the frame runs', () => {
    setPending(16);
    const { container, content } = makeContainer();
    const { unmount } = renderRestore(container, content);

    unmount();
    flushFrames();
    expect(container.scrollTop).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('clears its timer and observer on unmount during anchoring', () => {
    setPending(16);
    const { container, content } = makeContainer();
    const { unmount } = renderRestore(container, content);
    flushFrames();

    unmount();
    expect(resizeCallback).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(useSavedPositionStore.getState().pendingRestore).not.toBeNull();
  });
});
