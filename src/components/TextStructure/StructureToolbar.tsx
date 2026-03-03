/**
 * Structure Toolbar
 *
 * Actions for the currently focused structure: Reset (re-run auto-suggest) and Delete.
 * Also shows a collapsible conjunction category legend.
 */

import { useState } from 'react';
import { Button } from '@/components/shared';
import type { ConjunctionCategory } from '@/types';

const LEGEND: { category: ConjunctionCategory; label: string; color: string }[] = [
  { category: 'time', label: 'Time', color: 'bg-scripture-info/20 text-scripture-info' },
  { category: 'reason', label: 'Reason', color: 'bg-scripture-warning/20 text-scripture-warning' },
  { category: 'result', label: 'Result', color: 'bg-scripture-accent/20 text-scripture-accent' },
  { category: 'contrast', label: 'Contrast', color: 'bg-scripture-error/20 text-scripture-error' },
  { category: 'purpose', label: 'Purpose', color: 'bg-pink-500/20 text-pink-700 dark:text-pink-400' },
  { category: 'condition', label: 'Condition', color: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400' },
  { category: 'concession', label: 'Concession', color: 'bg-orange-500/20 text-orange-700 dark:text-orange-400' },
  { category: 'continuation', label: 'Continuation', color: 'bg-scripture-muted/20 text-scripture-muted' },
  { category: 'comparison', label: 'Comparison', color: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-400' },
  { category: 'explanation', label: 'Explanation', color: 'bg-purple-500/20 text-purple-700 dark:text-purple-400' },
  { category: 'emphatic', label: 'Emphatic', color: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' },
  { category: 'place', label: 'Place', color: 'bg-green-500/20 text-green-700 dark:text-green-400' },
];

interface StructureToolbarProps {
  startVerse: number;
  endVerse: number;
  onReset: () => void;
  onDelete: () => void;
}

export function StructureToolbar({ startVerse, endVerse, onReset, onDelete }: StructureToolbarProps) {
  const [showLegend, setShowLegend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  function handleReset() {
    if (confirmReset) {
      onReset();
      setConfirmReset(false);
    } else {
      setConfirmReset(true);
      setConfirmDelete(false);
    }
  }

  function handleDelete() {
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setConfirmReset(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-2 border-b border-scripture-border/30 bg-scripture-elevated/50">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-ui font-medium text-scripture-muted">
          Verses {startVerse}–{endVerse}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setShowLegend(v => !v); setConfirmDelete(false); setConfirmReset(false); }}
            className="text-xs text-scripture-muted hover:text-scripture-text px-2 py-1 rounded
                       hover:bg-scripture-elevated transition-colors"
            title="Show conjunction legend"
          >
            Legend
          </button>

          {confirmReset ? (
            <>
              <span className="text-xs text-scripture-muted">Reset structure?</span>
              <Button size="sm" variant="secondary" onClick={() => setConfirmReset(false)}>No</Button>
              <Button size="sm" variant="ghost" onClick={handleReset}>Yes, Reset</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={handleReset}>Reset</Button>
          )}

          {confirmDelete ? (
            <>
              <span className="text-xs text-scripture-muted">Delete?</span>
              <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>No</Button>
              <Button size="sm" variant="destructive" onClick={handleDelete}>Yes, Delete</Button>
            </>
          ) : (
            <Button size="sm" variant="destructive" onClick={handleDelete}>Delete</Button>
          )}
        </div>
      </div>

      {showLegend && (
        <div className="flex flex-wrap gap-1.5 py-1">
          {LEGEND.map(({ category, label, color }) => (
            <span key={category} className={`text-[10px] font-ui font-semibold px-1.5 py-0.5 rounded ${color}`}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
