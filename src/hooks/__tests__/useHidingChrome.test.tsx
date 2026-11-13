/**
 * @vitest-environment jsdom
 *
 * jsdom has no layout, so the container's metrics are stubbed and scroll
 * events are dispatched by hand.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useHidingChrome } from '../useHidingChrome';
import { useChromeStore } from '@/stores/chromeStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useAppModeStore } from '@/stores/appModeStore';
import { HIDE_AFTER_SCROLL_PX } from '@/lib/hidingChrome';

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
  useChromeStore.setState({ scrollHidden: false, topInset: 0, holds: {} });
  useBibleStore.setState({ currentBook: 'JHN', currentChapter: 3 });
  useAppModeStore.setState({ mode: 'read' });
});

afterEach(() => {
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

  it.each(['touchstart', 'pointerdown'])('is armed by %s on the container', (type) => {
    const container = setup();
    container.dispatchEvent(new Event(type));
    scrollTo(container, 400);
    scrollTo(container, 500);
    expect(hidden()).toBe(true);
  });

  it('is armed by a key press anywhere', () => {
    const container = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    scrollTo(container, 400);
    scrollTo(container, 500);
    expect(hidden()).toBe(true);
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
});
