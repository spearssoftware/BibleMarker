/**
 * @vitest-environment jsdom
 *
 * Regression tests for the note editor closing immediately after opening.
 *
 * MultiTranslationView re-keys the verse container (layoutKey) after window
 * resizes and panel changes, which remounts every child. When NoteEditor kept
 * its editing state locally, that remount wiped the state and the editor
 * closed the instant it opened (on mobile, focusing the textarea shows the
 * on-screen keyboard, which fires a resize). The editing state is now lifted
 * to the parent via the isEditing/onEditingChange props.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteEditor } from '../NoteEditor';
import type { Note } from '@/types';

afterEach(cleanup);

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    moduleId: 'kjv',
    ref: { book: 'JHN', chapter: 3, verse: 16 },
    content: 'For God so loved the world',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Mimics MultiTranslationView: editing state lives in the parent, and the
 * subtree containing NoteEditor is re-keyed (remounted) on layout changes.
 */
function Harness({ note, layoutKey = 0, onSave, onDelete }: {
  note: Note;
  layoutKey?: number;
  onSave?: (n: Note) => void;
  onDelete?: (id: string) => void;
}) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  return (
    <div>
      <div key={layoutKey}>
        <NoteEditor
          note={note}
          verseNum={note.ref.verse}
          book={note.ref.book}
          chapter={note.ref.chapter}
          isEditing={editingNoteId === note.id}
          onEditingChange={(editing) => setEditingNoteId(editing ? note.id : null)}
          onSave={onSave}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

describe('NoteEditor', () => {
  it('opens the editor when the note is clicked', async () => {
    const user = userEvent.setup();
    render(<Harness note={makeNote()} />);

    await user.click(screen.getByText('For God so loved the world'));

    expect(screen.getByPlaceholderText('Enter your note...')).toBeTruthy();
  });

  it('stays open when the parent re-keys (remounts) the subtree', async () => {
    const user = userEvent.setup();
    const note = makeNote();
    const onDelete = vi.fn();
    const { rerender } = render(<Harness note={note} layoutKey={0} onDelete={onDelete} />);

    await user.click(screen.getByText('For God so loved the world'));
    expect(screen.getByPlaceholderText('Enter your note...')).toBeTruthy();

    // Simulate the resize/panel-change re-key that remounts the editor
    // (a resize fires no blur, so the editor must simply survive the remount)
    rerender(<Harness note={note} layoutKey={1} onDelete={onDelete} />);

    expect(screen.getByPlaceholderText('Enter your note...')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('saves edited content and closes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness note={makeNote()} onSave={onSave} />);

    await user.click(screen.getByText('For God so loved the world'));
    const textarea = screen.getByPlaceholderText('Enter your note...');
    await user.clear(textarea);
    await user.type(textarea, 'Updated note');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].content).toBe('Updated note');
    expect(screen.queryByPlaceholderText('Enter your note...')).toBeNull();
  });

  it('deletes the note and closes', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<Harness note={makeNote()} onDelete={onDelete} />);

    await user.click(screen.getByText('For God so loved the world'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith('note-1');
    expect(screen.queryByPlaceholderText('Enter your note...')).toBeNull();
  });

  it('still works uncontrolled (no isEditing prop)', async () => {
    const user = userEvent.setup();
    const note = makeNote();
    render(
      <NoteEditor
        note={note}
        verseNum={note.ref.verse}
        book={note.ref.book}
        chapter={note.ref.chapter}
      />
    );

    await user.click(screen.getByText('For God so loved the world'));
    expect(screen.getByPlaceholderText('Enter your note...')).toBeTruthy();
  });
});
