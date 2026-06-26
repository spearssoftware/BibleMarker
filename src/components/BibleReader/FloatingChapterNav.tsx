/**
 * Floating Chapter Navigation (desktop gutters)
 *
 * Previous/next chapter arrows for desktop, placed in the whitespace gutters
 * beside the centered reading column so they never overlap the text. Hidden on
 * phones and narrow/split panes (where there's no gutter) — touch users change
 * chapters by swiping (see useSwipeNavigation in MultiTranslationView). The
 * arrows fade out while the reader is actively scrolling and fade back once it
 * settles, and each hides when there's no chapter in that direction.
 *
 * Mounted inside SplitLayout's scripture pane; the overlay measures the pane so
 * the arrows only appear when the pane is wide enough to have real gutters.
 */

import { useEffect, useRef, useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';

const SCROLL_IDLE_MS = 1100;
// The reading column is capped at max-w-4xl (896px). Only show the gutter arrows
// once the pane is wide enough to leave clear margin beside that column.
const MIN_PANE_PX = 1024;
// Half the reading column (448px) plus a small gap — used to park each arrow
// just outside the column edge via calc(50% ± OFFSET).
const ARROW_OFFSET_PX = 456;
const ARROW_W_PX = 44;

export function FloatingChapterNav() {
  const previousChapter = useBibleStore((s) => s.previousChapter);
  const nextChapter = useBibleStore((s) => s.nextChapter);
  // Compute availability inside the selector so it re-evaluates on each chapter
  // change (and re-renders only when the boolean flips).
  const showPrev = useBibleStore((s) => s.canGoPrevious());
  const showNext = useBibleStore((s) => s.canGoNext());

  const overlayRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const [scrolling, setScrolling] = useState(false);

  // Show only when the pane (reading column + gutters) is wide enough.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWide(w >= MIN_PANE_PX);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fade while scrolling. Capture phase catches the reader's inner scroll
  // container (scroll events don't bubble).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(timer);
      timer = setTimeout(() => setScrolling(false), SCROLL_IDLE_MS);
    };
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      clearTimeout(timer);
    };
  }, []);

  const fade = scrolling ? 'opacity-0 pointer-events-none' : 'opacity-70 hover:opacity-100';
  const base =
    'pointer-events-auto absolute top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center ' +
    'rounded-full bg-scripture-surface/90 backdrop-blur-sm shadow-md border border-scripture-border/40 ' +
    'text-scripture-text transition-opacity duration-300 select-none';

  return (
    <div ref={overlayRef} className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden={!wide}>
      {wide && showPrev && (
        <button
          onClick={previousChapter}
          className={`${base} ${fade}`}
          style={{ left: `calc(50% - ${ARROW_OFFSET_PX + ARROW_W_PX}px)` }}
          aria-label="Previous chapter"
          title="Previous chapter"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {wide && showNext && (
        <button
          onClick={nextChapter}
          className={`${base} ${fade}`}
          style={{ left: `calc(50% + ${ARROW_OFFSET_PX}px)` }}
          aria-label="Next chapter"
          title="Next chapter"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
