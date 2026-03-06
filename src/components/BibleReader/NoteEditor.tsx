/**
 * Note Editor Component
 * 
 * Displays and allows editing of user-created notes.
 */

import { useState, useEffect } from 'react';
import type { Note } from '@/types';
import { Button, Textarea } from '@/components/shared';

interface NoteEditorProps {
  note: Note;
  verseNum: number;
  book: string;
  chapter: number;
  onSave?: (note: Note) => void;
  onDelete?: (id: string) => void;
}

export function NoteEditor({ 
  note, 
  onSave, 
  onDelete 
}: NoteEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync editContent when note prop changes (but not while editing)
  useEffect(() => {
    if (!isEditing) {
      queueMicrotask(() => setEditContent(note.content));
    }
  }, [note.content, isEditing]);

  const handleSave = () => {
    // Don't save if we're deleting
    if (isDeleting) {
      setIsDeleting(false);
      return;
    }
    if (editContent.trim() && onSave) {
      onSave({
        ...note,
        content: editContent.trim(),
        updatedAt: new Date(),
      });
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (onDelete) {
      setIsDeleting(true);
      onDelete(note.id);
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditContent(note.content);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="note-editor my-3 p-3 rounded-xl bg-scripture-elevated/50 border border-scripture-border/50">
        <div className="flex items-start gap-2">
          <span className="text-scripture-accent text-sm font-ui font-semibold mt-1">📝</span>
          <div className="flex-1 min-w-0">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="w-full min-h-[80px]"
              placeholder="Enter your note..."
              autoFocus
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-2">
          {onDelete && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              onMouseDown={(e) => {
                // Prevent textarea blur from firing before delete
                e.preventDefault();
              }}
            >
              Delete
            </Button>
          )}
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="note-display my-3 p-3 rounded-xl bg-scripture-elevated/50 border border-scripture-border/50
                 cursor-pointer hover:bg-scripture-elevated transition-colors"
      onClick={() => setIsEditing(true)}
      title="Click to edit"
    >
      <div className="flex items-start gap-2">
        <span className="text-scripture-accent text-sm font-ui font-semibold mt-0.5">📝</span>
        <div className="flex-1">
          <p className="text-scripture-text text-sm font-ui whitespace-pre-wrap leading-relaxed">
            {note.content}
          </p>
        </div>
      </div>
    </div>
  );
}
