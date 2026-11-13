import { describe, it, expect, beforeEach } from 'vitest';
import { useSavedPositionStore } from '../savedPositionStore';

const merge = (persisted: unknown) => {
  const mergeFn = useSavedPositionStore.persist.getOptions().merge;
  if (!mergeFn) throw new Error('merge is not configured');
  return mergeFn(persisted, useSavedPositionStore.getState());
};

describe('savedPositionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSavedPositionStore.setState({ saved: null, pendingRestore: null });
  });

  it('ignores save while a restore is pending and stores it after settling', () => {
    const position = { book: 'John', chapter: 3, verse: 16 };
    useSavedPositionStore.setState({ saved: position, pendingRestore: position });

    useSavedPositionStore.getState().save('John', 3, 1);
    expect(useSavedPositionStore.getState().saved).toEqual(position);

    useSavedPositionStore.getState().settleRestore();
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();
    expect(useSavedPositionStore.getState().saved).toEqual(position);

    useSavedPositionStore.getState().save('John', 3, 20);
    expect(useSavedPositionStore.getState().saved).toEqual({ book: 'John', chapter: 3, verse: 20 });
  });

  it('clears the saved verse when settling with clear', () => {
    const position = { book: 'John', chapter: 3, verse: 99 };
    useSavedPositionStore.setState({ saved: position, pendingRestore: position });

    useSavedPositionStore.getState().settleRestore(true);

    expect(useSavedPositionStore.getState().saved).toBeNull();
    expect(useSavedPositionStore.getState().pendingRestore).toBeNull();
  });

  it('persists the saved verse but not the pending restore', () => {
    useSavedPositionStore.getState().save('John', 3, 16);

    const stored = JSON.parse(localStorage.getItem('saved-reading-position') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(stored.state).toEqual({ saved: { book: 'John', chapter: 3, verse: 16 } });
  });

  describe('merge', () => {
    it('keeps a valid record past verse 1 and marks it pending', () => {
      const saved = { book: 'John', chapter: 3, verse: 16 };
      const merged = merge({ saved });
      expect(merged.saved).toEqual(saved);
      expect(merged.pendingRestore).toEqual(saved);
    });

    it('keeps a verse 1 record without a pending restore', () => {
      const saved = { book: 'John', chapter: 3, verse: 1 };
      const merged = merge({ saved });
      expect(merged.saved).toEqual(saved);
      expect(merged.pendingRestore).toBeNull();
    });

    it.each([
      ['undefined persisted state', undefined],
      ['a non-numeric verse', { saved: { book: 'John', chapter: 3, verse: 'abc' } }],
      ['verse 0', { saved: { book: 'John', chapter: 3, verse: 0 } }],
      ['a negative verse', { saved: { book: 'John', chapter: 3, verse: -3 } }],
      ['a fractional verse', { saved: { book: 'John', chapter: 3, verse: 2.5 } }],
      ['a non-string book', { saved: { book: 43, chapter: 3, verse: 16 } }],
      ['chapter 0', { saved: { book: 'John', chapter: 0, verse: 16 } }],
    ])('drops %s', (_label, persisted) => {
      const merged = merge(persisted);
      expect(merged.saved).toBeNull();
      expect(merged.pendingRestore).toBeNull();
    });
  });
});
