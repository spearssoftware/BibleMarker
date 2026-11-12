/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, fireEvent } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: () => ({
    nextChapter: vi.fn(),
    previousChapter: vi.fn(),
    canGoNext: () => false,
    canGoPrevious: () => false,
  }),
}));

afterEach(cleanup);

function setup() {
  const onModeShortcut = vi.fn();
  const onToolbarTool = vi.fn();
  renderHook(() => useKeyboardShortcuts({ onModeShortcut, onToolbarTool }));
  return { onModeShortcut, onToolbarTool };
}

describe('useKeyboardShortcuts mode shortcuts', () => {
  it.each(['metaKey', 'ctrlKey'] as const)('%s+1-3 call onModeShortcut with 0-2', (modifier) => {
    const { onModeShortcut, onToolbarTool } = setup();
    for (const key of ['1', '2', '3']) {
      fireEvent.keyDown(document.body, { key, code: `Digit${key}`, [modifier]: true });
    }
    expect(onModeShortcut.mock.calls).toEqual([[0], [1], [2]]);
    expect(onToolbarTool).not.toHaveBeenCalled();
  });

  it('matches the physical digit key on layouts where it types another character', () => {
    const { onModeShortcut } = setup();
    fireEvent.keyDown(document.body, { key: '&', code: 'Digit1', metaKey: true });
    expect(onModeShortcut.mock.calls).toEqual([[0]]);
  });

  it('ignores the shortcut with Shift or Alt', () => {
    const { onModeShortcut } = setup();
    fireEvent.keyDown(document.body, { key: '1', code: 'Digit1', metaKey: true, shiftKey: true });
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', ctrlKey: true, altKey: true });
    expect(onModeShortcut).not.toHaveBeenCalled();
  });

  it('keeps plain 1-4 routed to onToolbarTool', () => {
    const { onModeShortcut, onToolbarTool } = setup();
    for (const key of ['1', '2', '3', '4']) fireEvent.keyDown(document.body, { key });
    expect(onToolbarTool.mock.calls).toEqual([[0], [1], [2], [3]]);
    expect(onModeShortcut).not.toHaveBeenCalled();
  });

  it('does nothing while an input is focused', () => {
    const { onModeShortcut, onToolbarTool } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: '1', code: 'Digit1', metaKey: true });
    fireEvent.keyDown(input, { key: '1' });
    input.remove();
    expect(onModeShortcut).not.toHaveBeenCalled();
    expect(onToolbarTool).not.toHaveBeenCalled();
  });
});
