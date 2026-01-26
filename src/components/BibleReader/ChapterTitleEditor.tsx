/**
 * Chapter Title Editor Component
 * 
 * Displays and allows editing of user-created chapter titles.
 */

import { useState, useEffect } from 'react';
import type { ChapterTitle } from '@/types/annotation';

interface ChapterTitleEditorProps {
  title: ChapterTitle;
  onSave?: (title: ChapterTitle) => void;
  onDelete?: (id: string) => void;
}

export function ChapterTitleEditor({ 
  title, 
  onSave, 
  onDelete 
}: ChapterTitleEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(title.title);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync editText when title prop changes (but not while editing)
  useEffect(() => {
    if (!isEditing) {
      setEditText(title.title);
    }
  }, [title.title, isEditing]);

  const handleSave = () => {
    // Don't save if we're deleting
    if (isDeleting) {
      setIsDeleting(false);
      return;
    }
    if (editText.trim() && onSave) {
      const newTitle = editText.trim();
      const updatedTitle: ChapterTitle = {
        ...title,
        title: newTitle,
        updatedAt: new Date(),
      };
      
      // If theme matches the old title, sync it to the new title
      if (title.theme === title.title) {
        updatedTitle.theme = newTitle;
      }
      
      onSave(updatedTitle);
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (onDelete) {
      setIsDeleting(true);
      onDelete(title.id);
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditText(title.title);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="chapter-title-editor mb-4 flex items-center gap-2">
        <input
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="flex-1 bg-scripture-elevated border border-scripture-border rounded px-3 py-2
                     text-scripture-text font-ui text-base focus:outline-none focus:border-scripture-accent"
          placeholder="Enter chapter title..."
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
    <div 
      className="chapter-title py-3 px-4 font-ui text-2xl font-bold text-scripture-accent cursor-pointer 
                 transition-all duration-200 flex items-center justify-center group relative
                 bg-transparent"
      onClick={() => setIsEditing(true)}
      title="Click to edit"
    >
      <span className="tracking-wide">{title.title}</span>
      <span className="absolute right-4 text-xs text-scripture-muted opacity-0 group-hover:opacity-100 transition-opacity font-normal">
        Edit
      </span>
    </div>
  );
}
