import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveValidated,
  filterByExactVerse,
  filterByChapter,
  filterByBook,
  filterByStudy,
} from '@/stores/entityStoreHelpers';
import { ValidationError } from '@/lib/validation';
import type { VerseRef } from '@/types';

const ref = (book: string, chapter: number, verse: number): VerseRef => ({ book, chapter, verse });

interface Row {
  id: string;
  verseRef: VerseRef;
  studyId?: string;
}

const rows: Row[] = [
  { id: 'a', verseRef: ref('john', 3, 16), studyId: 's1' },
  { id: 'b', verseRef: ref('john', 3, 16), studyId: 's2' },
  { id: 'c', verseRef: ref('john', 3, 17) },
  { id: 'd', verseRef: ref('rom', 8, 28), studyId: 's1' },
];

describe('entityStoreHelpers query filters', () => {
  it('filterByExactVerse matches book+chapter+verse exactly', () => {
    expect(filterByExactVerse(rows, ref('john', 3, 16)).map(r => r.id)).toEqual(['a', 'b']);
    expect(filterByExactVerse(rows, ref('john', 3, 99))).toEqual([]);
  });

  it('filterByChapter matches book+chapter, any verse', () => {
    expect(filterByChapter(rows, 'john', 3).map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(filterByChapter(rows, 'rom', 8).map(r => r.id)).toEqual(['d']);
  });

  it('filterByBook matches book, any chapter/verse', () => {
    expect(filterByBook(rows, 'john').map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('filterByStudy matches studyId (and never undefined-scoped rows)', () => {
    expect(filterByStudy(rows, 's1').map(r => r.id)).toEqual(['a', 'd']);
    // A row with no studyId must not match any concrete study id.
    expect(filterByStudy(rows, 's2').map(r => r.id)).toEqual(['b']);
  });
});

describe('saveValidated', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('validates, saves, and returns the validated value', async () => {
    const entity = { id: '1', name: 'raw' };
    const validated = { id: '1', name: 'clean' };
    const validator = vi.fn(() => validated);
    const dbSave = vi.fn(async () => 'change-log-id');

    const result = await saveValidated(entity, validator, dbSave, { logPrefix: 'createThing', dataLabel: 'thing' });

    expect(validator).toHaveBeenCalledOnce();
    expect(dbSave).toHaveBeenCalledWith(validated);
    expect(result).toBe(validated);
  });

  it('maps a ValidationError to a friendly "Invalid <label> data" message and does not save', async () => {
    const validator = vi.fn(() => {
      throw new ValidationError('name is required', 'name', undefined);
    });
    const dbSave = vi.fn(async () => 'id');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      saveValidated({ id: '1' }, validator, dbSave, { logPrefix: 'createThing', dataLabel: 'thing' })
    ).rejects.toThrow('Invalid thing data: name is required');
    expect(dbSave).not.toHaveBeenCalled();
  });

  it('rethrows non-validation errors untouched', async () => {
    const boom = new Error('db offline');
    const validator = vi.fn((d: unknown) => d);
    const dbSave = vi.fn(async () => {
      throw boom;
    });

    await expect(
      saveValidated({ id: '1' }, validator, dbSave, { logPrefix: 'createThing', dataLabel: 'thing' })
    ).rejects.toBe(boom);
  });
});
