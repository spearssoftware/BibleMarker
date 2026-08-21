import { describe, it, expect, vi, beforeEach } from 'vitest';
import { maybeEnableInductiveTools } from './toolkitMigration';
import { countRows } from './database';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { DEFAULT_MARKING_PREFERENCES, type UserPreferences } from '@/types';

vi.mock('./database');

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

describe('maybeEnableInductiveTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePreferencesStore.setState({
      inductiveToolsEnabled: false,
      telemetryEnabled: false,
      isHydrated: false,
    });
  });

  it('skips a fresh install with no existing data', async () => {
    vi.mocked(countRows).mockResolvedValue(0);

    const result = await maybeEnableInductiveTools(makePrefs());

    expect(result).toBe(false);
    expect(usePreferencesStore.getState().inductiveToolsEnabled).toBe(false);
  });

  it('enables tools when the preference is undefined and prior data exists', async () => {
    vi.mocked(countRows).mockImplementation(async (table: string) =>
      table === 'annotations' ? 3 : 0
    );

    const result = await maybeEnableInductiveTools(makePrefs());

    expect(result).toBe(true);
    expect(usePreferencesStore.getState().inductiveToolsEnabled).toBe(true);
  });

  it('enables tools when only marking_presets or notes have data', async () => {
    vi.mocked(countRows).mockImplementation(async (table: string) =>
      table === 'notes' ? 1 : 0
    );

    const result = await maybeEnableInductiveTools(makePrefs());

    expect(result).toBe(true);
  });

  it('skips when inductiveToolsEnabled is already set (even to false)', async () => {
    vi.mocked(countRows).mockResolvedValue(5);

    const result = await maybeEnableInductiveTools(makePrefs({ inductiveToolsEnabled: false }));

    expect(result).toBe(false);
    expect(countRows).not.toHaveBeenCalled();
  });

  it('skips a brand-new profile that has not seen the welcome screen yet', async () => {
    vi.mocked(countRows).mockResolvedValue(5);

    const result = await maybeEnableInductiveTools(
      makePrefs({ onboarding: { hasSeenWelcome: false, hasCompletedTour: false, dismissedTooltips: [] } })
    );

    expect(result).toBe(false);
    expect(countRows).not.toHaveBeenCalled();
  });
});
