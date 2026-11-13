/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import {
  HIDE_AFTER_SCROLL_PX,
  SHOW_AFTER_SCROLL_UP_PX,
  TOP_OF_CHAPTER_PX,
  isRevealTarget,
  nextScrollTrack,
  topBarHidden,
  type ScrollSample,
  type ScrollTrack,
} from '../hidingChrome';

const START: ScrollTrack = { hidden: false, lastTop: 0, travel: 0 };
const base: ScrollSample = { scrollTop: 0, scrollHeight: 2000, clientHeight: 800, userDriven: true, selecting: false };
const at = (scrollTop: number, extra: Partial<ScrollSample> = {}): ScrollSample => ({ ...base, scrollTop, ...extra });

function scrollThrough(start: ScrollTrack, tops: number[], extra: Partial<ScrollSample> = {}): ScrollTrack {
  return tops.reduce((track, top) => nextScrollTrack(track, at(top, extra)), start);
}

describe('nextScrollTrack', () => {
  it('hides once downward travel reaches the threshold, not before', () => {
    const near = scrollThrough({ ...START, lastTop: 100 }, [100 + HIDE_AFTER_SCROLL_PX - 1]);
    expect(near.hidden).toBe(false);
    const past = nextScrollTrack(near, at(100 + HIDE_AFTER_SCROLL_PX));
    expect(past.hidden).toBe(true);
  });

  it('accumulates small downward steps', () => {
    const track = scrollThrough({ ...START, lastTop: 100 }, [120, 140, 160]);
    expect(track.hidden).toBe(true);
  });

  it('shows after a short scroll up', () => {
    const hidden: ScrollTrack = { hidden: true, lastTop: 500, travel: 200 };
    const track = nextScrollTrack(hidden, at(500 - SHOW_AFTER_SCROLL_UP_PX));
    expect(track.hidden).toBe(false);
  });

  it('stays hidden for a smaller upward nudge and restarts the count on a reversal', () => {
    const hidden: ScrollTrack = { hidden: true, lastTop: 500, travel: 200 };
    const nudged = nextScrollTrack(hidden, at(500 - SHOW_AFTER_SCROLL_UP_PX + 1));
    expect(nudged.hidden).toBe(true);
    expect(nudged.travel).toBe(-(SHOW_AFTER_SCROLL_UP_PX - 1));
    const again = nextScrollTrack(nudged, at(nudged.lastTop + 30));
    expect(again.travel).toBe(30);
  });

  it('shows at the top of the chapter whatever the direction', () => {
    const hidden: ScrollTrack = { hidden: true, lastTop: 300, travel: 100 };
    expect(nextScrollTrack(hidden, at(TOP_OF_CHAPTER_PX)).hidden).toBe(false);
    expect(nextScrollTrack(hidden, at(0)).hidden).toBe(false);
  });

  it('never hides a chapter that does not scroll', () => {
    const track = nextScrollTrack(START, { ...base, scrollHeight: 700, clientHeight: 800, scrollTop: 30 });
    expect(track).toEqual({ hidden: false, lastTop: 0, travel: 0 });
    const shown = nextScrollTrack({ hidden: true, lastTop: 90, travel: 90 }, { ...base, scrollHeight: 800, clientHeight: 800 });
    expect(shown.hidden).toBe(false);
  });

  it('treats a negative rubber-band offset as the top', () => {
    const hidden: ScrollTrack = { hidden: true, lastTop: 300, travel: 100 };
    expect(nextScrollTrack(hidden, at(-40)).hidden).toBe(false);
  });

  it('does not hide or show on a rubber-band past the end', () => {
    const max = base.scrollHeight - base.clientHeight;
    const atEnd: ScrollTrack = { hidden: false, lastTop: max, travel: 0 };
    expect(nextScrollTrack(atEnd, at(max + 60))).toBe(atEnd);
    const hiddenAtEnd: ScrollTrack = { hidden: true, lastTop: max, travel: 60 };
    expect(nextScrollTrack(hiddenAtEnd, at(max + 60))).toBe(hiddenAtEnd);
  });

  it('ignores scrolls that are not user driven and drops the travel', () => {
    const track = nextScrollTrack({ hidden: false, lastTop: 100, travel: 30 }, at(400, { userDriven: false }));
    expect(track).toEqual({ hidden: false, lastTop: 400, travel: 0 });
    const hidden = nextScrollTrack({ hidden: true, lastTop: 400, travel: 90 }, at(100, { userDriven: false }));
    expect(hidden.hidden).toBe(true);
  });

  it('freezes the visibility while selecting but keeps the position', () => {
    const track = nextScrollTrack({ hidden: false, lastTop: 100, travel: 10 }, at(900, { selecting: true }));
    expect(track).toEqual({ hidden: false, lastTop: 900, travel: 10 });
    const hidden = nextScrollTrack({ hidden: true, lastTop: 900, travel: 90 }, at(100, { selecting: true }));
    expect(hidden.hidden).toBe(true);
  });
});

describe('topBarHidden', () => {
  const idle = { mode: 'read' as const, scrollHidden: true, held: false, panelOpen: false, hasSelection: false };

  it('follows the scroll in Read', () => {
    expect(topBarHidden(idle)).toBe(true);
    expect(topBarHidden({ ...idle, scrollHidden: false })).toBe(false);
  });

  it.each(['discover', 'study'] as const)('never hides in %s', (mode) => {
    expect(topBarHidden({ ...idle, mode })).toBe(false);
  });

  it.each([
    ['held', { held: true }],
    ['a panel open', { panelOpen: true }],
    ['a selection', { hasSelection: true }],
  ])('stays shown with %s', (_label, override) => {
    expect(topBarHidden({ ...idle, ...override })).toBe(false);
  });
});

describe('isRevealTarget', () => {
  function el(html: string, selector: string): Element {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.querySelector(selector)!;
  }

  it('accepts plain text', () => {
    expect(isRevealTarget(el('<p><span id="t">In the beginning</span></p>', '#t'))).toBe(true);
  });

  it.each([
    ['a link', '<a href="#"><span id="t">x</span></a>'],
    ['a button', '<button><span id="t">x</span></button>'],
    ['an input', '<input id="t" />'],
    ['a role=button', '<div role="button"><span id="t">x</span></div>'],
    ['an editable', '<div contenteditable="true"><span id="t">x</span></div>'],
    ['a verse number', '<span class="verse-number"><b id="t">3</b></span>'],
    ['a marked word', '<span data-annotation-ids="a1"><span id="t">word</span></span>'],
    ['a cross-reference', '<span class="cross-ref"><span id="t">x</span></span>'],
    ['a lens connector', '<span class="lens-connector"><span id="t">x</span></span>'],
    ['a full-screen backdrop', '<div data-chrome-ignore><span id="t">x</span></div>'],
    ['a remove control', '<span class="annotation-remove"><span id="t">x</span></span>'],
  ])('rejects %s', (_label, html) => {
    expect(isRevealTarget(el(html, '#t'))).toBe(false);
  });
});
