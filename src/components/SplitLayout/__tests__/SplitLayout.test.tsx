/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SplitLayout } from '../SplitLayout';
import { useAppModeStore } from '@/stores/appModeStore';
import { usePanelStore } from '@/stores/panelStore';

let discoveryEnabled = true;
vi.mock('@/lib/discovery-config', () => ({
  useDiscoveryEnabled: () => discoveryEnabled,
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function layoutPadding() {
  const { container } = render(<SplitLayout panel={null}>content</SplitLayout>);
  return (container.firstElementChild as HTMLElement).style.paddingBottom;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  discoveryEnabled = true;
  usePanelStore.setState({ orientation: 'horizontal' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom drops env() values, so the safe-area padding reads back as empty; the
// assertions check that the 60px toolbar reservation is gone.
describe('SplitLayout bottom padding', () => {
  it('reserves the toolbar height when the bottom bar is visible', () => {
    act(() => useAppModeStore.setState({ mode: 'study' }));
    expect(layoutPadding()).toBe('60px');
  });

  it('reserves the toolbar height in Discover on a narrow layout', () => {
    act(() => {
      useAppModeStore.setState({ mode: 'discover' });
      usePanelStore.setState({ orientation: 'vertical' });
    });
    expect(layoutPadding()).toBe('60px');
  });

  it('reserves only the safe-area inset in Discover on a wide layout', () => {
    act(() => useAppModeStore.setState({ mode: 'discover' }));
    expect(layoutPadding()).not.toMatch(/\d+px/);
  });

  it('reserves only the safe-area inset in Read', () => {
    act(() => useAppModeStore.setState({ mode: 'read' }));
    expect(layoutPadding()).not.toMatch(/\d+px/);
  });

  it('reserves only the safe-area inset for a stored Discover with the kill switch off', () => {
    discoveryEnabled = false;
    act(() => useAppModeStore.setState({ mode: 'discover' }));
    expect(layoutPadding()).not.toMatch(/\d+px/);
  });
});
