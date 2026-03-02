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
  enabled?: boolean;
}

const TOOLBAR_TOOLS = [
  'keyWords',   // 1 - Mark
  'observe',    // 2 - Observe
  'analyze',    // 3 - Analyze
  'studyTools', // 4 - Study
] as const;

export function useKeyboardShortcuts({
  onToolbarTool,
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
  ]);
}

/**
 * Get keyboard shortcut help text
 */
export function getKeyboardShortcutsHelp(): Array<{ keys: string[]; description: string }> {
  return [
    { keys: ['←', '→'], description: 'Previous/Next chapter' },
    { keys: ['J', 'K'], description: 'Next/Previous chapter (vim-style)' },
    { keys: ['Cmd/Ctrl', 'F'], description: 'Search (handled by NavigationBar)' },
    { keys: ['1'], description: 'Mark (Key Words)' },
    { keys: ['2'], description: 'Observe' },
    { keys: ['3'], description: 'Analyze' },
    { keys: ['4'], description: 'Study' },
    { keys: ['Esc'], description: 'Close modals/overlays' },
  ];
}
