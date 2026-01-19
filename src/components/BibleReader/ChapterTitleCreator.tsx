/**
 * Chapter Title Creator Component
 * 
 * Inline form for creating a new chapter title.
 */

import { useState, useRef, useEffect } from 'react';

interface ChapterTitleCreatorProps {
  onSave: (title: string) => void;
  onCancel: () => void;
}

export function ChapterTitleCreator({ 
  onSave, 
  onCancel 
}: ChapterTitleCreatorProps) {
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the input when component mounts
    inputRef.current?.focus();
  }, []);

  const handleSave = () => {
    if (editText.trim()) {
      onSave(editText.trim());
      setEditText('');
    } else {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditText('');
      onCancel();
    }
  };

  return (
    <div className="chapter-title-creator py-3 px-4 flex items-center justify-center gap-2 animate-slide-up">
      <input
        ref={inputRef}
        type="text"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className="text-center bg-transparent border-none outline-none px-3 py-2
                   text-scripture-accent font-ui text-2xl font-bold tracking-wide 
                   focus:outline-none placeholder:text-scripture-muted/50"
        placeholder="Enter chapter title..."
      />
      <button
        onClick={handleSave}
        className="p-2 text-scripture-accent hover:bg-scripture-accent/20 rounded-lg transition-colors"
        title="Save (Enter)"
      >
        ✓
      </button>
      <button
        onClick={onCancel}
        className="p-2 text-scripture-muted hover:bg-scripture-accent/20 rounded-lg transition-colors"
        title="Cancel (Esc)"
      >
        ✗
      </button>
    </div>
  );
}
