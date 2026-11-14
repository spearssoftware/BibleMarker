/**
 * Rules for the Read-mode top bar that hides while scrolling. Pure: the scroll
 * listener, store and components feed these functions and apply the result.
 */

import type { AppMode } from '@/stores/appModeStore';
import { topBarCanHide } from '@/lib/appMode';

/** Downward travel before the bar hides. A starting value to tune in the simulator. */
export const HIDE_AFTER_SCROLL_PX = 48;
/** Upward travel before the bar returns. */
export const SHOW_AFTER_SCROLL_UP_PX = 8;
/**
 * How long after the last scroll event, or after an input that produced none,
 * a scroll still counts as the reader's. Long enough to bridge the gap between
 * events during iOS momentum scrolling after the finger lifts.
 */
export const ARMED_IDLE_MS = 200;
/** Keys that scroll the reader. */
export const SCROLL_KEYS: ReadonlySet<string> = new Set([
  'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar', 'ArrowUp', 'ArrowDown',
]);
/** At or below this scroll offset the reader counts as at the top of the chapter. */
export const TOP_OF_CHAPTER_PX = 4;

/** Whether a non-empty text selection starts inside `container`. */
export function selectionInside(container: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;
  return !!selection.anchorNode && container.contains(selection.anchorNode);
}

export interface ScrollTrack {
  hidden: boolean;
  lastTop: number;
  /** Signed distance moved since the direction last changed. */
  travel: number;
}

export interface ScrollSample {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** A scroll gesture is in progress (see ARMED_IDLE_MS), as opposed to code moving the text. */
  userDriven: boolean;
  /** A text selection is in progress or exists. */
  selecting: boolean;
}

export function nextScrollTrack(prev: ScrollTrack, sample: ScrollSample): ScrollTrack {
  const { scrollTop, scrollHeight, clientHeight, userDriven, selecting } = sample;
  const max = scrollHeight - clientHeight;
  if (max <= 0) return { hidden: false, lastTop: 0, travel: 0 };

  // iOS rubber-banding reports offsets outside the real range.
  const top = Math.min(Math.max(scrollTop, 0), max);
  if (top <= TOP_OF_CHAPTER_PX) return { hidden: false, lastTop: top, travel: 0 };
  if (selecting) return { ...prev, lastTop: top };
  if (!userDriven) return { hidden: prev.hidden, lastTop: top, travel: 0 };

  const delta = top - prev.lastTop;
  if (delta === 0) return prev;
  if (delta > 0) {
    const travel = Math.max(prev.travel, 0) + delta;
    return { hidden: prev.hidden || travel >= HIDE_AFTER_SCROLL_PX, lastTop: top, travel };
  }
  const travel = Math.min(prev.travel, 0) + delta;
  return { hidden: prev.hidden && -travel < SHOW_AFTER_SCROLL_UP_PX, lastTop: top, travel };
}

interface TopBarState {
  mode: AppMode;
  scrollHidden: boolean;
  held: boolean;
  panelOpen: boolean;
  hasSelection: boolean;
}

export function topBarHidden({ mode, scrollHidden, held, panelOpen, hasSelection }: TopBarState): boolean {
  if (!topBarCanHide(mode) || held || panelOpen || hasSelection) return false;
  return scrollHidden;
}

const NOT_A_REVEAL_TARGET =
  'a,button,input,textarea,select,[role="button"],[contenteditable="true"],' +
  '[data-chrome-ignore],.verse-number,[data-annotation-ids],.cross-ref,.lens-connector,.annotation-remove';

/**
 * Whether a tap on `el` is plain text that does nothing else, so it may reveal
 * the bar. `data-chrome-ignore` marks full-screen backdrops: a tap that closes
 * a popup is not a reveal.
 */
export function isRevealTarget(el: Element): boolean {
  return !el.closest(NOT_A_REVEAL_TARGET);
}
