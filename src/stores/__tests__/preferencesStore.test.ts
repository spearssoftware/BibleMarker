import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { updatePreferences } from '@/lib/database';
import { DEFAULT_MARKING_PREFERENCES, type UserPreferences } from '@/types';

vi.mock('@/lib/database');

function makePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    id: 'main',
    marking: DEFAULT_MARKING_PREFERENCES,
    fontSize: 'base',
    theme: 'auto',
    ...overrides,
  };
}

describe('preferencesStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePreferencesStore.setState({
      inductiveToolsEnabled: false,
      telemetryEnabled: false,
      isHydrated: false,
    });
  });

  describe('hydrate', () => {
    it('defaults both flags to false when absent from prefs', () => {
      usePreferencesStore.getState().hydrate(makePrefs());

      const state = usePreferencesStore.getState();
      expect(state.inductiveToolsEnabled).toBe(false);
      expect(state.telemetryEnabled).toBe(false);
      expect(state.isHydrated).toBe(true);
    });

    it('reads true values from prefs', () => {
      usePreferencesStore.getState().hydrate(
        makePrefs({ inductiveToolsEnabled: true, telemetryEnabled: true })
      );

      const state = usePreferencesStore.getState();
      expect(state.inductiveToolsEnabled).toBe(true);
      expect(state.telemetryEnabled).toBe(true);
    });

    it('reads explicit false values from prefs', () => {
      usePreferencesStore.setState({ inductiveToolsEnabled: true });

      usePreferencesStore.getState().hydrate(
        makePrefs({ inductiveToolsEnabled: false })
      );

      expect(usePreferencesStore.getState().inductiveToolsEnabled).toBe(false);
    });
  });

  describe('setInductiveToolsEnabled', () => {
    it('updates state and persists the change', async () => {
      vi.mocked(updatePreferences).mockResolvedValue(undefined);

      await usePreferencesStore.getState().setInductiveToolsEnabled(true);

      expect(usePreferencesStore.getState().inductiveToolsEnabled).toBe(true);
      expect(updatePreferences).toHaveBeenCalledWith({ inductiveToolsEnabled: true });
    });

    it('keeps the optimistic state and logs when persistence fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(updatePreferences).mockRejectedValue(new Error('db unavailable'));

      await expect(
        usePreferencesStore.getState().setInductiveToolsEnabled(true)
      ).resolves.toBeUndefined();

      expect(usePreferencesStore.getState().inductiveToolsEnabled).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('setTelemetryEnabled', () => {
    it('updates state and persists the change', async () => {
      vi.mocked(updatePreferences).mockResolvedValue(undefined);

      await usePreferencesStore.getState().setTelemetryEnabled(true);

      expect(usePreferencesStore.getState().telemetryEnabled).toBe(true);
      expect(updatePreferences).toHaveBeenCalledWith({ telemetryEnabled: true });
    });
  });
});
