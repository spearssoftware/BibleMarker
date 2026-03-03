/**
 * Structure Editor
 *
 * Line-based editor for a single text structure.
 * Manages focused line state and debounced auto-save.
 */

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import type { TextStructure, StructureLine as StructureLineType } from '@/types';
import { detectConjunction } from '@/lib/conjunction-parser';
import { StructureLine } from './StructureLine';
import { StructureToolbar } from './StructureToolbar';

const MAX_INDENT = 5;
const AUTOSAVE_DEBOUNCE_MS = 500;

interface StructureEditorProps {
  structure: TextStructure;
  onUpdate: (updated: TextStructure) => Promise<void>;
  onDelete: () => void;
  onReset: () => void;
}

export function StructureEditor({ structure, onUpdate, onDelete, onReset }: StructureEditorProps) {
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStructureRef = useRef(structure);

  // Keep ref up-to-date without triggering render-cycle issues
  useLayoutEffect(() => {
    latestStructureRef.current = structure;
  });

  // Flush save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function scheduleSave(updated: TextStructure) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onUpdate(updated).catch(err => console.error('[StructureEditor] Save failed:', err));
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function updateLines(lines: StructureLineType[]) {
    const updated = { ...latestStructureRef.current, lines };
    // Immediate optimistic update + debounced persist
    onUpdate(updated);
    scheduleSave(updated);
  }

  function handleChange(lineId: string, text: string) {
    const lines = latestStructureRef.current.lines.map(l =>
      l.id === lineId
        ? { ...l, text, conjunction: detectConjunction(text) }
        : l
    );
    updateLines(lines);
  }

  function handleIndent(lineId: string, delta: number) {
    const lines = latestStructureRef.current.lines.map(l =>
      l.id === lineId
        ? { ...l, indent: Math.max(0, Math.min(MAX_INDENT, l.indent + delta)) }
        : l
    );
    updateLines(lines);
  }

  function handleSplit(lineId: string, cursorPos: number) {
    const current = latestStructureRef.current;
    const idx = current.lines.findIndex(l => l.id === lineId);
    if (idx === -1) return;
    const line = current.lines[idx];
    const before = line.text.slice(0, cursorPos);
    const after = line.text.slice(cursorPos);
    const newLine: StructureLineType = {
      id: crypto.randomUUID(),
      text: after,
      indent: line.indent,
      verseNumber: line.verseNumber,
      sourceOffset: line.sourceOffset + cursorPos,
      conjunction: detectConjunction(after),
      order: line.order + 0.5,
    };
    const lines = [
      ...current.lines.slice(0, idx),
      { ...line, text: before },
      newLine,
      ...current.lines.slice(idx + 1),
    ].map((l, i) => ({ ...l, order: i }));
    updateLines(lines);
    setTimeout(() => setFocusedLineId(newLine.id), 10);
  }

  function handleMergeWithPrev(lineId: string) {
    const current = latestStructureRef.current;
    const idx = current.lines.findIndex(l => l.id === lineId);
    if (idx <= 0) return;
    const prev = current.lines[idx - 1];
    const curr = current.lines[idx];
    const merged = { ...prev, text: prev.text + curr.text };
    const lines = [
      ...current.lines.slice(0, idx - 1),
      merged,
      ...current.lines.slice(idx + 1),
    ].map((l, i) => ({ ...l, order: i }));
    updateLines(lines);
    setFocusedLineId(prev.id);
  }

  function handleMergeWithNext(lineId: string) {
    const current = latestStructureRef.current;
    const idx = current.lines.findIndex(l => l.id === lineId);
    if (idx >= current.lines.length - 1) return;
    const curr = current.lines[idx];
    const next = current.lines[idx + 1];
    const merged = { ...curr, text: curr.text + next.text };
    const lines = [
      ...current.lines.slice(0, idx),
      merged,
      ...current.lines.slice(idx + 2),
    ].map((l, i) => ({ ...l, order: i }));
    updateLines(lines);
    setFocusedLineId(curr.id);
  }

  const sortedLines = [...structure.lines].sort((a, b) => a.order - b.order);

  return (
    <div className="border border-scripture-border/40 rounded-lg overflow-hidden mb-4 bg-scripture-surface">
      <StructureToolbar
        startVerse={structure.startVerse}
        endVerse={structure.endVerse}
        onReset={onReset}
        onDelete={onDelete}
      />
      <div className="px-2 py-3 space-y-0.5">
        {sortedLines.map((line, idx) => (
          <StructureLine
            key={line.id}
            line={line}
            isFirst={idx === 0}
            prevLine={idx > 0 ? sortedLines[idx - 1] : null}
            isFocused={focusedLineId === line.id}
            onFocus={() => setFocusedLineId(line.id)}
            onBlur={() => setFocusedLineId(id => id === line.id ? null : id)}
            onChange={text => handleChange(line.id, text)}
            onIndent={delta => handleIndent(line.id, delta)}
            onSplit={pos => handleSplit(line.id, pos)}
            onMergeWithPrev={() => handleMergeWithPrev(line.id)}
            onMergeWithNext={() => handleMergeWithNext(line.id)}
          />
        ))}
        {sortedLines.length === 0 && (
          <p className="text-sm text-scripture-muted text-center py-4">No lines yet.</p>
        )}
      </div>
    </div>
  );
}
