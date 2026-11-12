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
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useAppModeStore } from '@/stores/appModeStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { FLAG_KEYS, DEFAULT_FLAGS } from '@/lib/feature-flags';
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
    quickHighlight: vi.fn(),
  }),
}));
const { keyboardShortcutsOptions } = vi.hoisted(() => ({
  keyboardShortcutsOptions: { current: null as { onToolbarTool?: (i: number) => void } | null },
}));
vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: (options: { onToolbarTool?: (i: number) => void }) => {
    keyboardShortcutsOptions.current = options;
  },
}));

// Stores (return minimal state)
const { markingPresetState } = vi.hoisted(() => ({
  markingPresetState: { presets: [] as { id: string; word?: string; variants: string[] }[] },
}));
vi.mock('@/stores/markingPresetStore', () => ({
  useMarkingPresetStore: (selector?: (s: { presets: { id: string }[] }) => unknown) => {
    const state = {
      presets: markingPresetState.presets,
      loadPresets: vi.fn(),
      addPreset: vi.fn(),
      markPresetUsed: vi.fn(),
      updatePreset: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));
vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: () => ({
    previousChapter: vi.fn(),
    nextChapter: vi.fn(),
    canGoNext: () => false,
    canGoPrevious: () => false,
  }),
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

let discoveryEnabled = true;
vi.mock('@/lib/discovery-config', () => ({
  useDiscoveryEnabled: () => discoveryEnabled,
}));

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: unknown[]) => trackMock(...args),
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
      returnPanel: null,
      isPinned: false,
      isCollapsed: false,
      orientation: 'vertical',
    });
    useDiscoveryPrefsStore.setState({ discoverPanelClosed: false });
    // Default to tools enabled (and hydrated) so existing keyword-flow tests
    // keep working; gating itself is covered by the "tool tabs" suite below.
    useAppModeStore.setState({ mode: 'study' });
    usePreferencesStore.setState({ isHydrated: true });
    discoveryEnabled = true;
    useFeatureFlagsStore.setState({ flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: true } });
    markingPresetState.presets = [];
    trackMock.mockClear();
  });

  describe('kill switch turning off mid-session', () => {
    it('closes the Discover panel and clears the lens', () => {
      usePanelStore.setState({ activePanel: 'discovery' });
      useDiscoveryStore.setState({ lens: 'connectors' });
      const { rerender } = render(<Toolbar />);
      expect(usePanelStore.getState().activePanel).toBe('discovery');

      discoveryEnabled = false;
      useFeatureFlagsStore.setState({ flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: false } });
      rerender(<Toolbar />);

      expect(usePanelStore.getState().activePanel).toBeNull();
      expect(useDiscoveryStore.getState().lens).toBeNull();
    });

    it('closes a panel the new effective mode does not offer, without setting the closed flag', () => {
      useAppModeStore.setState({ mode: 'discover' });
      usePanelStore.setState({ activePanel: 'reference' });
      const { rerender } = render(<Toolbar />);

      discoveryEnabled = false;
      useFeatureFlagsStore.setState({ flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: false } });
      rerender(<Toolbar />);

      expect(usePanelStore.getState().activePanel).toBeNull();
      expect(useDiscoveryPrefsStore.getState().discoverPanelClosed).toBe(false);
    });

    it('keeps a panel Study offers', () => {
      usePanelStore.setState({ activePanel: 'observe' });
      const { rerender } = render(<Toolbar />);

      discoveryEnabled = false;
      useFeatureFlagsStore.setState({ flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: false } });
      rerender(<Toolbar />);

      expect(usePanelStore.getState().activePanel).toBe('observe');
    });

    it('keeps Settings when Discover mode falls back to Read', () => {
      useAppModeStore.setState({ mode: 'discover' });
      usePanelStore.setState({ activePanel: 'settings' });
      const { rerender } = render(<Toolbar />);

      discoveryEnabled = false;
      useFeatureFlagsStore.setState({ flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: false } });
      rerender(<Toolbar />);

      expect(usePanelStore.getState().activePanel).toBe('settings');
    });

    it('does nothing on mount when Discover is already unavailable', () => {
      discoveryEnabled = false;
      usePanelStore.setState({ activePanel: 'discovery' });
      useDiscoveryStore.setState({ lens: 'connectors' });

      render(<Toolbar />);

      expect(usePanelStore.getState().activePanel).toBe('discovery');
      expect(useDiscoveryStore.getState().lens).toBe('connectors');
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

  describe('bottom bar by mode', () => {
    const TOOL_LABELS = ['Key Words', 'Observe', 'Analyze', 'Study Tools'];
    const tabLabels = () =>
      screen.getAllByRole('button')
        .map(b => b.getAttribute('aria-label'))
        .filter(l => l !== null && l !== 'Previous chapter' && l !== 'Next chapter');

    it('renders no tabs in Read but keeps the chapter arrows and selection menu', () => {
      act(() => {
        useAppModeStore.setState({ mode: 'read' });
        useAnnotationStore.setState({ selection: makeSelection('God') });
      });
      render(<Toolbar />);

      expect(tabLabels()).toEqual([]);
      expect(screen.getByLabelText('Previous chapter')).toBeTruthy();
      expect(screen.getByLabelText('Next chapter')).toBeTruthy();
      expect(screen.getByTestId('selection-menu')).toBeTruthy();
    });

    it('renders only Discover in Discover mode', () => {
      act(() => {
        useAppModeStore.setState({ mode: 'discover' });
      });
      render(<Toolbar />);

      expect(tabLabels()).toEqual(['Discover']);
    });

    it('renders no bar in Discover on a wide layout', () => {
      act(() => {
        useAppModeStore.setState({ mode: 'discover' });
        usePanelStore.setState({ orientation: 'horizontal' });
      });
      render(<Toolbar />);

      expect(tabLabels()).toEqual([]);
    });

    it.each(['horizontal', 'vertical'] as const)('renders Discover and the four tools in Study at %s orientation', orientation => {
      act(() => usePanelStore.setState({ orientation }));
      render(<Toolbar />);

      expect(tabLabels()).toEqual(['Discover', ...TOOL_LABELS]);
    });

    it('renders the four tools without Discover in Study when the kill switch is off', () => {
      discoveryEnabled = false;
      render(<Toolbar />);

      expect(tabLabels()).toEqual(TOOL_LABELS);
    });

    it('treats a stored Discover as Read when the kill switch is off', () => {
      discoveryEnabled = false;
      act(() => {
        useAppModeStore.setState({ mode: 'discover' });
      });
      render(<Toolbar />);

      expect(tabLabels()).toEqual([]);
    });

    it.each(['read', 'discover', 'study'] as const)('has no Settings tab in %s mode', mode => {
      act(() => {
        useAppModeStore.setState({ mode });
      });
      render(<Toolbar />);

      expect(screen.queryByLabelText('Settings')).toBeNull();
    });

    it('lowers the chapter arrows when there is no bar', () => {
      act(() => {
        useAppModeStore.setState({ mode: 'read' });
      });
      const { rerender } = render(<Toolbar />);
      expect(screen.getByLabelText('Next chapter').style.bottom).toContain('24px');

      act(() => {
        useAppModeStore.setState({ mode: 'study' });
      });
      rerender(<Toolbar />);
      expect(screen.getByLabelText('Next chapter').style.bottom).toContain('84px');
    });

    it('opens panels from keys 1-4 only in Study', () => {
      const press = (index: number) => {
        act(() => {
          keyboardShortcutsOptions.current?.onToolbarTool?.(index);
        });
      };

      for (const mode of ['read', 'discover'] as const) {
        act(() => {
          useAppModeStore.setState({ mode });
        });
        render(<Toolbar />);
        for (const index of [0, 1, 2, 3]) press(index);
        expect(usePanelStore.getState().activePanel).toBeNull();
        cleanup();
      }

      act(() => {
        useAppModeStore.setState({ mode: 'study' });
      });
      render(<Toolbar />);
      press(0);
      expect(usePanelStore.getState().activePanel).toBe('keywords');
      press(3);
      expect(usePanelStore.getState().activePanel).toBe('reference');
    });
  });

  describe('window events', () => {
    it.each([
      ['openObservationTools', 'observe'],
      ['openAnalyzeTools', 'analyze'],
    ] as const)('%s opens its panel only in Study', (eventName, panel) => {
      render(<Toolbar />);

      for (const mode of ['read', 'discover'] as const) {
        act(() => {
          useAppModeStore.setState({ mode });
          window.dispatchEvent(new CustomEvent(eventName));
        });
        expect(usePanelStore.getState().activePanel).toBeNull();
      }

      act(() => {
        useAppModeStore.setState({ mode: 'study' });
        window.dispatchEvent(new CustomEvent(eventName));
      });
      expect(usePanelStore.getState().activePanel).toBe(panel);
    });
  });

  describe('Discover button', () => {
    it('is present with tools off', () => {
      act(() => {
        useAppModeStore.setState({ mode: 'discover' });
        usePreferencesStore.setState({ isHydrated: true });
      });
      render(<Toolbar />);
      expect(screen.getByLabelText('Discover')).toBeTruthy();
    });

    it('is present with tools on', () => {
      render(<Toolbar />);
      expect(screen.getByLabelText('Discover')).toBeTruthy();
    });

    it.each(['discover', 'study'] as const)('is hidden in %s mode when the Discover kill-switch is off', mode => {
      discoveryEnabled = false;
      useAppModeStore.setState({ mode });
      render(<Toolbar />);
      expect(screen.queryByLabelText('Discover')).toBeNull();
    });

    it('is hidden in Read mode', () => {
      useAppModeStore.setState({ mode: 'read' });
      render(<Toolbar />);
      expect(screen.queryByLabelText('Discover')).toBeNull();
    });

    it('toggles the discovery panel and tracks a tap only when the click opens it', async () => {
      const user = userEvent.setup();
      render(<Toolbar />);

      await user.click(screen.getByLabelText(/discover/i));
      expect(usePanelStore.getState().activePanel).toBe('discovery');
      expect(trackMock).toHaveBeenCalledWith('discovery_chip_tapped');
      expect(trackMock).toHaveBeenCalledTimes(1);

      await user.click(screen.getByLabelText(/discover/i));
      expect(usePanelStore.getState().activePanel).toBeNull();
      // Closing the panel must not fire another tap event.
      expect(trackMock).toHaveBeenCalledTimes(1);
    });
  });
});
