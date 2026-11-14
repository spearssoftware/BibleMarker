/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStripScrollCompensation } from '../useStripScrollCompensation';

function setup(scrollTop: number) {
  const container = document.createElement('div');
  const content = document.createElement('div');
  const verse = document.createElement('div');
  content.append(verse);
  container.append(content);
  container.scrollTop = scrollTop;
  return { container, content, verse };
}

function addStrip(content: HTMLElement, height: number) {
  const strip = document.createElement('div');
  strip.setAttribute('data-reader-plan-strip', '');
  vi.spyOn(strip, 'offsetHeight', 'get').mockReturnValue(height);
  content.prepend(strip);
}

afterEach(() => vi.restoreAllMocks());

describe('useStripScrollCompensation', () => {
  it('moves scrollTop by the height a strip adds above a scrolled reader', () => {
    const { container, content } = setup(300);
    const { rerender } = renderHook(
      ({ count }) => useStripScrollCompensation({ current: container }, content, 'John:1', count),
      { initialProps: { count: 0 } }
    );
    addStrip(content, 40);
    rerender({ count: 1 });
    expect(container.scrollTop).toBe(340);
  });

  it('leaves a reader at the top alone', () => {
    const { container, content } = setup(0);
    const { rerender } = renderHook(
      ({ count }) => useStripScrollCompensation({ current: container }, content, 'John:1', count),
      { initialProps: { count: 0 } }
    );
    addStrip(content, 40);
    rerender({ count: 1 });
    expect(container.scrollTop).toBe(0);
  });

  it('does nothing for a strip that is there when the chapter opens', () => {
    const { container, content } = setup(300);
    addStrip(content, 40);
    renderHook(() => useStripScrollCompensation({ current: container }, content, 'John:1', 1));
    expect(container.scrollTop).toBe(300);
  });

  it('does not compensate across a chapter change', () => {
    const { container, content } = setup(300);
    const { rerender } = renderHook(
      ({ key, count }) => useStripScrollCompensation({ current: container }, content, key, count),
      { initialProps: { key: 'John:1', count: 0 } }
    );
    addStrip(content, 40);
    rerender({ key: 'John:2', count: 1 });
    expect(container.scrollTop).toBe(300);
  });
});
