import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import {
  getAllMarkingPresets,
  saveMarkingPreset,
  deleteMarkingPreset,
  searchMarkingPresets,
  incrementMarkingPresetUsage,
} from '@/lib/database';
import { makeMarkingPreset } from '@/lib/__test__/factories';

vi.mock('@/lib/database');

describe('markingPresetStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMarkingPresetStore.setState({
      presets: [],
      selectedPreset: null,
      filterCategory: 'all',
      searchQuery: '',
      isLoading: false,
    });
  });

  describe('loadPresets', () => {
    it('populates state from DB', async () => {
      const presets = [makeMarkingPreset({ id: 'p1' }), makeMarkingPreset({ id: 'p2' })];
      vi.mocked(getAllMarkingPresets).mockResolvedValue(presets);

      await useMarkingPresetStore.getState().loadPresets();

      expect(useMarkingPresetStore.getState().presets).toHaveLength(2);
      expect(useMarkingPresetStore.getState().isLoading).toBe(false);
    });

    it('sets isLoading during load', async () => {
      vi.mocked(getAllMarkingPresets).mockImplementation(async () => {
        expect(useMarkingPresetStore.getState().isLoading).toBe(true);
        return [];
      });

      await useMarkingPresetStore.getState().loadPresets();

      expect(useMarkingPresetStore.getState().isLoading).toBe(false);
    });

    it('handles errors gracefully', async () => {
      vi.mocked(getAllMarkingPresets).mockRejectedValue(new Error('DB error'));

      await useMarkingPresetStore.getState().loadPresets();

      expect(useMarkingPresetStore.getState().isLoading).toBe(false);
      expect(useMarkingPresetStore.getState().presets).toEqual([]);
    });
  });

  describe('addPreset', () => {
    it('saves to DB and reloads', async () => {
      const preset = makeMarkingPreset({ id: 'p1' });
      vi.mocked(saveMarkingPreset).mockResolvedValue('p1');
      vi.mocked(getAllMarkingPresets).mockResolvedValue([preset]);

      await useMarkingPresetStore.getState().addPreset(preset);

      expect(saveMarkingPreset).toHaveBeenCalledWith(preset);
      expect(getAllMarkingPresets).toHaveBeenCalled();
    });
  });

  describe('updatePreset', () => {
    it('saves with new updatedAt and reloads', async () => {
      const preset = makeMarkingPreset({ id: 'p1' });
      vi.mocked(saveMarkingPreset).mockResolvedValue('p1');
      vi.mocked(getAllMarkingPresets).mockResolvedValue([preset]);

      await useMarkingPresetStore.getState().updatePreset(preset);

      expect(saveMarkingPreset).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1' })
      );
    });

    it('updates selectedPreset if matching', async () => {
      const preset = makeMarkingPreset({ id: 'p1', word: 'God' });
      useMarkingPresetStore.setState({ selectedPreset: preset });
      vi.mocked(saveMarkingPreset).mockResolvedValue('p1');
      vi.mocked(getAllMarkingPresets).mockResolvedValue([preset]);

      await useMarkingPresetStore.getState().updatePreset({ ...preset, word: 'Lord' });

      const selected = useMarkingPresetStore.getState().selectedPreset;
      expect(selected?.word).toBe('Lord');
    });
  });

  describe('removePreset', () => {
    it('deletes from DB and reloads', async () => {
      vi.mocked(deleteMarkingPreset).mockResolvedValue(undefined);
      vi.mocked(getAllMarkingPresets).mockResolvedValue([]);

      await useMarkingPresetStore.getState().removePreset('p1');

      expect(deleteMarkingPreset).toHaveBeenCalledWith('p1');
    });

    it('clears selectedPreset if matching', async () => {
      const preset = makeMarkingPreset({ id: 'p1' });
      useMarkingPresetStore.setState({ selectedPreset: preset });
      vi.mocked(deleteMarkingPreset).mockResolvedValue(undefined);
      vi.mocked(getAllMarkingPresets).mockResolvedValue([]);

      await useMarkingPresetStore.getState().removePreset('p1');

      expect(useMarkingPresetStore.getState().selectedPreset).toBeNull();
    });

    it('preserves selectedPreset if not matching', async () => {
      const preset = makeMarkingPreset({ id: 'p1' });
      useMarkingPresetStore.setState({ selectedPreset: preset });
      vi.mocked(deleteMarkingPreset).mockResolvedValue(undefined);
      vi.mocked(getAllMarkingPresets).mockResolvedValue([preset]);

      await useMarkingPresetStore.getState().removePreset('p2');

      expect(useMarkingPresetStore.getState().selectedPreset).toEqual(preset);
    });
  });

  describe('getFilteredPresets', () => {
    it('returns all presets when no filters', () => {
      useMarkingPresetStore.setState({
        presets: [makeMarkingPreset({ id: 'p1' }), makeMarkingPreset({ id: 'p2' })],
        filterCategory: 'all',
        searchQuery: '',
      });

      expect(useMarkingPresetStore.getState().getFilteredPresets()).toHaveLength(2);
    });

    it('filters by category', () => {
      useMarkingPresetStore.setState({
        presets: [
          makeMarkingPreset({ id: 'p1', category: 'identity' }),
          makeMarkingPreset({ id: 'p2', category: 'people' }),
        ],
        filterCategory: 'identity',
        searchQuery: '',
      });

      const filtered = useMarkingPresetStore.getState().getFilteredPresets();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('p1');
    });

    it('filters by search query (word)', () => {
      useMarkingPresetStore.setState({
        presets: [
          makeMarkingPreset({ id: 'p1', word: 'God' }),
          makeMarkingPreset({ id: 'p2', word: 'Moses' }),
        ],
        filterCategory: 'all',
        searchQuery: 'god',
      });

      const filtered = useMarkingPresetStore.getState().getFilteredPresets();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].word).toBe('God');
    });

    it('sorts by usage count (descending)', () => {
      useMarkingPresetStore.setState({
        presets: [
          makeMarkingPreset({ id: 'p1', word: 'God', usageCount: 5 }),
          makeMarkingPreset({ id: 'p2', word: 'Lord', usageCount: 10 }),
        ],
        filterCategory: 'all',
        searchQuery: '',
      });

      const filtered = useMarkingPresetStore.getState().getFilteredPresets();
      expect(filtered[0].word).toBe('Lord');
      expect(filtered[1].word).toBe('God');
    });
  });

  describe('findMatchingPresets', () => {
    it('delegates to DB search', async () => {
      const preset = makeMarkingPreset({ id: 'p1', word: 'God' });
      vi.mocked(searchMarkingPresets).mockResolvedValue([preset]);

      const result = await useMarkingPresetStore.getState().findMatchingPresets('God');

      expect(searchMarkingPresets).toHaveBeenCalledWith('God');
      expect(result).toEqual([preset]);
    });
  });

  describe('markPresetUsed', () => {
    it('calls incrementMarkingPresetUsage and reloads', async () => {
      vi.mocked(incrementMarkingPresetUsage).mockResolvedValue(undefined);
      vi.mocked(getAllMarkingPresets).mockResolvedValue([]);

      await useMarkingPresetStore.getState().markPresetUsed('p1');

      expect(incrementMarkingPresetUsage).toHaveBeenCalledWith('p1');
      expect(getAllMarkingPresets).toHaveBeenCalled();
    });
  });
});
