/**
 * Note Creator Component
 * 
 * Inline form for creating a new note.
 */

import { useState } from 'react';
import { Button, Textarea } from '@/components/shared';

interface NoteCreatorProps {
  verseNum: number;
  range?: { startVerse: number; endVerse: number };
  onSave: (content: string) => void;
  onCancel: () => void;
}

export function NoteCreator({ 
  verseNum,
  range,
  onSave, 
  onCancel 
}: NoteCreatorProps) {
  const [content, setContent] = useState('');

  const handleSave = () => {
    if (content.trim()) {
      onSave(content.trim());
      setContent('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="note-creator my-3 p-3 rounded-xl bg-scripture-elevated/50 border border-scripture-border/50 animate-scale-in" role="dialog" aria-label={`Create note for verse ${verseNum}${range ? ` (verses ${range.startVerse}-${range.endVerse})` : ''}`}>
      <div className="flex items-start gap-2">
        <span className="text-scripture-accent text-sm font-ui font-semibold mt-1" aria-hidden="true">📝</span>
        <div className="flex-1 min-w-0">
          <Textarea
            id={`note-textarea-${verseNum}`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full min-h-[80px]"
            placeholder="Enter your note... (Cmd/Ctrl+Enter to save)"
            autoFocus
            aria-label="Note content"
          />
        </div>
      </div>
      {range && (
        <p className="text-scripture-muted text-xs font-ui mt-2 ml-6" role="note" aria-live="polite">
          Note will cover verses {range.startVerse}-{range.endVerse}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onCancel} aria-label="Cancel creating note">Cancel</Button>
        <Button onClick={handleSave} disabled={!content.trim()} aria-label="Save note">Save</Button>
      </div>
    </div>
  );
}
