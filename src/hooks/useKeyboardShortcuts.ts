/**
 * Keyboard Shortcuts Hook
 * 
 * Handles global keyboard shortcuts for navigation and actions.
 * Respects focus state (doesn't trigger when typing in inputs).
 */

import { useEffect } from 'react';
import { useBibleStore } from '@/stores/bibleStore';

interface KeyboardShortcutsOptions {
  onToolbarTool?: (toolIndex: number) => void;
  onModeShortcut?: (index: number) => void;
  enabled?: boolean;
}

const TOOLBAR_TOOLS = [
  'keyWords',   // 1 - Mark
  'observe',    // 2 - Observe
  'analyze',    // 3 - Analyze
  'studyTools', // 4 - Study
] as const;

// Matched on `e.code` so the shortcut works on non-QWERTY layouts, where the
// digit row produces other characters (e.g. `&` on AZERTY).
const MODE_SHORTCUT_CODES: readonly string[] = ['Digit1', 'Digit2', 'Digit3'];

export function useKeyboardShortcuts({
  onToolbarTool,
  onModeShortcut,
  enabled = true,
}: KeyboardShortcutsOptions = {}) {
  const { nextChapter, previousChapter, canGoNext, canGoPrevious } = useBibleStore();

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when:
      // - User is typing in an input, textarea, or contenteditable element
      // - User is typing in a select dropdown
      // - Modals with input focus are open
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') ||
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('[role="textbox"]');

      // Allow Escape key even when input is focused (for closing modals)
      if (isInputFocused && e.key !== 'Escape') {
        return;
      }

      // Mode shortcuts (Cmd/Ctrl+1-3)
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        MODE_SHORTCUT_CODES.includes(e.code)
      ) {
        e.preventDefault();
        onModeShortcut?.(MODE_SHORTCUT_CODES.indexOf(e.code));
        return;
      }

      // Navigation shortcuts
      // Arrow keys: Left = previous, Right = next
      if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (canGoPrevious()) {
          previousChapter();
        }
        return;
      }

      if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (canGoNext()) {
          nextChapter();
        }
        return;
      }

      // Vim-style navigation: J = next, K = previous
      if (e.key === 'j' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (canGoNext()) {
          nextChapter();
        }
        return;
      }

      if (e.key === 'k' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (canGoPrevious()) {
          previousChapter();
        }
        return;
      }

      // Toolbar shortcuts (number keys 1-4)
      // Only trigger when not in an input and not holding modifier keys
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        e.key >= '1' &&
        e.key <= '4'
      ) {
        const toolIndex = parseInt(e.key, 10) - 1;
        if (toolIndex >= 0 && toolIndex < TOOLBAR_TOOLS.length) {
          e.preventDefault();
          if (onToolbarTool) {
            onToolbarTool(toolIndex);
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    enabled,
    nextChapter,
    previousChapter,
    canGoNext,
    canGoPrevious,
    onToolbarTool,
    onModeShortcut,
  ]);
}

/**
 * Get keyboard shortcut help text. The 1-4 tool rows exist only in Study mode.
 */
export function getKeyboardShortcutsHelp(isStudyMode: boolean): Array<{ keys: string[]; description: string }> {
  const toolRows = isStudyMode
    ? [
        { keys: ['1'], description: 'Mark (Key Words)' },
        { keys: ['2'], description: 'Observe' },
        { keys: ['3'], description: 'Analyze' },
        { keys: ['4'], description: 'Study Tools' },
      ]
    : [];
  return [
    { keys: ['←', '→'], description: 'Previous/Next chapter' },
    { keys: ['J', 'K'], description: 'Next/Previous chapter (vim-style)' },
    { keys: ['Cmd/Ctrl', 'F'], description: 'Search (handled by NavigationBar)' },
    ...toolRows,
    { keys: ['Cmd/Ctrl', '1'], description: 'Read mode' },
    { keys: ['Cmd/Ctrl', '2'], description: 'Discover mode' },
    { keys: ['Cmd/Ctrl', '3'], description: 'Study mode' },
    { keys: ['Esc'], description: 'Close modals/overlays' },
  ];
}
