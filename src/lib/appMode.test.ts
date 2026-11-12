/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectiveMode, switchMode } from './appMode';
import { FLAG_KEYS, DEFAULT_FLAGS } from './feature-flags';
import { initTelemetry, shutdownTelemetry } from './telemetry';
import { useAppModeStore, type AppMode } from '@/stores/appModeStore';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { usePanelStore } from '@/stores/panelStore';
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
    usePanelStore.setState({ activePanel: null });
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

  it('sends no event when telemetry is off', async () => {
    usePreferencesStore.setState({ telemetryEnabled: false });

    switchMode('study');

    expect(await sentEvents()).toEqual([]);
  });
});
