import { describe, it, expect, beforeEach } from 'vitest';
import { useBibleStore } from '@/stores/bibleStore';

describe('bibleStore', () => {
  beforeEach(() => {
    useBibleStore.setState({
      currentModuleId: null,
      currentBook: 'John',
      currentChapter: 1,
      chapter: null,
      isLoading: false,
      error: null,
      navSelectedVerse: null,
    });
  });

  describe('setLocation', () => {
    it('updates book and chapter', () => {
      useBibleStore.getState().setLocation('Gen', 3);

      const state = useBibleStore.getState();
      expect(state.currentBook).toBe('Gen');
      expect(state.currentChapter).toBe(3);
    });

    it('clears chapter data', () => {
      useBibleStore.setState({ chapter: { book: 'John', chapter: 1, verses: [] } });

      useBibleStore.getState().setLocation('Gen', 1);

      expect(useBibleStore.getState().chapter).toBeNull();
    });

    it('clears nav selected verse', () => {
      useBibleStore.setState({ navSelectedVerse: 5 });

      useBibleStore.getState().setLocation('Gen', 1);

      expect(useBibleStore.getState().navSelectedVerse).toBeNull();
    });
  });

  describe('setCurrentModule', () => {
    it('updates moduleId and clears chapter', () => {
      useBibleStore.setState({ chapter: { book: 'John', chapter: 1, verses: [] } });

      useBibleStore.getState().setCurrentModule('sword-NASB');

      expect(useBibleStore.getState().currentModuleId).toBe('sword-NASB');
      expect(useBibleStore.getState().chapter).toBeNull();
    });

    it('rejects empty moduleId', () => {
      useBibleStore.getState().setCurrentModule('sword-NASB');
      useBibleStore.getState().setCurrentModule('');

      expect(useBibleStore.getState().currentModuleId).toBe('sword-NASB');
    });

    it('rejects moduleId containing "undefined"', () => {
      useBibleStore.getState().setCurrentModule('sword-NASB');
      useBibleStore.getState().setCurrentModule('sword-undefined');

      expect(useBibleStore.getState().currentModuleId).toBe('sword-NASB');
    });
  });

  describe('nextChapter', () => {
    it('increments chapter within same book', () => {
      useBibleStore.setState({ currentBook: 'Gen', currentChapter: 1 });

      useBibleStore.getState().nextChapter();

      expect(useBibleStore.getState().currentChapter).toBe(2);
    });

    it('moves to next book at last chapter', () => {
      useBibleStore.setState({ currentBook: 'Gen', currentChapter: 50 });

      useBibleStore.getState().nextChapter();

      expect(useBibleStore.getState().currentBook).toBe('Exod');
      expect(useBibleStore.getState().currentChapter).toBe(1);
    });

    it('does nothing at Rev 22', () => {
      useBibleStore.setState({ currentBook: 'Rev', currentChapter: 22 });

      useBibleStore.getState().nextChapter();

      expect(useBibleStore.getState().currentBook).toBe('Rev');
      expect(useBibleStore.getState().currentChapter).toBe(22);
    });
  });

  describe('previousChapter', () => {
    it('decrements chapter within same book', () => {
      useBibleStore.setState({ currentBook: 'Gen', currentChapter: 3 });

      useBibleStore.getState().previousChapter();

      expect(useBibleStore.getState().currentChapter).toBe(2);
    });

    it('moves to previous book at chapter 1', () => {
      useBibleStore.setState({ currentBook: 'Exod', currentChapter: 1 });

      useBibleStore.getState().previousChapter();

      expect(useBibleStore.getState().currentBook).toBe('Gen');
      expect(useBibleStore.getState().currentChapter).toBe(50);
    });

    it('does nothing at Gen 1', () => {
      useBibleStore.setState({ currentBook: 'Gen', currentChapter: 1 });

      useBibleStore.getState().previousChapter();

      expect(useBibleStore.getState().currentBook).toBe('Gen');
      expect(useBibleStore.getState().currentChapter).toBe(1);
    });
  });

  describe('canGoNext / canGoPrevious', () => {
    it('canGoNext is true in the middle', () => {
      useBibleStore.setState({ currentBook: 'John', currentChapter: 5 });
      expect(useBibleStore.getState().canGoNext()).toBe(true);
    });

    it('canGoNext is false at Rev 22', () => {
      useBibleStore.setState({ currentBook: 'Rev', currentChapter: 22 });
      expect(useBibleStore.getState().canGoNext()).toBe(false);
    });

    it('canGoPrevious is true in the middle', () => {
      useBibleStore.setState({ currentBook: 'John', currentChapter: 5 });
      expect(useBibleStore.getState().canGoPrevious()).toBe(true);
    });

    it('canGoPrevious is false at Gen 1', () => {
      useBibleStore.setState({ currentBook: 'Gen', currentChapter: 1 });
      expect(useBibleStore.getState().canGoPrevious()).toBe(false);
    });
  });
});
