import { describe, it, expect, beforeEach } from 'vitest';
import { useAppModeStore } from '../appModeStore';

describe('appModeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppModeStore.setState({ mode: null, modesBannerPending: false });
  });

  it('defaults to no mode and no pending banner', () => {
    expect(useAppModeStore.getState().mode).toBeNull();
    expect(useAppModeStore.getState().modesBannerPending).toBe(false);
  });

  it('sets the mode and persists it', () => {
    useAppModeStore.getState().setMode('study');

    expect(useAppModeStore.getState().mode).toBe('study');
    const stored = JSON.parse(localStorage.getItem('app-mode') ?? '{}') as {
      state: { mode: string };
    };
    expect(stored.state.mode).toBe('study');
  });

  it('loads a stored mode that is not one of the three as null', async () => {
    localStorage.setItem(
      'app-mode',
      JSON.stringify({ state: { mode: 'bogus', modesBannerPending: false }, version: 0 })
    );

    await useAppModeStore.persist.rehydrate();

    expect(useAppModeStore.getState().mode).toBeNull();
  });

  it('loads a valid stored mode', async () => {
    localStorage.setItem(
      'app-mode',
      JSON.stringify({ state: { mode: 'discover', modesBannerPending: true }, version: 0 })
    );

    await useAppModeStore.persist.rehydrate();

    expect(useAppModeStore.getState().mode).toBe('discover');
    expect(useAppModeStore.getState().modesBannerPending).toBe(true);
  });

  it('raises and dismisses the banner flag', () => {
    useAppModeStore.getState().setModesBannerPending(true);
    expect(useAppModeStore.getState().modesBannerPending).toBe(true);

    useAppModeStore.getState().setModesBannerPending(false);
    expect(useAppModeStore.getState().modesBannerPending).toBe(false);
  });
});
