/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bottomBarVisible,
  chooseInitialMode,
  discoverAvailable,
  effectiveMode,
  openDiscoverPanel,
  selectMode,
  switchMode,
  toggleDiscoverPanel,
  verseMenuItems,
  verseNumbersVisible,
} from './appMode';
import { FLAG_KEYS, DEFAULT_FLAGS } from './feature-flags';
import { initTelemetry, shutdownTelemetry } from './telemetry';
import { useAppModeStore, type AppMode } from '@/stores/appModeStore';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { usePanelStore } from '@/stores/panelStore';
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { usePreferencesStore } from '@/stores/preferencesStore';

vi.mock('./feature-flags', async importOriginal => ({
  ...(await importOriginal<typeof import('./feature-flags')>()),
  platformTag: () => 'ios',
}));

interface EventsBody {
  events: { name: string; feature?: string }[];
}

describe('effectiveMode', () => {
  const cases: [AppMode | null, boolean, AppMode][] = [
    [null, true, 'read'],
    [null, false, 'read'],
    ['read', true, 'read'],
    ['read', false, 'read'],
    ['discover', true, 'discover'],
    ['discover', false, 'read'],
    ['study', true, 'study'],
    ['study', false, 'study'],
  ];

  it.each(cases)('mode %s with discovery enabled=%s is %s', (mode, enabled, expected) => {
    expect(effectiveMode(mode, enabled)).toBe(expected);
  });
});

describe('discoverAvailable', () => {
  const cases: [AppMode | null, boolean, boolean][] = [
    [null, true, false],
    ['read', true, false],
    ['discover', true, true],
    ['discover', false, false],
    ['study', true, true],
    ['study', false, false],
  ];

  it.each(cases)('mode %s with discovery enabled=%s is %s', (mode, enabled, expected) => {
    expect(discoverAvailable(mode, enabled)).toBe(expected);
  });
});

describe('chooseInitialMode', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  async function sentEvents(): Promise<{ name: string; feature?: string }[]> {
    await shutdownTelemetry();
    return fetchMock.mock.calls.flatMap(call => {
      const init = call[1] as RequestInit;
      return (JSON.parse(init.body as string) as EventsBody).events;
    });
  }

  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '9.9.9');
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    usePreferencesStore.setState({ telemetryEnabled: true });
    initTelemetry();
    useFeatureFlagsStore.setState({ flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: true } });
    useAppModeStore.setState({ mode: null, modesBannerPending: true });
    usePanelStore.setState({ activePanel: null, returnPanel: null, isCollapsed: false, orientation: 'vertical' });
  });

  afterEach(async () => {
    await shutdownTelemetry();
    vi.unstubAllGlobals();
    usePreferencesStore.setState({ telemetryEnabled: false });
  });

  it.each(['read', 'discover', 'study'] as const)(
    'sets %s from an unset mode, clears the banner and sends one event',
    async mode => {
      chooseInitialMode(mode);

      expect(useAppModeStore.getState().mode).toBe(mode);
      expect(useAppModeStore.getState().modesBannerPending).toBe(false);
      expect(await sentEvents()).toEqual([{ name: 'mode_chosen', feature: `mode_${mode}` }]);
    }
  );

  it('behaves as switchMode when a mode is stored, closing an unoffered panel', async () => {
    useAppModeStore.setState({ mode: 'study' });
    usePanelStore.setState({ activePanel: 'observe' });

    chooseInitialMode('read');

    expect(useAppModeStore.getState().mode).toBe('read');
    expect(usePanelStore.getState().activePanel).toBeNull();
    expect(useAppModeStore.getState().modesBannerPending).toBe(false);
    expect(await sentEvents()).toEqual([{ name: 'mode_chosen', feature: 'mode_read' }]);
  });

  it('stores the chosen mode when it already matches the effective mode', async () => {
    useAppModeStore.setState({ mode: 'discover' });
    useFeatureFlagsStore.setState({ flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: false } });

    chooseInitialMode('read');

    expect(useAppModeStore.getState().mode).toBe('read');
    expect(useAppModeStore.getState().modesBannerPending).toBe(false);
    expect(await sentEvents()).toEqual([{ name: 'mode_chosen', feature: 'mode_read' }]);
  });
});

describe('switchMode', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  async function sentEvents(): Promise<{ name: string; feature?: string }[]> {
    await shutdownTelemetry();
    return fetchMock.mock.calls.flatMap(call => {
      const init = call[1] as RequestInit;
      return (JSON.parse(init.body as string) as EventsBody).events;
    });
  }

  function setDiscoveryFlag(enabled: boolean) {
    useFeatureFlagsStore.setState({
      flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: enabled },
    });
  }

  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '9.9.9');
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    usePreferencesStore.setState({ telemetryEnabled: true });
    initTelemetry();
    setDiscoveryFlag(true);
    useAppModeStore.setState({ mode: 'read', modesBannerPending: false });
    usePanelStore.setState({ activePanel: null, returnPanel: null, isCollapsed: false, orientation: 'vertical' });
    useDiscoveryPrefsStore.setState({ discoverPanelClosed: false });
    useDiscoveryStore.setState({ lens: null });
    useAnnotationStore.setState({ selection: null, isSelecting: false });
  });

  afterEach(async () => {
    await shutdownTelemetry();
    vi.unstubAllGlobals();
    usePreferencesStore.setState({ telemetryEnabled: false });
  });

  it('sets the mode and sends mode_chosen with the matching feature', async () => {
    switchMode('study');

    expect(useAppModeStore.getState().mode).toBe('study');
    expect(await sentEvents()).toEqual([{ name: 'mode_chosen', feature: 'mode_study' }]);
  });

  it('does nothing when the mode is already stored', async () => {
    switchMode('read');

    expect(useAppModeStore.getState().mode).toBe('read');
    expect(await sentEvents()).toEqual([]);
  });

  it('does nothing when the target is already the effective mode', async () => {
    setDiscoveryFlag(false);
    useAppModeStore.setState({ mode: 'discover' });
    usePanelStore.setState({ activePanel: 'discovery' });

    switchMode('read');

    expect(useAppModeStore.getState().mode).toBe('discover');
    expect(usePanelStore.getState().activePanel).toBe('discovery');
    expect(await sentEvents()).toEqual([]);
  });

  it.each([
    ['read', 'study'],
    ['discover', 'study'],
    ['study', 'read'],
    ['study', 'discover'],
  ] as const)('closes the Key Words panel when switching %s to %s', (from, to) => {
    useAppModeStore.setState({ mode: from });
    usePanelStore.setState({ activePanel: 'keywords' });

    switchMode(to);

    expect(usePanelStore.getState().activePanel).toBeNull();
  });

  it.each([
    ['read', 'discover'],
    ['discover', 'read'],
  ] as const)('keeps the Key Words panel when switching %s to %s', (from, to) => {
    useAppModeStore.setState({ mode: from });
    usePanelStore.setState({ activePanel: 'keywords' });

    switchMode(to);

    expect(usePanelStore.getState().activePanel).toBe('keywords');
  });

  it('does nothing when switching to Discover with the flag off', async () => {
    setDiscoveryFlag(false);

    switchMode('discover');

    expect(useAppModeStore.getState().mode).toBe('read');
    expect(await sentEvents()).toEqual([]);
  });

  it('closes a panel the new mode does not offer', () => {
    useAppModeStore.setState({ mode: 'study' });
    usePanelStore.setState({ activePanel: 'observe' });

    switchMode('discover');

    expect(usePanelStore.getState().activePanel).toBeNull();
  });

  it('keeps a panel the new mode offers', () => {
    useAppModeStore.setState({ mode: 'study' });
    usePanelStore.setState({ activePanel: 'discovery' });

    switchMode('discover');

    expect(usePanelStore.getState().activePanel).toBe('discovery');
  });

  it('closes the Discover panel when the kill switch is off, even entering Study', () => {
    setDiscoveryFlag(false);
    usePanelStore.setState({ activePanel: 'discovery' });

    switchMode('study');

    expect(usePanelStore.getState().activePanel).toBeNull();
  });

  it('clears the Discover lens and the text selection', () => {
    useDiscoveryStore.setState({ lens: 'connectors' });
    useAnnotationStore.setState({
      selection: { text: 'word' } as never,
      isSelecting: true,
    });

    switchMode('study');

    expect(useDiscoveryStore.getState().lens).toBeNull();
    expect(useAnnotationStore.getState().selection).toBeNull();
    expect(useAnnotationStore.getState().isSelecting).toBe(false);
  });

  it('blurs the focused element', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    switchMode('study');

    expect(document.activeElement).not.toBe(input);
    input.remove();
  });

  it('does not set the Discover flag or return when it closes a panel', () => {
    useAppModeStore.setState({ mode: 'study' });
    usePanelStore.setState({ activePanel: 'observe', returnPanel: 'discovery', orientation: 'horizontal' });

    switchMode('discover');

    expect(usePanelStore.getState().activePanel).toBeNull();
    expect(useDiscoveryPrefsStore.getState().discoverPanelClosed).toBe(false);
  });

  it('sends no event when telemetry is off', async () => {
    usePreferencesStore.setState({ telemetryEnabled: false });

    switchMode('study');

    expect(await sentEvents()).toEqual([]);
  });
});

describe('bottomBarVisible', () => {
  const cases: [AppMode, boolean, boolean][] = [
    ['read', true, false],
    ['read', false, false],
    ['discover', true, false],
    ['discover', false, true],
    ['study', true, true],
    ['study', false, true],
  ];

  it.each(cases)('mode %s with wide=%s is %s', (mode, wide, expected) => {
    expect(bottomBarVisible(mode, wide)).toBe(expected);
  });
});

describe('Discover panel actions', () => {
  beforeEach(() => {
    useFeatureFlagsStore.setState({
      flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: true },
    });
    useAppModeStore.setState({ mode: 'discover', modesBannerPending: false });
    usePanelStore.setState({
      activePanel: null,
      returnPanel: null,
      isCollapsed: false,
      isPinned: false,
      orientation: 'horizontal',
    });
    useDiscoveryPrefsStore.setState({ discoverPanelClosed: false });
  });

  const flag = () => useDiscoveryPrefsStore.getState().discoverPanelClosed;
  const active = () => usePanelStore.getState().activePanel;

  describe('openDiscoverPanel', () => {
    it('clears the flag in Discover', () => {
      useDiscoveryPrefsStore.setState({ discoverPanelClosed: true });

      openDiscoverPanel();

      expect(active()).toBe('discovery');
      expect(flag()).toBe(false);
    });

    it('leaves the flag alone in Study', () => {
      useAppModeStore.setState({ mode: 'study' });
      useDiscoveryPrefsStore.setState({ discoverPanelClosed: true });

      openDiscoverPanel();

      expect(active()).toBe('discovery');
      expect(flag()).toBe(true);
    });
  });

  describe('toggleDiscoverPanel', () => {
    it('opens the panel and clears the flag', () => {
      useDiscoveryPrefsStore.setState({ discoverPanelClosed: true });

      toggleDiscoverPanel();

      expect(active()).toBe('discovery');
      expect(flag()).toBe(false);
    });

    it('sets the flag when closing in wide Discover', () => {
      usePanelStore.setState({ activePanel: 'discovery' });

      toggleDiscoverPanel();

      expect(active()).toBeNull();
      expect(flag()).toBe(true);
    });

    it('does not set the flag when closing in Study', () => {
      useAppModeStore.setState({ mode: 'study' });
      usePanelStore.setState({ activePanel: 'discovery' });

      toggleDiscoverPanel();

      expect(active()).toBeNull();
      expect(flag()).toBe(false);
    });

    it('does not set the flag when closing on a narrow layout', () => {
      usePanelStore.setState({ activePanel: 'discovery', orientation: 'vertical' });

      toggleDiscoverPanel();

      expect(active()).toBeNull();
      expect(flag()).toBe(false);
    });

    it('expands a collapsed panel without setting the flag', () => {
      usePanelStore.setState({ activePanel: 'discovery', isCollapsed: true });

      toggleDiscoverPanel();

      expect(active()).toBe('discovery');
      expect(usePanelStore.getState().isCollapsed).toBe(false);
      expect(flag()).toBe(false);
    });

    it('replaces another panel with Discover', () => {
      usePanelStore.setState({ activePanel: 'settings' });

      toggleDiscoverPanel();

      expect(active()).toBe('discovery');
    });
  });

  describe('selectMode', () => {
    it('toggles the panel when the effective mode is already Discover', () => {
      usePanelStore.setState({ activePanel: 'discovery' });

      selectMode('discover');

      expect(active()).toBeNull();
      expect(useAppModeStore.getState().mode).toBe('discover');
      expect(flag()).toBe(true);
    });

    it('switches mode when selecting a different mode', () => {
      selectMode('study');

      expect(useAppModeStore.getState().mode).toBe('study');
    });

    it('switches into Discover from another mode without toggling the panel', () => {
      useAppModeStore.setState({ mode: 'read' });
      usePanelStore.setState({ activePanel: 'discovery' });

      selectMode('discover');

      expect(useAppModeStore.getState().mode).toBe('discover');
      expect(active()).toBe('discovery');
    });

    it('re-selecting Read does nothing', () => {
      useAppModeStore.setState({ mode: 'read' });

      selectMode('read');

      expect(useAppModeStore.getState().mode).toBe('read');
    });
  });
});

describe('verseMenuItems', () => {
  it.each<[AppMode, string[]]>([
    ['read', ['note']],
    ['discover', ['note', 'crossRefs', 'originalLanguage']],
    ['study', ['heading', 'note', 'observation', 'time', 'crossRefs', 'originalLanguage']],
  ])('lists the %s items', (mode, items) => {
    expect([...verseMenuItems(mode)].sort()).toEqual([...items].sort());
  });
});

describe('verseNumbersVisible', () => {
  it.each<[AppMode, boolean, boolean]>([
    ['read', true, true],
    ['read', false, false],
    ['discover', false, true],
    ['discover', true, true],
    ['study', false, true],
    ['study', true, true],
  ])('mode %s with the preference %s is %s', (mode, preference, expected) => {
    expect(verseNumbersVisible(mode, preference)).toBe(expected);
  });
});
