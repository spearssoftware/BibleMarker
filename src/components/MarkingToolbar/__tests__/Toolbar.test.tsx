/**
 * @vitest-environment jsdom
 *
 * Integration test for the Toolbar component.
 * Verifies that data flows correctly between selection, menus, and the panel store.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAnnotationStore, type TextSelection } from '@/stores/annotationStore';
import { usePanelStore } from '@/stores/panelStore';
import { DEFAULT_MARKING_PREFERENCES } from '@/types';

// --- Mock all heavy dependencies ---

// Database and store reset
vi.mock('@/lib/database', () => ({ clearDatabase: vi.fn() }));
vi.mock('@/lib/storeReset', () => ({ resetAllStores: vi.fn() }));
vi.mock('@/lib/studyFilter', () => ({
  filterPresetsByStudy: (presets: unknown[]) => presets,
}));

// Hooks
vi.mock('@/hooks/useAnnotations', () => ({
  useAnnotations: () => ({
    createTextAnnotation: vi.fn(),
    createSymbolAnnotation: vi.fn(),
  }),
}));
vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

// Stores (return minimal state)
vi.mock('@/stores/markingPresetStore', () => ({
  useMarkingPresetStore: () => ({
    presets: [],
    loadPresets: vi.fn(),
    addPreset: vi.fn(),
    markPresetUsed: vi.fn(),
    updatePreset: vi.fn(),
  }),
}));
vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: () => ({}),
}));
vi.mock('@/stores/studyStore', () => ({
  useStudyStore: () => ({ activeStudyId: null }),
}));
vi.mock('@/stores/peopleStore', () => ({
  usePeopleStore: () => ({ people: [], loadPeople: vi.fn() }),
}));
vi.mock('@/stores/placeStore', () => ({
  usePlaceStore: () => ({ places: [], loadPlaces: vi.fn() }),
}));

// Mock child components as simple stubs
vi.mock('../SelectionMenu', () => ({
  SelectionMenu: (props: {
    onOpenKeyWordManager: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="selection-menu">
      <button
        data-testid="keyword-button"
        onClick={() => {
          props.onOpenKeyWordManager();
          props.onClose();
        }}
      >
        Key Word
      </button>
    </div>
  ),
}));

vi.mock('@/components/Settings', () => ({ SettingsPanel: () => null }));
vi.mock('@/components/shared', () => ({
  Modal: () => null,
}));

// Now import Toolbar after all mocks are registered
import { Toolbar } from '../Toolbar';


function makeSelection(text: string): TextSelection {
  return {
    moduleId: 'sword-nasb2020',
    book: 'John',
    chapter: 3,
    startVerse: 16,
    endVerse: 16,
    text,
    menuAnchor: { x: 100, y: 200 },
  };
}

describe('Toolbar', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
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
    // Reset panel store
    usePanelStore.setState({
      activePanel: null,
      isPinned: false,
      isCollapsed: false,
    });
  });

  describe('keyword creation from selection', () => {
    it('opens keywords panel with selected word via panelStore', async () => {
      const user = userEvent.setup();

      // Set a selection in the store
      act(() => {
        useAnnotationStore.setState({ selection: makeSelection('God') });
      });

      render(<Toolbar />);

      // SelectionMenu should be visible
      expect(screen.getByTestId('selection-menu')).toBeTruthy();

      // Click "Key Word" — this calls onOpenKeyWordManager() then onClose()
      await user.click(screen.getByTestId('keyword-button'));

      // Panel store should have been updated with the keyword panel open
      const panelState = usePanelStore.getState();
      expect(panelState.activePanel).toBe('keywords');
      expect(panelState.keywordInitialWord).toBe('God');
    });

    it('trims whitespace from the selected word', async () => {
      const user = userEvent.setup();

      act(() => {
        useAnnotationStore.setState({ selection: makeSelection('  love  ') });
      });

      render(<Toolbar />);
      await user.click(screen.getByTestId('keyword-button'));

      const panelState = usePanelStore.getState();
      expect(panelState.keywordInitialWord).toBe('love');
    });
  });
});
