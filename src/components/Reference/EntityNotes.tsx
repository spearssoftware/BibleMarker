import { useState, useEffect } from 'react';
import { useEntityNoteStore } from '@/stores/entityNoteStore';
import { useStudyStore } from '@/stores/studyStore';
import { Button, Textarea } from '@/components/shared';
import type { EntityNoteType, EntityNote } from '@/types';

interface EntityNotesProps {
  entityType: EntityNoteType;
  entitySlug: string;
  entityName: string;
}

export function EntityNotes({ entityType, entitySlug, entityName }: EntityNotesProps) {
  const { notes, loadNotes, getNotesForEntity, createNote, updateNote, deleteNote } = useEntityNoteStore();
  const { activeStudyId } = useStudyStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState('');

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const entityNotes = getNotesForEntity(entitySlug, activeStudyId ?? undefined);

  const handleSave = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    if (editingId) {
      const existing = notes.find((n) => n.id === editingId);
      if (existing) {
        await updateNote({ ...existing, content: trimmed });
      }
      setEditingId(null);
    } else {
      await createNote({
        entityType,
        entitySlug,
        entityName,
        content: trimmed,
        studyId: activeStudyId ?? undefined,
      });
      setIsAdding(false);
    }
    setContent('');
  };

  const handleEdit = (note: EntityNote) => {
    setEditingId(note.id);
    setContent(note.content);
    setIsAdding(false);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setContent('');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-scripture-text">Your Notes</h3>
        {!isAdding && !editingId && (
          <button
            onClick={() => { setIsAdding(true); setContent(''); }}
            className="text-xs text-scripture-accent hover:underline"
          >
            + Add Note
          </button>
        )}
      </div>

      {entityNotes.length === 0 && !isAdding && (
        <p className="text-xs text-scripture-muted">No notes yet.</p>
      )}

      <div className="space-y-2">
        {entityNotes.map((note) =>
          editingId === note.id ? (
            <NoteForm
              key={note.id}
              content={content}
              onChange={setContent}
              onSave={handleSave}
              onCancel={handleCancel}
              saveLabel="Update"
            />
          ) : (
            <div
              key={note.id}
              className="p-2 rounded bg-scripture-elevated text-sm text-scripture-text"
            >
              <p className="whitespace-pre-wrap">{note.content}</p>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => handleEdit(note)}
                  className="text-xs text-scripture-muted hover:text-scripture-text"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="text-xs text-scripture-muted hover:text-scripture-error"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}

        {isAdding && (
          <NoteForm
            content={content}
            onChange={setContent}
            onSave={handleSave}
            onCancel={handleCancel}
            saveLabel="Save"
          />
        )}
      </div>
    </div>
  );
}

function NoteForm({
  content,
  onChange,
  onSave,
  onCancel,
  saveLabel,
}: {
  content: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="space-y-2">
      <Textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your note..."
        rows={3}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={onSave} disabled={!content.trim()}>
          {saveLabel}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
