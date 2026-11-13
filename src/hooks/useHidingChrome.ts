/**
 * Drives the Read-mode top bar from the reader's scroll. A scroll counts as the
 * reader's only while a scroll gesture is in progress: a wheel, a touch move, a
 * scrolling key, or a press on the scrollbar itself arms the hook, and it
 * disarms ARMED_IDLE_MS after the last scroll event. A tap never arms, and
 * neither does the saved-position restore, the chapter-open reset, search's
 * scrollIntoView, a cross-reference jump or the virtual keyboard. Anything that
 * makes the bar relevant again (a new chapter or mode, a rotation, a hold, a
 * panel or selection appearing) disarms and reveals it. Inert outside Read.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { usePanelStore } from '@/stores/panelStore';
import { useChromeStore } from '@/stores/chromeStore';
import { useEffectiveMode, topBarCanHide } from '@/lib/appMode';
import { nextScrollTrack, ARMED_IDLE_MS, SCROLL_KEYS, type ScrollTrack } from '@/lib/hidingChrome';

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
  const isRead = topBarCanHide(mode);
  const orientation = usePanelStore(s => s.orientation);
  const held = useChromeStore(s => Object.keys(s.holds).length > 0);
  const panelOpen = usePanelStore(s => s.activePanel !== null && !s.isCollapsed);
  const hasSelection = useAnnotationStore(s => s.selection !== null);

  const trackRef = useRef<ScrollTrack>(START);
  const armedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const disarm = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    armedRef.current = false;
  }, []);

  useEffect(() => {
    disarm();
    trackRef.current = { ...START, lastTop: containerRef.current?.scrollTop ?? 0 };
    useChromeStore.getState().reveal();
  }, [book, chapter, mode, orientation, held, panelOpen, hasSelection, containerRef, disarm]);

  useEffect(() => {
    if (!isRead) return;
    const onResize = () => {
      disarm();
      useChromeStore.getState().reveal();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isRead, disarm]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isRead) return;

    const arm = () => {
      armedRef.current = true;
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(disarm, ARMED_IDLE_MS);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) arm();
    };
    const onPointerDown = (e: PointerEvent) => {
      // A press on the container itself, not its content, is the scrollbar.
      if (e.target === container) arm();
    };
    const onScroll = () => {
      const { scrollHidden, setScrollHidden } = useChromeStore.getState();
      // Revealed from outside (a tap, focus): the old direction no longer counts.
      const prev = trackRef.current.hidden === scrollHidden
        ? trackRef.current
        : { ...trackRef.current, hidden: scrollHidden, travel: 0 };
      const userDriven = armedRef.current;
      const next = nextScrollTrack(prev, {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        userDriven,
        selecting: useAnnotationStore.getState().isSelecting || selectionInside(container),
      });
      trackRef.current = next;
      setScrollHidden(next.hidden);
      // Each scroll event keeps the gesture alive; momentum scrolling after touchend relies on it.
      if (userDriven) arm();
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('wheel', arm, { passive: true });
    container.addEventListener('touchmove', arm, { passive: true });
    container.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      disarm();
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('wheel', arm);
      container.removeEventListener('touchmove', arm);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [containerRef, contentEl, isRead, disarm]);
}
