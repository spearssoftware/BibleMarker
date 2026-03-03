/**
 * Structure Line
 *
 * A single line in the text structure editor.
 * Supports keyboard indent (Tab/Shift+Tab, Enter, Backspace, Delete)
 * and swipe-based indent on touch devices.
 */

import { useRef, useEffect, useCallback } from 'react';
import type { StructureLine as StructureLineType } from '@/types';
import type { ConjunctionCategory } from '@/types';

const CATEGORY_COLORS: Record<ConjunctionCategory, string> = {
  time: 'bg-scripture-info/20 text-scripture-info',
  place: 'bg-green-500/20 text-green-700 dark:text-green-400',
  reason: 'bg-scripture-warning/20 text-scripture-warning',
  result: 'bg-scripture-accent/20 text-scripture-accent',
  explanation: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  purpose: 'bg-pink-500/20 text-pink-700 dark:text-pink-400',
  contrast: 'bg-scripture-error/20 text-scripture-error',
  comparison: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-400',
  continuation: 'bg-scripture-muted/20 text-scripture-muted',
  concession: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
  condition: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400',
  emphatic: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
};

interface StructureLineProps {
  line: StructureLineType;
  isFirst: boolean;
  prevLine: StructureLineType | null;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (text: string) => void;
  onIndent: (delta: number) => void;
  onSplit: (cursorPos: number) => void;
  onMergeWithPrev: () => void;
  onMergeWithNext: () => void;
}

export function StructureLine({
  line,
  isFirst,
  prevLine,
  isFocused,
  onFocus,
  onBlur,
  onChange,
  onIndent,
  onSplit,
  onMergeWithPrev,
  onMergeWithNext,
}: StructureLineProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [line.text, isFocused]);

  // Focus when this line becomes active
  useEffect(() => {
    if (isFocused && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isFocused]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;

    if (e.key === 'Tab') {
      e.preventDefault();
      onIndent(e.shiftKey ? -1 : 1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      onSplit(el.selectionStart);
      return;
    }

    if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault();
      onMergeWithPrev();
      return;
    }

    if (e.key === 'Delete' && el.selectionStart === el.value.length && el.selectionEnd === el.value.length) {
      e.preventDefault();
      onMergeWithNext();
      return;
    }
  }, [onIndent, onSplit, onMergeWithPrev, onMergeWithNext]);

  // Swipe handling for touch indent
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = Math.abs(touch.clientY - touchStartY.current);

    // Ignore if mostly vertical (scroll gesture) or too small
    if (dy > 30 || Math.abs(dx) < 40) {
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }

    // Right swipe = indent+1, left swipe = indent-1
    onIndent(dx > 0 ? 1 : -1);
    touchStartX.current = null;
    touchStartY.current = null;
  }, [onIndent]);

  const showVerseLabel = isFirst || (prevLine !== null && prevLine.verseNumber !== line.verseNumber);
  const indentPx = line.indent * 32; // 2rem per level

  return (
    <div
      className="flex items-start gap-2 group"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Verse number label */}
      <span
        className="text-xs text-scripture-muted font-ui flex-shrink-0 pt-1.5 w-6 text-right"
        style={{ opacity: showVerseLabel ? 1 : 0 }}
      >
        {line.verseNumber}
      </span>

      {/* Indent spacer + content */}
      <div className="flex-1 flex items-start" style={{ paddingLeft: `${indentPx}px` }}>
        {/* Conjunction badge */}
        {line.conjunction && (
          <span
            className={`text-[10px] font-ui font-semibold px-1.5 py-0.5 rounded mr-1.5 flex-shrink-0 mt-1
                       ${CATEGORY_COLORS[line.conjunction.category]}`}
            title={line.conjunction.category}
          >
            {line.conjunction.word}
          </span>
        )}

        {isFocused ? (
          <textarea
            ref={textareaRef}
            value={line.text}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onBlur}
            rows={1}
            className="flex-1 resize-none font-mono text-sm bg-transparent outline-none
                       text-scripture-text leading-relaxed overflow-hidden w-full"
            style={{ minHeight: '1.5rem' }}
          />
        ) : (
          <span
            className="flex-1 font-mono text-sm text-scripture-text leading-relaxed cursor-text whitespace-pre-wrap break-words"
            onClick={onFocus}
          >
            {line.text || <span className="text-scripture-muted">Empty line</span>}
          </span>
        )}
      </div>
    </div>
  );
}
