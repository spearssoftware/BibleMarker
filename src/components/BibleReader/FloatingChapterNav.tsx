/**
 * Floating Chapter Navigation
 *
 * Previous/next chapter arrows that float over the reading column (YouVersion
 * style) instead of crowding the top toolbar. They sit at the vertical center
 * of the reading area, fade out while the reader is actively scrolling, and
 * fade back in once it settles. Each arrow hides when there's no chapter in
 * that direction (e.g. no "previous" at Genesis 1).
 *
 * Mounted inside SplitLayout's scripture pane, so it's scoped to the reading
 * column and never overlaps the side panel.
 */

import { useEffect, useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';

const SCROLL_IDLE_MS = 1100;

export function FloatingChapterNav() {
  const previousChapter = useBibleStore((s) => s.previousChapter);
  const nextChapter = useBibleStore((s) => s.nextChapter);
  // Compute availability inside the selector so it re-evaluates on each chapter
  // change (and the component re-renders only when the boolean flips).
  const showPrev = useBibleStore((s) => s.canGoPrevious());
  const showNext = useBibleStore((s) => s.canGoNext());

  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(timer);
      timer = setTimeout(() => setScrolling(false), SCROLL_IDLE_MS);
    };
    // Capture phase so we catch scroll from the reader's inner scroll container
    // (scroll events don't bubble).
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      clearTimeout(timer);
    };
  }, []);

  const fade = scrolling ? 'opacity-0 pointer-events-none' : 'opacity-60 hover:opacity-100';
  const base =
    'absolute top-1/2 -translate-y-1/2 z-20 w-11 h-11 inline-flex items-center justify-center ' +
    'rounded-full bg-scripture-surface/80 backdrop-blur-sm shadow-md border border-scripture-border/30 ' +
    'text-scripture-text transition-opacity duration-300 select-none';

  return (
    <>
      {showPrev && (
        <button
          onClick={previousChapter}
          className={`${base} left-2 ${fade}`}
          aria-label="Previous chapter"
          title="Previous chapter"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {showNext && (
        <button
          onClick={nextChapter}
          className={`${base} right-2 ${fade}`}
          aria-label="Next chapter"
          title="Next chapter"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </>
  );
}
