/**
 * Verse Number Menu Component
 * 
 * Shows options when clicking on a verse number: add section heading or note.
 */

interface VerseNumberMenuProps {
  verseNum: number;
  onAddHeading?: () => void;
  onAddNote: () => void;
  onAddTimeExpression: () => void;
  onClose: () => void;
}

export function VerseNumberMenu({ 
  verseNum,
  onAddHeading,
  onAddNote,
  onAddTimeExpression,
  onClose 
}: VerseNumberMenuProps) {
  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Menu */}
      <div 
        className="absolute top-full left-0 mt-1 z-50 bg-scripture-surface border border-scripture-border/50 rounded-xl shadow-2xl overflow-hidden animate-scale-in-dropdown min-w-[200px]"
        role="menu"
        aria-label={`Options for verse ${verseNum}`}
      >
        <div className="p-2 space-y-1">
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
        </div>
      </div>
    </>
  );
}
