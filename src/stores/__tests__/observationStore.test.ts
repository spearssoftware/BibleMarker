import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useObservationStore } from '@/stores/observationStore';
import { getAllFiveWAndH, saveFiveWAndH, deleteFiveWAndH } from '@/lib/database';
import { makeFiveWAndH, makeVerseRef } from '@/lib/__test__/factories';

vi.mock('@/lib/database');
vi.mock('@/lib/validation', () => ({
  sanitizeData: <T>(data: T) => data,
  validateFiveWAndH: () => true,
  ValidationError: class ValidationError extends Error {
    field?: string;
    value?: unknown;
    constructor(message: string, field?: string, value?: unknown) {
      super(message);
      this.name = 'ValidationError';
      this.field = field;
      this.value = value;
    }
  },
}));

describe('observationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useObservationStore.setState({ fiveWAndHEntries: [] });
  });

  describe('loadFiveWAndH', () => {
    it('populates state from DB', async () => {
      const entries = [makeFiveWAndH({ id: 'e1' }), makeFiveWAndH({ id: 'e2' })];
      vi.mocked(getAllFiveWAndH).mockResolvedValue(entries);

      await useObservationStore.getState().loadFiveWAndH();

      expect(useObservationStore.getState().fiveWAndHEntries).toEqual(entries);
    });
  });

  describe('createFiveWAndH', () => {
    it('generates UUID, saves to DB, appends to state', async () => {
      vi.mocked(saveFiveWAndH).mockResolvedValue('id');

      const result = await useObservationStore.getState().createFiveWAndH({
        verseRef: makeVerseRef(),
        who: 'God',
        what: 'created',
      });

      expect(result.id).toBeDefined();
      expect(result.who).toBe('God');
      expect(saveFiveWAndH).toHaveBeenCalled();
      expect(useObservationStore.getState().fiveWAndHEntries).toHaveLength(1);
    });
  });

  describe('updateFiveWAndH', () => {
    it('saves with new updatedAt and updates in state', async () => {
      const entry = makeFiveWAndH({ id: 'e1', who: 'Moses' });
      useObservationStore.setState({ fiveWAndHEntries: [entry] });
      vi.mocked(saveFiveWAndH).mockResolvedValue('e1');

      await useObservationStore.getState().updateFiveWAndH({ ...entry, who: 'Aaron' });

      expect(saveFiveWAndH).toHaveBeenCalled();
      expect(useObservationStore.getState().fiveWAndHEntries[0].who).toBe('Aaron');
    });
  });

  describe('deleteFiveWAndH', () => {
    it('removes from DB and state', async () => {
      useObservationStore.setState({
        fiveWAndHEntries: [makeFiveWAndH({ id: 'e1' })],
      });
      vi.mocked(deleteFiveWAndH).mockResolvedValue(undefined);

      await useObservationStore.getState().deleteFiveWAndH('e1');

      expect(deleteFiveWAndH).toHaveBeenCalledWith('e1');
      expect(useObservationStore.getState().fiveWAndHEntries).toHaveLength(0);
    });
  });

  describe('getFiveWAndHByVerse', () => {
    it('filters entries by verse ref', () => {
      const ref1 = makeVerseRef({ book: 'Gen', chapter: 1, verse: 1 });
      const ref2 = makeVerseRef({ book: 'Gen', chapter: 1, verse: 2 });
      useObservationStore.setState({
        fiveWAndHEntries: [
          makeFiveWAndH({ id: 'e1', verseRef: ref1 }),
          makeFiveWAndH({ id: 'e2', verseRef: ref2 }),
        ],
      });

      const result = useObservationStore.getState().getFiveWAndHByVerse(ref1);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('e1');
    });
  });

  describe('getFiveWAndHByChapter', () => {
    it('filters entries by book and chapter', () => {
      useObservationStore.setState({
        fiveWAndHEntries: [
          makeFiveWAndH({ id: 'e1', verseRef: makeVerseRef({ book: 'Gen', chapter: 1 }) }),
          makeFiveWAndH({ id: 'e2', verseRef: makeVerseRef({ book: 'Gen', chapter: 2 }) }),
          makeFiveWAndH({ id: 'e3', verseRef: makeVerseRef({ book: 'Exod', chapter: 1 }) }),
        ],
      });

      const result = useObservationStore.getState().getFiveWAndHByChapter('Gen', 1);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('e1');
    });
  });
});
