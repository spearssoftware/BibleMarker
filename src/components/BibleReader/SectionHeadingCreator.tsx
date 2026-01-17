/**
 * Section Heading Creator Component
 * 
 * Inline form for creating a new section heading.
 */

import { useState, useRef, useEffect } from 'react';

interface SectionHeadingCreatorProps {
  verseNum: number;
  onSave: (title: string) => void;
  onCancel: () => void;
}

export function SectionHeadingCreator({ 
  verseNum,
  onSave, 
  onCancel 
}: SectionHeadingCreatorProps) {
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
    <div className="section-heading-creator my-3 flex items-center gap-2 animate-slide-up border-b border-scripture-border/60">
      <input
        ref={inputRef}
        type="text"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className="flex-1 bg-scripture-elevated border border-scripture-border/50 rounded px-3 py-1.5
                   text-scripture-text/80 font-ui text-base font-medium italic
                   focus:outline-none focus:border-scripture-accent focus:text-scripture-text"
        placeholder="Enter section heading..."
      />
      <button
        onClick={handleSave}
        className="p-2 text-scripture-accent hover:bg-scripture-elevated rounded transition-colors"
        title="Save (Enter)"
      >
        ✓
      </button>
      <button
        onClick={onCancel}
        className="p-2 text-scripture-muted hover:bg-scripture-elevated rounded transition-colors"
        title="Cancel (Esc)"
      >
        ✗
      </button>
    </div>
  );
}
