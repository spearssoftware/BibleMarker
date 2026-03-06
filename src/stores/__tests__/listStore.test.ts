import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useListStore } from '@/stores/listStore';
import {
  getAllObservationLists,
  saveObservationList,
  deleteObservationList,
} from '@/lib/database';
import { makeObservationList, makeObservationItem, makeVerseRef } from '@/lib/__test__/factories';

vi.mock('@/lib/database');
vi.mock('@/lib/validation', () => ({
  sanitizeData: <T>(data: T) => data,
  validateObservationList: () => true,
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

describe('listStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useListStore.setState({
      lists: [],
      lastUsedListId: null,
    });
  });

  describe('loadLists', () => {
    it('populates state from DB', async () => {
      const lists = [makeObservationList({ id: 'l1' }), makeObservationList({ id: 'l2' })];
      vi.mocked(getAllObservationLists).mockResolvedValue(lists);

      await useListStore.getState().loadLists();

      expect(useListStore.getState().lists).toHaveLength(2);
    });

    it('filters out lists without keyWordId', async () => {
      const lists = [
        makeObservationList({ id: 'l1', keyWordId: 'k1' }),
        { ...makeObservationList({ id: 'l2' }), keyWordId: '' },
      ];
      vi.mocked(getAllObservationLists).mockResolvedValue(lists);

      await useListStore.getState().loadLists();

      expect(useListStore.getState().lists).toHaveLength(1);
      expect(useListStore.getState().lists[0].id).toBe('l1');
    });

    it('cleans up invalid lists from DB', async () => {
      const lists = [
        makeObservationList({ id: 'l1', keyWordId: 'k1' }),
        { ...makeObservationList({ id: 'l2' }), keyWordId: '' },
      ];
      vi.mocked(getAllObservationLists).mockResolvedValue(lists);
      vi.mocked(deleteObservationList).mockResolvedValue(undefined);

      await useListStore.getState().loadLists();

      expect(deleteObservationList).toHaveBeenCalledWith('l2');
    });
  });

  describe('createList', () => {
    it('creates new list, saves to DB, appends to state', async () => {
      vi.mocked(getAllObservationLists).mockResolvedValue([]);
      vi.mocked(saveObservationList).mockResolvedValue('id');

      const result = await useListStore.getState().createList('Test', 'k1');

      expect(result.title).toBe('Test');
      expect(result.keyWordId).toBe('k1');
      expect(saveObservationList).toHaveBeenCalled();
      expect(useListStore.getState().lists).toHaveLength(1);
    });

    it('deduplicates by keyWordId and studyId', async () => {
      const existing = makeObservationList({ id: 'l1', keyWordId: 'k1', studyId: 's1' });
      vi.mocked(getAllObservationLists).mockResolvedValue([existing]);

      const result = await useListStore.getState().createList('Dup', 'k1', undefined, 's1');

      expect(result.id).toBe('l1');
      expect(saveObservationList).not.toHaveBeenCalled();
    });

    it('sets lastUsedListId to new list', async () => {
      vi.mocked(getAllObservationLists).mockResolvedValue([]);
      vi.mocked(saveObservationList).mockResolvedValue('id');

      const result = await useListStore.getState().createList('Test', 'k1');

      expect(useListStore.getState().lastUsedListId).toBe(result.id);
    });
  });

  describe('deleteList', () => {
    it('removes from DB and state', async () => {
      useListStore.setState({ lists: [makeObservationList({ id: 'l1' })] });
      vi.mocked(deleteObservationList).mockResolvedValue(undefined);

      await useListStore.getState().deleteList('l1');

      expect(deleteObservationList).toHaveBeenCalledWith('l1');
      expect(useListStore.getState().lists).toHaveLength(0);
    });

    it('clears lastUsedListId if matching', async () => {
      useListStore.setState({
        lists: [makeObservationList({ id: 'l1' })],
        lastUsedListId: 'l1',
      });
      vi.mocked(deleteObservationList).mockResolvedValue(undefined);

      await useListStore.getState().deleteList('l1');

      expect(useListStore.getState().lastUsedListId).toBeNull();
    });

    it('preserves lastUsedListId if not matching', async () => {
      useListStore.setState({
        lists: [makeObservationList({ id: 'l1' }), makeObservationList({ id: 'l2' })],
        lastUsedListId: 'l2',
      });
      vi.mocked(deleteObservationList).mockResolvedValue(undefined);

      await useListStore.getState().deleteList('l1');

      expect(useListStore.getState().lastUsedListId).toBe('l2');
    });
  });

  describe('addItemToList', () => {
    it('adds item to existing list', async () => {
      useListStore.setState({ lists: [makeObservationList({ id: 'l1', items: [] })] });
      vi.mocked(saveObservationList).mockResolvedValue('l1');

      await useListStore.getState().addItemToList('l1', {
        content: 'Observation',
        verseRef: makeVerseRef(),
      });

      const list = useListStore.getState().lists[0];
      expect(list.items).toHaveLength(1);
      expect(list.items[0].content).toBe('Observation');
    });

    it('sets lastUsedListId', async () => {
      useListStore.setState({ lists: [makeObservationList({ id: 'l1', items: [] })] });
      vi.mocked(saveObservationList).mockResolvedValue('l1');

      await useListStore.getState().addItemToList('l1', {
        content: 'Obs',
        verseRef: makeVerseRef(),
      });

      expect(useListStore.getState().lastUsedListId).toBe('l1');
    });

    it('does nothing for nonexistent list', async () => {
      await useListStore.getState().addItemToList('nonexistent', {
        content: 'Obs',
        verseRef: makeVerseRef(),
      });

      expect(saveObservationList).not.toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    it('updates item in list', async () => {
      const item = makeObservationItem({ id: 'i1', content: 'Original' });
      useListStore.setState({
        lists: [makeObservationList({ id: 'l1', items: [item] })],
      });
      vi.mocked(saveObservationList).mockResolvedValue('l1');

      await useListStore.getState().updateItem('l1', 'i1', { content: 'Updated' });

      const updated = useListStore.getState().lists[0].items[0];
      expect(updated.content).toBe('Updated');
    });
  });

  describe('deleteItem', () => {
    it('removes item from list', async () => {
      const item = makeObservationItem({ id: 'i1' });
      useListStore.setState({
        lists: [makeObservationList({ id: 'l1', items: [item] })],
      });
      vi.mocked(saveObservationList).mockResolvedValue('l1');

      await useListStore.getState().deleteItem('l1', 'i1');

      expect(useListStore.getState().lists[0].items).toHaveLength(0);
    });
  });

  describe('getList', () => {
    it('returns list by id', () => {
      const list = makeObservationList({ id: 'l1' });
      useListStore.setState({ lists: [list] });

      expect(useListStore.getState().getList('l1')).toEqual(list);
    });

    it('returns null for unknown id', () => {
      expect(useListStore.getState().getList('unknown')).toBeNull();
    });
  });

  describe('getListsByKeyword', () => {
    it('filters lists by keyWordId', () => {
      useListStore.setState({
        lists: [
          makeObservationList({ id: 'l1', keyWordId: 'k1' }),
          makeObservationList({ id: 'l2', keyWordId: 'k2' }),
        ],
      });

      const result = useListStore.getState().getListsByKeyword('k1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('l1');
    });
  });

  describe('getListsByStudy', () => {
    it('filters lists by studyId', () => {
      useListStore.setState({
        lists: [
          makeObservationList({ id: 'l1', studyId: 's1' }),
          makeObservationList({ id: 'l2', studyId: 's2' }),
        ],
      });

      const result = useListStore.getState().getListsByStudy('s1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('l1');
    });
  });

  describe('getMostRecentlyUsedList', () => {
    it('returns list matching lastUsedListId', () => {
      const list = makeObservationList({ id: 'l1' });
      useListStore.setState({ lists: [list], lastUsedListId: 'l1' });

      expect(useListStore.getState().getMostRecentlyUsedList()).toEqual(list);
    });

    it('returns null when no lastUsedListId', () => {
      useListStore.setState({ lists: [makeObservationList()], lastUsedListId: null });

      expect(useListStore.getState().getMostRecentlyUsedList()).toBeNull();
    });
  });
});
