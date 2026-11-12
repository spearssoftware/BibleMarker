/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { PanelContainer } from '../PanelContainer';
import { switchMode } from '@/lib/appMode';
import { useAppModeStore, type AppMode } from '@/stores/appModeStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { usePanelStore, type PanelType } from '@/stores/panelStore';

vi.mock('@/lib/discovery-config', () => ({
  useDiscoveryEnabled: () => true,
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/components/KeyWords', () => ({
  KeyWordManager: ({ onPresetCreated }: { onPresetCreated?: () => void }) => (
    <button onClick={onPresetCreated}>preset-created</button>
  ),
}));
vi.mock('@/components/Observation', () => ({ ObservationToolsPanel: () => <div>observe</div> }));
vi.mock('@/components/Analyze', () => ({ AnalyzeToolsPanel: () => <div>analyze</div> }));
vi.mock('@/components/Reference', () => ({ ReferenceToolsPanel: () => <div>reference</div> }));
vi.mock('@/components/Settings', () => ({ SettingsPanel: () => <div>settings</div> }));
vi.mock('@/components/Discovery', () => ({ DiscoveryPanel: () => <div>discovery</div> }));

const active = () => usePanelStore.getState().activePanel;
const flag = () => useDiscoveryPrefsStore.getState().discoverPanelClosed;

function setup(mode: AppMode, orientation: 'horizontal' | 'vertical', activePanel: PanelType | null = null) {
  useAppModeStore.setState({ mode });
  usePanelStore.setState({ activePanel, returnPanel: null, orientation });
}

function closePanel() {
  fireEvent.click(screen.getByLabelText('Close panel'));
}

describe('PanelContainer closing', () => {
  beforeEach(() => {
    useDiscoveryPrefsStore.setState({ discoverPanelClosed: false });
    usePanelStore.setState({ activePanel: null, returnPanel: null, isCollapsed: false, isPinned: false });
    useBibleStore.setState({ locationHistory: [] });
  });

  afterEach(cleanup);

  it('sets the flag when Discover closes in wide Discover mode', () => {
    setup('discover', 'horizontal', 'discovery');
    render(<PanelContainer />);

    closePanel();

    expect(active()).toBeNull();
    expect(flag()).toBe(true);
  });

  it('does not set the flag when Discover closes on a narrow layout', () => {
    setup('discover', 'vertical', 'discovery');
    render(<PanelContainer />);

    closePanel();

    expect(active()).toBeNull();
    expect(flag()).toBe(false);
  });

  it('does not set the flag when Discover closes in Study', () => {
    setup('study', 'horizontal', 'discovery');
    render(<PanelContainer />);

    closePanel();

    expect(active()).toBeNull();
    expect(flag()).toBe(false);
  });

  it.each(['settings', 'reference', 'keywords'] as const)(
    'returns to Discover when %s, opened over it, closes in Discover mode',
    panel => {
      setup('discover', 'vertical', 'discovery');
      usePanelStore.getState().openPanel(panel);
      render(<PanelContainer />);

      closePanel();

      expect(active()).toBe('discovery');
      expect(flag()).toBe(false);
    }
  );

  it('still jumps back through locationHistory when Study Tools closes over Discover', () => {
    setup('discover', 'vertical', 'discovery');
    usePanelStore.getState().openPanel('reference');
    useBibleStore.setState({
      currentBook: 'Gen',
      currentChapter: 5,
      locationHistory: [{ book: 'Exo', chapter: 2 }],
    });
    render(<PanelContainer />);

    closePanel();

    expect(useBibleStore.getState().currentBook).toBe('Exo');
    expect(useBibleStore.getState().currentChapter).toBe(2);
    expect(active()).toBe('discovery');
  });

  it('opens Discover when Settings closes on wide Discover with the flag clear', () => {
    setup('discover', 'horizontal', 'settings');
    render(<PanelContainer />);

    closePanel();

    expect(active()).toBe('discovery');
  });

  it('does not open Discover when the flag is set and there is nothing to return to', () => {
    setup('discover', 'horizontal', 'settings');
    useDiscoveryPrefsStore.setState({ discoverPanelClosed: true });
    render(<PanelContainer />);

    closePanel();

    expect(active()).toBeNull();
  });

  it('does not open Discover when Settings closes on a narrow layout with nothing to return to', () => {
    setup('discover', 'vertical', 'settings');
    render(<PanelContainer />);

    closePanel();

    expect(active()).toBeNull();
  });

  it('does not return to Discover in Study', () => {
    setup('study', 'horizontal', 'discovery');
    usePanelStore.getState().openPanel('settings');
    render(<PanelContainer />);

    closePanel();

    expect(active()).toBeNull();
  });

  it('does not return to Discover in Read', () => {
    setup('read', 'horizontal', 'settings');
    render(<PanelContainer />);

    closePanel();

    expect(active()).toBeNull();
  });

  it('does not return when switchMode closes the panel', () => {
    setup('discover', 'horizontal', 'discovery');
    usePanelStore.getState().openPanel('reference');
    render(<PanelContainer />);

    act(() => switchMode('read'));

    expect(active()).toBeNull();
    expect(flag()).toBe(false);
  });

  it('closes the Key Words panel when a preset is created and it is not pinned', () => {
    setup('study', 'horizontal', 'keywords');
    render(<PanelContainer />);

    fireEvent.click(screen.getByText('preset-created'));

    expect(active()).toBeNull();
  });

  it('keeps a pinned Key Words panel open when a preset is created', () => {
    setup('discover', 'horizontal', 'keywords');
    usePanelStore.setState({ isPinned: true });
    render(<PanelContainer />);

    fireEvent.click(screen.getByText('preset-created'));

    expect(active()).toBe('keywords');
  });

  it('returns to Discover when a preset is created over it', () => {
    setup('discover', 'vertical', 'discovery');
    usePanelStore.getState().openPanel('keywords');
    render(<PanelContainer />);

    fireEvent.click(screen.getByText('preset-created'));

    expect(active()).toBe('discovery');
  });
});

describe('PanelContainer tour target', () => {
  afterEach(cleanup);

  it('marks the root with data-discover-panel only while Discover is showing', () => {
    setup('discover', 'horizontal', 'discovery');
    const { container, unmount } = render(<PanelContainer />);
    expect(container.querySelector('[data-discover-panel]')).not.toBeNull();
    unmount();

    setup('discover', 'horizontal', 'settings');
    const other = render(<PanelContainer />);
    expect(other.container.querySelector('[data-discover-panel]')).toBeNull();
  });
});
