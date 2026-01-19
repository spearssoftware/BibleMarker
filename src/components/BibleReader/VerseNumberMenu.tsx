/**
 * Verse Number Menu Component
 * 
 * Shows options when clicking on a verse number: add section heading or note.
 */

interface VerseNumberMenuProps {
  verseNum: number;
  onAddHeading: () => void;
  onAddNote: () => void;
  onClose: () => void;
}

export function VerseNumberMenu({ 
  verseNum,
  onAddHeading,
  onAddNote,
  onClose 
}: VerseNumberMenuProps) {
  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* Menu */}
      <div className="absolute top-full left-0 mt-1 z-50 bg-scripture-surface border border-scripture-border/50 rounded-xl shadow-2xl overflow-hidden animate-scale-in min-w-[200px] backdrop-blur-sm">
        <div className="p-2 space-y-1">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddHeading();
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                     transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                     hover:shadow-sm"
          >
            <span className="text-lg">📋</span>
            <span>Add Section Heading</span>
          </button>
          
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddNote();
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                     transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                     hover:shadow-sm"
          >
            <span className="text-lg">📝</span>
            <span>Add Note</span>
          </button>
        </div>
      </div>
    </>
  );
}
