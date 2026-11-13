/**
 * @vitest-environment jsdom
 *
 * jsdom has no layout, so the container's metrics are stubbed and scroll
 * events are dispatched by hand.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useHidingChrome } from '../useHidingChrome';
import { useChromeStore } from '@/stores/chromeStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useAppModeStore } from '@/stores/appModeStore';
import { usePanelStore } from '@/stores/panelStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { HIDE_AFTER_SCROLL_PX, ARMED_IDLE_MS } from '@/lib/hidingChrome';

function makeContainer() {
  const container = document.createElement('div');
  let scrollTop = 0;
  Object.defineProperty(container, 'scrollTop', { get: () => scrollTop, set: (v: number) => { scrollTop = v; }, configurable: true });
  Object.defineProperty(container, 'scrollHeight', { value: 3000, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 800, configurable: true });
  document.body.appendChild(container);
  return container;
}

function scrollTo(container: HTMLElement, top: number) {
  container.scrollTop = top;
  act(() => { container.dispatchEvent(new Event('scroll')); });
}

const hidden = () => useChromeStore.getState().scrollHidden;

function setup() {
  const container = makeContainer();
  const ref = { current: container };
  renderHook(() => useHidingChrome(ref, null));
  return container;
}

beforeEach(() => {
  useChromeStore.setState({ scrollHidden: false, holds: {} });
  usePanelStore.setState({ activePanel: null, isCollapsed: false });
  useAnnotationStore.setState({ selection: null });
  vi.useFakeTimers();
  useBibleStore.setState({ currentBook: 'JHN', currentChapter: 3 });
  useAppModeStore.setState({ mode: 'read' });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  document.body.innerHTML = '';
});

describe('useHidingChrome', () => {
  it('hides on a user-driven scroll down and shows on scroll up', () => {
    const container = setup();
    container.dispatchEvent(new Event('wheel'));
    scrollTo(container, 100);
    scrollTo(container, 100 + HIDE_AFTER_SCROLL_PX);
    expect(hidden()).toBe(true);
    scrollTo(container, 100 + HIDE_AFTER_SCROLL_PX - 20);
    expect(hidden()).toBe(false);
  });

  it('is armed by a touchmove on the container', () => {
    const container = setup();
    container.dispatchEvent(new Event('touchmove'));
    scrollTo(container, 400);
    scrollTo(container, 500);
    expect(hidden()).toBe(true);
  });

  it.each(['touchstart', 'touchend'])('is not armed by %s (a tap)', (type) => {
    const container = setup();
    container.dispatchEvent(new Event(type));
    scrollTo(container, 400);
    scrollTo(container, 500);
    expect(hidden()).toBe(false);
  });

  it('is not armed by a pointerdown on content inside the container', () => {
    const container = setup();
    const child = document.createElement('span');
    container.appendChild(child);
    child.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    scrollTo(container, 400);
    scrollTo(container, 500);
    expect(hidden()).toBe(false);
  });

  it('is armed by a pointerdown on the container itself (scrollbar drag)', () => {
    const container = setup();
    container.dispatchEvent(new Event('pointerdown'));
    scrollTo(container, 400);
    scrollTo(container, 500);
    expect(hidden()).toBe(true);
  });

  it.each(['PageUp', 'PageDown', 'Home', 'End', ' ', 'ArrowUp', 'ArrowDown'])('is armed by the %j key', (key) => {
    const container = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    scrollTo(container, 400);
    scrollTo(container, 500);
    expect(hidden()).toBe(true);
  });

  it.each(['a', 'Enter', 'Tab', 'ArrowLeft'])('is not armed by the %j key', (key) => {
    const container = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    scrollTo(container, 400);
    scrollTo(container, 500);
    expect(hidden()).toBe(false);
  });

  it('stays armed while scroll events keep arriving, then expires', () => {
    const container = setup();
    container.dispatchEvent(new Event('touchmove'));
    scrollTo(container, 100);
    // Momentum: events 150 ms apart, longer than the idle window in total.
    for (let top = 160; top <= 400; top += 60) {
      act(() => { vi.advanceTimersByTime(ARMED_IDLE_MS - 50); });
      scrollTo(container, top);
    }
    expect(hidden()).toBe(true);

    act(() => { vi.advanceTimersByTime(ARMED_IDLE_MS + 1); });
    act(() => { useChromeStore.setState({ scrollHidden: false }); });
    // An app-driven scroll in the same chapter no longer counts.
    scrollTo(container, 800);
    scrollTo(container, 1200);
    expect(hidden()).toBe(false);
  });

  it('expires when the arming input produced no scroll', () => {
    const container = setup();
    container.dispatchEvent(new Event('wheel'));
    act(() => { vi.advanceTimersByTime(ARMED_IDLE_MS + 1); });
    scrollTo(container, 400);
    scrollTo(container, 900);
    expect(hidden()).toBe(false);
  });

  it('does not hide on a scroll nothing armed', () => {
    const container = setup();
    scrollTo(container, 400);
    scrollTo(container, 900);
    expect(hidden()).toBe(false);
  });

  it('reveals and disarms on a chapter change', () => {
    const container = setup();
    container.dispatchEvent(new Event('wheel'));
    scrollTo(container, 100);
    scrollTo(container, 400);
    expect(hidden()).toBe(true);
    act(() => { useBibleStore.setState({ currentChapter: 4 }); });
    expect(hidden()).toBe(false);
    scrollTo(container, 900);
    expect(hidden()).toBe(false);
  });

  it('reveals on a mode change', () => {
    const container = setup();
    container.dispatchEvent(new Event('wheel'));
    scrollTo(container, 100);
    scrollTo(container, 400);
    expect(hidden()).toBe(true);
    act(() => { useAppModeStore.setState({ mode: 'study' }); });
    expect(hidden()).toBe(false);
  });

  it('reveals on resize', () => {
    const container = setup();
    container.dispatchEvent(new Event('wheel'));
    scrollTo(container, 100);
    scrollTo(container, 400);
    expect(hidden()).toBe(true);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(hidden()).toBe(false);
  });

  it('reveals when a hold is taken', () => {
    const container = setup();
    container.dispatchEvent(new Event('wheel'));
    scrollTo(container, 100);
    scrollTo(container, 400);
    expect(hidden()).toBe(true);
    act(() => { useChromeStore.getState().setHold('nav', true); });
    expect(hidden()).toBe(false);
  });

  function hideThen(container: HTMLElement) {
    container.dispatchEvent(new Event('wheel'));
    scrollTo(container, 100);
    scrollTo(container, 400);
    expect(hidden()).toBe(true);
  }

  it('reveals when a side panel opens and stays shown after it closes until the next scroll down', () => {
    const container = setup();
    hideThen(container);
    act(() => { usePanelStore.setState({ activePanel: 'discover' as never, isCollapsed: false }); });
    expect(hidden()).toBe(false);
    act(() => { usePanelStore.setState({ activePanel: null }); });
    expect(hidden()).toBe(false);
    container.dispatchEvent(new Event('wheel'));
    scrollTo(container, 500);
    scrollTo(container, 700);
    expect(hidden()).toBe(true);
  });

  it('reveals when a text selection appears', () => {
    const container = setup();
    hideThen(container);
    act(() => { useAnnotationStore.setState({ selection: { text: 'x' } as never }); });
    expect(hidden()).toBe(false);
    act(() => { useAnnotationStore.setState({ selection: null }); });
    expect(hidden()).toBe(false);
  });

  it.each(['study', 'discover'] as const)('does nothing in %s', (mode) => {
    useAppModeStore.setState({ mode });
    const container = setup();
    const set = vi.spyOn(useChromeStore.getState(), 'setScrollHidden');
    container.dispatchEvent(new Event('wheel'));
    scrollTo(container, 100);
    scrollTo(container, 600);
    window.dispatchEvent(new Event('resize'));
    expect(set).not.toHaveBeenCalled();
    expect(hidden()).toBe(false);
  });

  it('reveals when the mode leaves Read', () => {
    const container = setup();
    hideThen(container);
    act(() => { useAppModeStore.setState({ mode: 'discover' }); });
    expect(hidden()).toBe(false);
  });
});
