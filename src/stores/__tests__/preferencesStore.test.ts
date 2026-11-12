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
      telemetryEnabled: false,
      isHydrated: false,
    });
  });

  describe('hydrate', () => {
    it('defaults telemetry to false when absent from prefs', () => {
      usePreferencesStore.getState().hydrate(makePrefs());

      const state = usePreferencesStore.getState();
      expect(state.telemetryEnabled).toBe(false);
      expect(state.isHydrated).toBe(true);
    });

    it('reads a true value from prefs', () => {
      usePreferencesStore.getState().hydrate(makePrefs({ telemetryEnabled: true }));

      expect(usePreferencesStore.getState().telemetryEnabled).toBe(true);
    });

    it('reads an explicit false value from prefs', () => {
      usePreferencesStore.setState({ telemetryEnabled: true });

      usePreferencesStore.getState().hydrate(makePrefs({ telemetryEnabled: false }));

      expect(usePreferencesStore.getState().telemetryEnabled).toBe(false);
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
