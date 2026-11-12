/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { useDiscoverDefaultPanel } from '../useDiscoverDefaultPanel';
import { useAppModeStore } from '@/stores/appModeStore';
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { usePanelStore } from '@/stores/panelStore';

vi.mock('@/lib/discovery-config', () => ({
  useDiscoveryEnabled: () => true,
}));

const active = () => usePanelStore.getState().activePanel;

function useCorrectOrientationFirst() {
  useEffect(() => {
    usePanelStore.getState().setOrientation('vertical');
  }, []);
}

describe('useDiscoverDefaultPanel', () => {
  beforeEach(() => {
    useAppModeStore.setState({ mode: 'discover' });
    useDiscoveryPrefsStore.setState({ discoverPanelClosed: false });
    usePanelStore.setState({
      activePanel: null,
      returnPanel: null,
      isCollapsed: false,
      isPinned: false,
      orientation: 'horizontal',
    });
  });

  afterEach(cleanup);

  it('opens the Discover panel in Discover mode on a wide layout', () => {
    renderHook(() => useDiscoverDefaultPanel());

    expect(active()).toBe('discovery');
  });

  it('stays closed on a narrow layout', () => {
    usePanelStore.setState({ orientation: 'vertical' });
    renderHook(() => useDiscoverDefaultPanel());

    expect(active()).toBeNull();
  });

  it('stays closed when the reader closed it', () => {
    useDiscoveryPrefsStore.setState({ discoverPanelClosed: true });
    renderHook(() => useDiscoverDefaultPanel());

    expect(active()).toBeNull();
  });

  it.each(['read', 'study'] as const)('stays closed in %s mode', mode => {
    useAppModeStore.setState({ mode });
    renderHook(() => useDiscoverDefaultPanel());

    expect(active()).toBeNull();
  });

  it('leaves another open panel alone', () => {
    usePanelStore.setState({ activePanel: 'settings' });
    renderHook(() => useDiscoverDefaultPanel());

    expect(active()).toBe('settings');
  });

  it('opens when the layout rotates to wide', () => {
    usePanelStore.setState({ orientation: 'vertical' });
    renderHook(() => useDiscoverDefaultPanel());
    expect(active()).toBeNull();

    act(() => usePanelStore.setState({ orientation: 'horizontal' }));

    expect(active()).toBe('discovery');
  });

  it('opens when the mode changes to Discover', () => {
    useAppModeStore.setState({ mode: 'read' });
    renderHook(() => useDiscoverDefaultPanel());
    expect(active()).toBeNull();

    act(() => useAppModeStore.setState({ mode: 'discover' }));

    expect(active()).toBe('discovery');
  });

  it('does not reopen after the reader closes the panel', () => {
    renderHook(() => useDiscoverDefaultPanel());
    expect(active()).toBe('discovery');

    act(() => {
      useDiscoveryPrefsStore.setState({ discoverPanelClosed: true });
      usePanelStore.getState().closePanel();
    });

    expect(active()).toBeNull();
  });

  it('decides from the store orientation at effect time, not the render-time value', () => {
    const { rerender } = renderHook(() => {
      // Runs before the hook's own effect, as useLayoutOrientation does in App.
      useCorrectOrientationFirst();
      useDiscoverDefaultPanel();
    });

    expect(usePanelStore.getState().orientation).toBe('vertical');
    expect(active()).toBeNull();
    rerender();
    expect(active()).toBeNull();
  });
});
