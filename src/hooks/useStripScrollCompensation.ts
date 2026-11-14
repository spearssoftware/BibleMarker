import { useLayoutEffect, useRef, type RefObject } from 'react';
import { TOP_OF_CHAPTER_PX } from '@/lib/hidingChrome';

/** The room the plan strip takes above the first verse, including the gap that follows it. */
function stripExtent(content: HTMLElement | null): number {
  const strip = content?.querySelector<HTMLElement>('[data-reader-plan-strip]');
  if (!strip) return 0;
  const next = strip.nextElementSibling;
  const gap = next ? parseFloat(getComputedStyle(next).marginTop) || 0 : 0;
  return strip.offsetHeight + gap;
}

/**
 * Keeps the text where it is when the plan strip appears or grows above a
 * reader who has already scrolled, such as a plan created or synced in while a
 * chapter is open. At the top of the chapter the text simply moves down.
 */
export function useStripScrollCompensation(
  containerRef: RefObject<HTMLElement | null>,
  contentEl: HTMLElement | null,
  locationKey: string,
  entryCount: number
) {
  const lastRef = useRef<{ content: HTMLElement | null; key: string; extent: number } | null>(null);

  useLayoutEffect(() => {
    const extent = stripExtent(contentEl);
    const last = lastRef.current;
    lastRef.current = { content: contentEl, key: locationKey, extent };
    const container = containerRef.current;
    if (!last || !container || last.content !== contentEl || last.key !== locationKey) return;
    const delta = extent - last.extent;
    if (delta !== 0 && container.scrollTop > TOP_OF_CHAPTER_PX) container.scrollTop += delta;
  }, [containerRef, contentEl, locationKey, entryCount]);
}
