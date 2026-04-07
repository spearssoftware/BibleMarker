/**
 * Verse Number Menu Component
 *
 * Bottom sheet that appears when clicking on a verse number.
 * Shows options: add section heading, note, or time expression.
 */

import { useRef } from 'react';

interface VerseNumberMenuProps {
  verseNum: number;
  onAddHeading?: () => void;
  onAddNote: () => void;
  onAddObservation: () => void;
  onAddTimeExpression: () => void;
  onCrossRefs: () => void;
  onOriginalLanguage: () => void;
  onClose: () => void;
}

export function VerseNumberMenu({
  verseNum,
  onAddHeading,
  onAddNote,
  onAddObservation,
  onAddTimeExpression,
  onCrossRefs,
  onOriginalLanguage,
  onClose
}: VerseNumberMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <div
        ref={menuRef}
        className="fixed z-50 bottom-0 left-0 right-0 bg-scripture-surface shadow-2xl overflow-visible
                   rounded-t-2xl animate-slide-up-sheet pb-safe-bottom
                   sm:left-1/2 sm:-translate-x-1/2 sm:max-w-[400px]"
        role="menu"
        aria-label={`Options for verse ${verseNum}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 bg-scripture-border/50 rounded-full" />
        </div>
        {/* Verse chip */}
        <div className="px-4 pb-2 flex justify-center">
          <span className="inline-block px-3 py-1 rounded-full bg-scripture-accent/15 text-scripture-accent text-sm font-ui font-semibold">
            Verse {verseNum}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <div className="p-2 space-y-1 px-4 pb-4">
            {onAddHeading && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAddHeading();
                  onClose();
                }}
                className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                         transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                         hover:shadow-sm text-scripture-text"
                role="menuitem"
                aria-label={`Add section heading before verse ${verseNum}`}
              >
                <span className="text-lg" aria-hidden="true">📋</span>
                <span>Add Section Heading</span>
              </button>
            )}

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddNote();
                onClose();
              }}
              className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                       transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                       hover:shadow-sm text-scripture-text"
              role="menuitem"
              aria-label={`Add note to verse ${verseNum}`}
            >
              <span className="text-lg" aria-hidden="true">📝</span>
              <span>Add Note</span>
            </button>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddObservation();
                onClose();
              }}
              className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                       transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                       hover:shadow-sm text-scripture-text"
              role="menuitem"
              aria-label={`Add observation for verse ${verseNum}`}
            >
              <span className="text-lg" aria-hidden="true">🔍</span>
              <span>Add Observation</span>
            </button>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddTimeExpression();
                onClose();
              }}
              className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                       transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                       hover:shadow-sm text-scripture-text"
              role="menuitem"
              aria-label={`Add time expression for verse ${verseNum}`}
            >
              <span className="text-lg" aria-hidden="true">🕐</span>
              <span>Add Time Expression</span>
            </button>

            {/* Reference tools */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCrossRefs();
                onClose();
              }}
              className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                       transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                       hover:shadow-sm text-scripture-text"
              role="menuitem"
              aria-label={`Cross-references for verse ${verseNum}`}
            >
              <span className="text-lg" aria-hidden="true">🔗</span>
              <span>Cross-References</span>
            </button>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOriginalLanguage();
                onClose();
              }}
              className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                       transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                       hover:shadow-sm text-scripture-text"
              role="menuitem"
              aria-label={`Hebrew/Greek for verse ${verseNum}`}
            >
              <span className="text-lg" aria-hidden="true">א</span>
              <span>Hebrew/Greek</span>
            </button>

            {/* Divider */}
            <div className="border-t border-scripture-border/30 my-1" />

            {/* Cancel */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                       transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                       hover:shadow-sm text-scripture-text"
              role="menuitem"
              aria-label="Cancel"
            >
              <span>Cancel</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
