/**
 * Section Heading Editor
 * 
 * Displays and allows editing of user-created section headings.
 */

import { useState, useEffect } from 'react';
import type { SectionHeading } from '@/types/annotation';

interface SectionHeadingEditorProps {
  heading: SectionHeading;
  verseNum: number;
  onSave?: (heading: SectionHeading) => void;
  onDelete?: (id: string) => void;
}

export function SectionHeadingEditor({ 
  heading, 
  onSave, 
  onDelete 
}: SectionHeadingEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(heading.title);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync editText when heading prop changes (but not while editing)
  useEffect(() => {
    if (!isEditing) {
      setEditText(heading.title);
    }
  }, [heading.title, isEditing]);

  const handleSave = () => {
    // Don't save if we're deleting
    if (isDeleting) {
      setIsDeleting(false);
      return;
    }
    if (editText.trim() && onSave) {
      onSave({
        ...heading,
        title: editText.trim(),
        updatedAt: new Date(),
      });
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (onDelete) {
      setIsDeleting(true);
      onDelete(heading.id);
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditText(heading.title);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="section-heading my-4 flex items-center gap-2">
        <input
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="flex-1 bg-scripture-elevated border border-scripture-border rounded px-3 py-2
                     text-scripture-text font-ui text-sm focus:outline-none focus:border-scripture-accent"
          placeholder="Enter section heading..."
          autoFocus
        />
        <button
          onClick={handleSave}
          className="p-2 text-scripture-accent hover:bg-scripture-elevated rounded"
        >
          ✓
        </button>
        {onDelete && (
          <button
            onClick={handleDelete}
            onMouseDown={(e) => {
              // Prevent input blur from firing before delete
              e.preventDefault();
            }}
            className="p-2 text-highlight-red hover:bg-scripture-elevated rounded"
          >
            ✗
          </button>
        )}
      </div>
    );
  }

  return (
    <h3 
      className="section-heading my-3 py-1.5 text-scripture-text/80 font-ui text-base font-medium
                 border-b border-scripture-border/50 cursor-pointer hover:text-scripture-text
                 hover:border-scripture-accent/50 transition-all duration-200 italic"
      onClick={() => setIsEditing(true)}
      title="Click to edit"
    >
      {heading.title}
    </h3>
  );
}
