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
 * The scrollTop that centres the row in the part of the container not covered
 * at the top by `topInset` px (the overlaid top bar), or aligns the row's top
 * with the bottom edge of that cover when the row is taller than what is left.
 * `scrollIntoView({ block: 'center' })` is not used because it centres a tall
 * row too, hiding its first lines, and can scroll ancestors of the container.
 */
export function restoreScrollTop(
  containerRect: DOMRect,
  rowRect: DOMRect,
  scrollTop: number,
  clientHeight: number,
  topInset = 0
): number {
  const rowOffset = scrollTop + rowRect.top - containerRect.top - topInset;
  const visible = clientHeight - topInset;
  if (rowRect.height >= visible) return Math.max(0, rowOffset);
  return Math.max(0, rowOffset - (visible - rowRect.height) / 2);
}

function saveCurrentLocation(verse: number): void {
  const { currentBook, currentChapter } = useBibleStore.getState();
  useSavedPositionStore.getState().save(currentBook, currentChapter, verse);
}

export function useRestoreReadingPosition(
  containerRef: RefObject<HTMLElement | null>,
  contentEl: HTMLElement | null,
  { ready, minVerse, maxVerse, book, chapter }: RestoreOptions
) {
  useEffect(() => {
    return useReadingPositionStore.subscribe((state, prev) => {
      if (state.currentVerse === null || state.currentVerse === prev.currentVerse) return;
      saveCurrentLocation(state.currentVerse);
    });
  }, []);

  // When anchoring must end. Outlives effect re-runs: a second translation
  // finishing or the content element being re-keyed re-runs the effect
  // mid-anchoring, and those are exactly the layout changes anchoring is for.
  const anchorDeadlineRef = useRef<number | null>(null);

  useEffect(() => {
    const { pendingRestore, settleRestore } = useSavedPositionStore.getState();
    if (!pendingRestore) return;

    // Opens the save gate and stores where the reader actually is. The
    // tracker's reports were dropped while the gate was closed and it will not
    // repeat an unchanged verse, so its current value is saved here.
    const settleAndSave = (fallbackVerse?: number) => {
      anchorDeadlineRef.current = null;
      settleRestore();
      const current = useReadingPositionStore.getState().currentVerse ?? fallbackVerse;
      if (current !== undefined) saveCurrentLocation(current);
    };

    if (pendingRestore.book !== book || pendingRestore.chapter !== chapter) {
      settleAndSave();
      return;
    }

    if (!ready) {
      // Going back to "loading" mid-anchoring removes the listeners that tell
      // us the reader took over, so anchoring ends here instead of resuming.
      if (anchorDeadlineRef.current !== null) settleAndSave();
      return;
    }
    const container = containerRef.current;
    if (!container || !contentEl) return;

    const { verse } = pendingRestore;
    if (verse < minVerse || verse > maxVerse) {
      // The verse does not exist in what loaded: forget it.
      anchorDeadlineRef.current = null;
      settleRestore(true);
      return;
    }
    const findRow = () => container.querySelector<HTMLElement>(`.grid[data-verse="${verse}"]`);
    if (!findRow()) {
      // In range but not in the page right now: skip this launch, keep the record.
      settleAndSave();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    let unsubscribeJump: (() => void) | undefined;
    const takeOverEvents = ['wheel', 'touchstart', 'mousedown'] as const;

    const stopAnchoring = () => {
      clearTimeout(timer);
      observer?.disconnect();
      unsubscribeJump?.();
      takeOverEvents.forEach((type) => container.removeEventListener(type, onTakeOver));
      document.removeEventListener('keydown', onTakeOver);
    };

    function onTakeOver() {
      stopAnchoring();
      settleAndSave();
    }

    const place = () => {
      const row = findRow();
      if (!row) return;
      container.scrollTop = restoreScrollTop(
        container.getBoundingClientRect(),
        row.getBoundingClientRect(),
        container.scrollTop,
        container.clientHeight,
        parseFloat(getComputedStyle(container).scrollPaddingTop) || 0
      );
    };

    const frame = requestAnimationFrame(() => {
      const stillPending = useSavedPositionStore.getState().pendingRestore !== null;
      const resuming = anchorDeadlineRef.current !== null;
      const scrolledAway = !resuming && container.scrollTop > UNSCROLLED_THRESHOLD;
      const jumpUnderWay = useBibleStore.getState().navSelectedVerse !== null;
      if (!stillPending || scrolledAway || jumpUnderWay) {
        settleAndSave();
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
      // A jump to a named verse (search, verse picker, cross-reference) wins:
      // it tints its row, which resizes the content and would re-place ours.
      unsubscribeJump = useBibleStore.subscribe((state) => {
        if (state.navSelectedVerse !== null) onTakeOver();
      });
      timer = setTimeout(() => {
        stopAnchoring();
        // A reader who never scrolls may have produced no tracker report yet.
        settleAndSave(verse);
      }, Math.max(0, anchorDeadlineRef.current - Date.now()));
    });

    return () => {
      cancelAnimationFrame(frame);
      stopAnchoring();
    };
  }, [containerRef, contentEl, ready, minVerse, maxVerse, book, chapter]);
}
