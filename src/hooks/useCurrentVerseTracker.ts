/**
 * Tracks which verse is centered in the reader's scroll container and publishes
 * it to useReadingPositionStore. Measurements are coalesced into one rAF.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { pickCurrentVerse } from '@/lib/currentVerse';
import { useReadingPositionStore } from '@/stores/readingPositionStore';

const SCROLL_DEBOUNCE_MS = 150;

interface TrackerOptions {
  locationKey: string;
  ready: boolean;
  minVerse: number;
  maxVerse: number;
}

export function useCurrentVerseTracker(
  containerRef: RefObject<HTMLElement | null>,
  contentEl: HTMLElement | null,
  opts: TrackerOptions
) {
  const { locationKey, ready, minVerse, maxVerse } = opts;
  const optsRef = useRef(opts);
  const scheduleRef = useRef<(nested?: boolean) => void>(() => {});

  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    useReadingPositionStore.getState().setCurrentVerse(null);
  }, [locationKey]);

  useEffect(() => {
    let raf: number | null = null;
    let innerRaf: number | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const measure = () => {
      const container = containerRef.current;
      const { ready: isReady, minVerse: lo, maxVerse: hi } = optsRef.current;
      if (!isReady || !container || useReadingPositionStore.getState().verseTrackingPaused) return;

      const rows = Array.from(container.querySelectorAll<HTMLElement>('.grid[data-verse]'))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { verse: parseInt(el.dataset.verse ?? '', 10), top: rect.top, height: rect.height };
        })
        .filter((row) => row.verse > 0);

      const verse = pickCurrentVerse({
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        scrollHeight: container.scrollHeight,
        containerTop: container.getBoundingClientRect().top,
        rows,
        minVerse: lo,
        maxVerse: hi,
      });
      if (verse !== null) useReadingPositionStore.getState().setCurrentVerse(verse);
    };

    const schedule = (nested = false) => {
      if (nested) {
        // A post-navigation measure must outlive any pending plain one.
        if (raf !== null) cancelAnimationFrame(raf);
        if (innerRaf !== null) cancelAnimationFrame(innerRaf);
        innerRaf = null;
      } else if (raf !== null) {
        return;
      }
      raf = requestAnimationFrame(() => {
        if (!nested) {
          raf = null;
          measure();
          return;
        }
        // Nested so we run after MultiTranslationView's scroll-to-top rAF.
        innerRaf = requestAnimationFrame(() => {
          innerRaf = null;
          raf = null;
          measure();
        });
      });
    };
    scheduleRef.current = schedule;

    const container = containerRef.current;
    const onScroll = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        schedule();
      }, SCROLL_DEBOUNCE_MS);
    };
    container?.addEventListener('scroll', onScroll, { passive: true });

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => schedule());
      if (container) observer.observe(container);
      if (contentEl) observer.observe(contentEl);
    }

    const unsubscribe = useReadingPositionStore.subscribe((state, prev) => {
      if (prev.verseTrackingPaused && !state.verseTrackingPaused) schedule();
    });

    // Cleanup cancels pending work, so a remount must re-measure on its own.
    schedule();

    return () => {
      container?.removeEventListener('scroll', onScroll);
      observer?.disconnect();
      unsubscribe();
      if (debounce) clearTimeout(debounce);
      if (raf !== null) cancelAnimationFrame(raf);
      if (innerRaf !== null) cancelAnimationFrame(innerRaf);
      scheduleRef.current = () => {};
    };
  }, [containerRef, contentEl]);

  useEffect(() => {
    if (ready) scheduleRef.current(true);
  }, [ready, locationKey, minVerse, maxVerse]);
}
