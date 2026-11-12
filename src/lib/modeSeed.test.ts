/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { seedAppMode } from './modeSeed';
import { countRows } from './database';
import { initTelemetry, shutdownTelemetry } from './telemetry';
import { useAppModeStore } from '@/stores/appModeStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { DEFAULT_MARKING_PREFERENCES, type UserPreferences } from '@/types';

vi.mock('./database');
vi.mock('./feature-flags', async importOriginal => ({
  ...(await importOriginal<typeof import('./feature-flags')>()),
  platformTag: () => 'ios',
}));

function makePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    id: 'main',
    marking: DEFAULT_MARKING_PREFERENCES,
    fontSize: 'base',
    theme: 'auto',
    onboarding: { hasSeenWelcome: true, hasCompletedTour: true, dismissedTooltips: [] },
    ...overrides,
  };
}

describe('seedAppMode', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  async function sentEvents(): Promise<{ name: string; feature?: string }[]> {
    await shutdownTelemetry();
    return fetchMock.mock.calls.flatMap(call => {
      const init = call[1] as RequestInit;
      return (JSON.parse(init.body as string) as { events: { name: string; feature?: string }[] })
        .events;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('__APP_VERSION__', '9.9.9');
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    usePreferencesStore.setState({ telemetryEnabled: true });
    initTelemetry();
    useAppModeStore.setState({ mode: null, modesBannerPending: false });
    vi.mocked(countRows).mockResolvedValue(0);
  });

  afterEach(async () => {
    await shutdownTelemetry();
    vi.unstubAllGlobals();
    usePreferencesStore.setState({ telemetryEnabled: false });
  });

  it('puts a device that has not seen the Welcome screen in Discover, silently', async () => {
    await seedAppMode(
      makePrefs({
        inductiveToolsEnabled: true,
        onboarding: { hasSeenWelcome: false, hasCompletedTour: false, dismissedTooltips: [] },
      })
    );

    expect(useAppModeStore.getState().mode).toBe('discover');
    expect(useAppModeStore.getState().modesBannerPending).toBe(false);
    expect(countRows).not.toHaveBeenCalled();
    expect(await sentEvents()).toEqual([]);
  });

  it('seeds Study with the banner when inductiveToolsEnabled is true', async () => {
    await seedAppMode(makePrefs({ inductiveToolsEnabled: true }));

    expect(useAppModeStore.getState().mode).toBe('study');
    expect(useAppModeStore.getState().modesBannerPending).toBe(true);
    expect(await sentEvents()).toEqual([{ name: 'mode_chosen', feature: 'mode_study' }]);
  });

  it('seeds Discover with the banner when inductiveToolsEnabled is false, even with data', async () => {
    vi.mocked(countRows).mockResolvedValue(5);

    await seedAppMode(makePrefs({ inductiveToolsEnabled: false }));

    expect(useAppModeStore.getState().mode).toBe('discover');
    expect(useAppModeStore.getState().modesBannerPending).toBe(true);
    expect(countRows).not.toHaveBeenCalled();
    expect(await sentEvents()).toEqual([{ name: 'mode_chosen', feature: 'mode_discover' }]);
  });

  it.each(['marking_presets', 'annotations', 'notes'])(
    'seeds Study when the preference is absent and %s has rows',
    async table => {
      vi.mocked(countRows).mockImplementation(async name => (name === table ? 1 : 0));

      await seedAppMode(makePrefs());

      expect(useAppModeStore.getState().mode).toBe('study');
      expect(useAppModeStore.getState().modesBannerPending).toBe(true);
    }
  );

  it('seeds Discover when the preference is absent and there is no data', async () => {
    await seedAppMode(makePrefs());

    expect(useAppModeStore.getState().mode).toBe('discover');
    expect(useAppModeStore.getState().modesBannerPending).toBe(true);
    expect(await sentEvents()).toEqual([{ name: 'mode_chosen', feature: 'mode_discover' }]);
  });

  it('leaves a stored mode untouched', async () => {
    useAppModeStore.setState({ mode: 'read' });

    await seedAppMode(makePrefs({ inductiveToolsEnabled: true }));

    expect(useAppModeStore.getState().mode).toBe('read');
    expect(useAppModeStore.getState().modesBannerPending).toBe(false);
    expect(countRows).not.toHaveBeenCalled();
    expect(await sentEvents()).toEqual([]);
  });

  it('does not overwrite a mode set while the data check was pending', async () => {
    vi.mocked(countRows).mockImplementation(async () => {
      useAppModeStore.setState({ mode: 'read' });
      return 3;
    });

    await seedAppMode(makePrefs());

    expect(useAppModeStore.getState().mode).toBe('read');
    expect(useAppModeStore.getState().modesBannerPending).toBe(false);
  });

  it('sends no event when telemetry is off', async () => {
    usePreferencesStore.setState({ telemetryEnabled: false });

    await seedAppMode(makePrefs({ inductiveToolsEnabled: true }));

    expect(useAppModeStore.getState().mode).toBe('study');
    expect(await sentEvents()).toEqual([]);
  });
});
