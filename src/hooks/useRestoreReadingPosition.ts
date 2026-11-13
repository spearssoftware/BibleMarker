/**
 * Saves the verse being read and, once per launch, scrolls back to the saved
 * one. Ordering is the hard part: the chapter loads at the top, the tracker
 * reports verse 1, and late content (headings, notes, marks, fonts) can move
 * the verse. While the restore is pending or anchoring, saving stays gated in
 * useSavedPositionStore so a shifted measurement is never stored.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useReadingPositionStore } from '@/stores/readingPositionStore';
import { useSavedPositionStore } from '@/stores/savedPositionStore';

/** How long the verse is re-placed after the first placement. A starting value to tune in the simulator. */
const ANCHOR_WINDOW_MS = 2000;

/** The container's own scroll sits at or near 0 until something else scrolls it. */
const UNSCROLLED_THRESHOLD = 1;

interface RestoreOptions {
  ready: boolean;
  minVerse: number;
  maxVerse: number;
  book: string;
  chapter: number;
}

/**
 * The scrollTop that centres the row in the container, or aligns the row's top
 * with the container's top when the row is taller than the container.
 */
export function restoreScrollTop(
  containerRect: DOMRect,
  rowRect: DOMRect,
  scrollTop: number,
  clientHeight: number
): number {
  const rowOffset = scrollTop + rowRect.top - containerRect.top;
  if (rowRect.height >= clientHeight) return rowOffset;
  return Math.max(0, rowOffset - (clientHeight - rowRect.height) / 2);
}

export function useRestoreReadingPosition(
  containerRef: RefObject<HTMLElement | null>,
  contentEl: HTMLElement | null,
  { ready, minVerse, maxVerse, book, chapter }: RestoreOptions
) {
  useEffect(() => {
    return useReadingPositionStore.subscribe((state, prev) => {
      if (state.currentVerse === null || state.currentVerse === prev.currentVerse) return;
      const { currentBook, currentChapter } = useBibleStore.getState();
      useSavedPositionStore.getState().save(currentBook, currentChapter, state.currentVerse);
    });
  }, []);

  // When anchoring must end. Outlives effect re-runs: a second translation
  // finishing or the content element being re-keyed re-runs the effect
  // mid-anchoring, and those are exactly the layout changes anchoring is for.
  const anchorDeadlineRef = useRef<number | null>(null);

  useEffect(() => {
    const { pendingRestore, settleRestore } = useSavedPositionStore.getState();
    if (!pendingRestore) return;
    if (pendingRestore.book !== book || pendingRestore.chapter !== chapter) {
      settleRestore();
      return;
    }

    const container = containerRef.current;
    if (!ready || !container || !contentEl) return;

    const { verse } = pendingRestore;
    const findRow = () => container.querySelector<HTMLElement>(`.grid[data-verse="${verse}"]`);
    if (verse < minVerse || verse > maxVerse || !findRow()) {
      settleRestore(true);
      return;
    }

    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let observer: ResizeObserver | undefined;
    const takeOverEvents = ['wheel', 'touchstart', 'mousedown'] as const;

    const place = () => {
      const row = findRow();
      if (!row) return;
      container.scrollTop = restoreScrollTop(
        container.getBoundingClientRect(),
        row.getBoundingClientRect(),
        container.scrollTop,
        container.clientHeight
      );
    };

    const stopAnchoring = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      observer?.disconnect();
      observer = undefined;
      takeOverEvents.forEach((type) => container.removeEventListener(type, onTakeOver));
      document.removeEventListener('keydown', onTakeOver);
    };

    function onTakeOver() {
      anchorDeadlineRef.current = null;
      stopAnchoring();
      useSavedPositionStore.getState().settleRestore();
    }

    frame = requestAnimationFrame(() => {
      frame = null;
      const stillPending = useSavedPositionStore.getState().pendingRestore !== null;
      const resuming = anchorDeadlineRef.current !== null;
      const scrolledAway = !resuming && container.scrollTop > UNSCROLLED_THRESHOLD;
      const jumpUnderWay = useBibleStore.getState().navSelectedVerse !== null;
      if (!stillPending || scrolledAway || jumpUnderWay) {
        anchorDeadlineRef.current = null;
        settleRestore();
        return;
      }

      place();
      anchorDeadlineRef.current ??= Date.now() + ANCHOR_WINDOW_MS;

      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(place);
        observer.observe(contentEl);
      }
      takeOverEvents.forEach((type) =>
        container.addEventListener(type, onTakeOver, { passive: true })
      );
      document.addEventListener('keydown', onTakeOver);
      timer = setTimeout(() => {
        anchorDeadlineRef.current = null;
        stopAnchoring();
        // A reader who never scrolls produces no tracker report to save this verse.
        settleRestore();
        useSavedPositionStore.getState().save(book, chapter, verse);
      }, Math.max(0, anchorDeadlineRef.current - Date.now()));
    });

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      stopAnchoring();
    };
  }, [containerRef, contentEl, ready, minVerse, maxVerse, book, chapter]);
}
