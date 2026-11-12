import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityNote } from '@/types';

vi.mock('@/lib/database', () => ({
  getAllEntityNotes: vi.fn(async () => []),
  saveEntityNote: vi.fn(async () => {}),
  deleteEntityNote: vi.fn(async () => {}),
}));

import { useEntityNoteStore } from '../entityNoteStore';

const note = (id: string, entitySlug: string, studyId?: string): EntityNote => ({
  id,
  entityType: 'person',
  entitySlug,
  entityName: entitySlug,
  content: id,
  studyId,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

describe('entityNoteStore.getNotesForEntity', () => {
  beforeEach(() => {
    useEntityNoteStore.setState({
      notes: [
        note('none', 'david'),
        note('one', 'david', 'study-1'),
        note('two', 'david', 'study-2'),
        note('other', 'saul', 'study-1'),
      ],
    });
  });

  const ids = (studyId?: string) =>
    useEntityNoteStore.getState().getNotesForEntity('david', studyId).map(n => n.id);

  it('returns only notes with no study when no study is in effect', () => {
    expect(ids()).toEqual(['none']);
  });

  it('returns notes with no study plus the effective study\'s notes', () => {
    expect(ids('study-1')).toEqual(['none', 'one']);
  });
});
