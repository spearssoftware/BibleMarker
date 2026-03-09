import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnnotationStore } from '@/stores/annotationStore';
import { updatePreferences } from '@/lib/database';
import { DEFAULT_MARKING_PREFERENCES } from '@/types';

vi.mock('@/lib/database');

describe('annotationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAnnotationStore.setState({
      activeTool: null,
      activeColor: 'yellow',
      activeSymbol: 'cross',
      selection: null,
      isSelecting: false,
      annotations: [],
      sectionHeadings: [],
      chapterTitle: null,
      notes: [],
      preferences: { ...DEFAULT_MARKING_PREFERENCES },
      fontSize: 'base',
      toolbarVisible: true,
      toolbarExpanded: false,
    });
  });

  describe('setActiveTool', () => {
    it('sets the active tool', () => {
      useAnnotationStore.getState().setActiveTool('highlight');
      expect(useAnnotationStore.getState().activeTool).toBe('highlight');
    });

    it('can be set to null', () => {
      useAnnotationStore.getState().setActiveTool('highlight');
      useAnnotationStore.getState().setActiveTool(null);
      expect(useAnnotationStore.getState().activeTool).toBeNull();
    });
  });

  describe('setActiveColor', () => {
    it('sets the active color', () => {
      useAnnotationStore.getState().setActiveColor('red');
      expect(useAnnotationStore.getState().activeColor).toBe('red');
    });
  });

  describe('setActiveSymbol', () => {
    it('sets the active symbol', () => {
      useAnnotationStore.getState().setActiveSymbol('triangle');
      expect(useAnnotationStore.getState().activeSymbol).toBe('triangle');
    });
  });

  describe('addRecentColor', () => {
    it('adds color to front of recent list', async () => {
      vi.mocked(updatePreferences).mockResolvedValue(undefined);

      await useAnnotationStore.getState().addRecentColor('red');

      expect(useAnnotationStore.getState().preferences.recentColors[0]).toBe('red');
    });

    it('deduplicates colors', async () => {
      vi.mocked(updatePreferences).mockResolvedValue(undefined);
      useAnnotationStore.setState({
        preferences: { ...DEFAULT_MARKING_PREFERENCES, recentColors: ['red', 'blue'] },
      });

      await useAnnotationStore.getState().addRecentColor('red');

      const recent = useAnnotationStore.getState().preferences.recentColors;
      expect(recent.filter(c => c === 'red')).toHaveLength(1);
      expect(recent[0]).toBe('red');
    });

    it('limits to 8 colors', async () => {
      vi.mocked(updatePreferences).mockResolvedValue(undefined);
      useAnnotationStore.setState({
        preferences: {
          ...DEFAULT_MARKING_PREFERENCES,
          recentColors: ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'cyan'],
        },
      });

      await useAnnotationStore.getState().addRecentColor('teal');

      expect(useAnnotationStore.getState().preferences.recentColors).toHaveLength(8);
      expect(useAnnotationStore.getState().preferences.recentColors[0]).toBe('teal');
    });
  });

  describe('addRecentSymbol', () => {
    it('adds symbol to front of recent list', async () => {
      vi.mocked(updatePreferences).mockResolvedValue(undefined);

      await useAnnotationStore.getState().addRecentSymbol('star');

      expect(useAnnotationStore.getState().preferences.recentSymbols[0]).toBe('star');
    });

    it('deduplicates symbols', async () => {
      vi.mocked(updatePreferences).mockResolvedValue(undefined);
      useAnnotationStore.setState({
        preferences: { ...DEFAULT_MARKING_PREFERENCES, recentSymbols: ['star', 'cross'] },
      });

      await useAnnotationStore.getState().addRecentSymbol('star');

      const recent = useAnnotationStore.getState().preferences.recentSymbols;
      expect(recent.filter(s => s === 'star')).toHaveLength(1);
    });

    it('limits to 8 symbols', async () => {
      vi.mocked(updatePreferences).mockResolvedValue(undefined);
      useAnnotationStore.setState({
        preferences: {
          ...DEFAULT_MARKING_PREFERENCES,
          recentSymbols: ['star', 'cross', 'heart', 'triangle', 'circle', 'square', 'diamond', 'check'],
        },
      });

      await useAnnotationStore.getState().addRecentSymbol('flame');

      expect(useAnnotationStore.getState().preferences.recentSymbols).toHaveLength(8);
      expect(useAnnotationStore.getState().preferences.recentSymbols[0]).toBe('flame');
    });
  });

  describe('clearSelection', () => {
    it('resets selection and isSelecting', () => {
      useAnnotationStore.setState({
        selection: {
          moduleId: 'test',
          book: 'Gen',
          chapter: 1,
          startVerse: 1,
          endVerse: 1,
          text: 'test',
        },
        isSelecting: true,
      });

      useAnnotationStore.getState().clearSelection();

      expect(useAnnotationStore.getState().selection).toBeNull();
      expect(useAnnotationStore.getState().isSelecting).toBe(false);
    });
  });
});
