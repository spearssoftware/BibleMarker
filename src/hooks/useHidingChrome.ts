/**
 * Drives the Read-mode top bar from the reader's scroll. Only scrolls the
 * reader causes arm it: a wheel, touch or pointer press on the container, or a
 * key press. That keeps the saved-position restore, the chapter-open reset to
 * the top and search's scrollIntoView from hiding the bar. Anything that makes
 * the bar relevant again (a new chapter or mode, a rotation, a hold) disarms
 * the listener and reveals the bar.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { usePanelStore } from '@/stores/panelStore';
import { useChromeStore } from '@/stores/chromeStore';
import { useEffectiveMode } from '@/lib/appMode';
import { nextScrollTrack, type ScrollTrack } from '@/lib/hidingChrome';

const START: ScrollTrack = { hidden: false, lastTop: 0, travel: 0 };

function selectionInside(container: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;
  return !!selection.anchorNode && container.contains(selection.anchorNode);
}

export function useHidingChrome(containerRef: RefObject<HTMLElement | null>, contentEl: HTMLElement | null) {
  const book = useBibleStore(s => s.currentBook);
  const chapter = useBibleStore(s => s.currentChapter);
  const mode = useEffectiveMode();
  const orientation = usePanelStore(s => s.orientation);
  const held = useChromeStore(s => Object.keys(s.holds).length > 0);

  const trackRef = useRef<ScrollTrack>(START);
  const armedRef = useRef(false);

  useEffect(() => {
    armedRef.current = false;
    trackRef.current = { ...START, lastTop: containerRef.current?.scrollTop ?? 0 };
    useChromeStore.getState().reveal();
  }, [book, chapter, mode, orientation, held, containerRef]);

  useEffect(() => {
    const onResize = () => {
      armedRef.current = false;
      useChromeStore.getState().reveal();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const arm = () => { armedRef.current = true; };
    const onScroll = () => {
      const { scrollHidden, setScrollHidden } = useChromeStore.getState();
      // Revealed from outside (a tap, focus): the old direction no longer counts.
      const prev = trackRef.current.hidden === scrollHidden
        ? trackRef.current
        : { ...trackRef.current, hidden: scrollHidden, travel: 0 };
      const next = nextScrollTrack(prev, {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        userDriven: armedRef.current,
        selecting: useAnnotationStore.getState().isSelecting || selectionInside(container),
      });
      trackRef.current = next;
      setScrollHidden(next.hidden);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('wheel', arm, { passive: true });
    container.addEventListener('touchstart', arm, { passive: true });
    container.addEventListener('pointerdown', arm, { passive: true });
    window.addEventListener('keydown', arm);
    return () => {
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('wheel', arm);
      container.removeEventListener('touchstart', arm);
      container.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, [containerRef, contentEl]);
}
