/**
 * Keyboard Shortcuts Hook
 * 
 * Handles global keyboard shortcuts for navigation and actions.
 * Respects focus state (doesn't trigger when typing in inputs).
 */

import { useEffect } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';

interface KeyboardShortcutsOptions {
  onToolbarTool?: (toolIndex: number) => void;
  enabled?: boolean;
}

const TOOLBAR_TOOLS = [
  'color',      // 1
  'symbol',     // 2
  'legend',     // 3
  'keyWords',   // 4
  'studyTools', // 5
  'more',       // 6
] as const;

export function useKeyboardShortcuts({
  onToolbarTool,
  enabled = true,
}: KeyboardShortcutsOptions = {}) {
  const { nextChapter, previousChapter, canGoNext, canGoPrevious } = useBibleStore();
  const { setActiveTool } = useAnnotationStore();

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

      // Toolbar shortcuts (number keys 1-6)
      // Only trigger when not in an input and not holding modifier keys
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        e.key >= '1' &&
        e.key <= '6'
      ) {
        const toolIndex = parseInt(e.key, 10) - 1;
        if (toolIndex >= 0 && toolIndex < TOOLBAR_TOOLS.length) {
          e.preventDefault();
          const toolType = TOOLBAR_TOOLS[toolIndex];
          setActiveTool(toolType);
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
    setActiveTool,
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
    { keys: ['1'], description: 'Color tool' },
    { keys: ['2'], description: 'Symbol tool' },
    { keys: ['3'], description: 'Legend' },
    { keys: ['4'], description: 'Key Words' },
    { keys: ['5'], description: 'Study Tools' },
    { keys: ['6'], description: 'Settings' },
    { keys: ['Esc'], description: 'Close modals/overlays' },
  ];
}
