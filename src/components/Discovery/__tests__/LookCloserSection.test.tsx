/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LookCloserSection } from '../LookCloserSection';
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { track } from '@/lib/telemetry';
import type { ConnectorHit } from '@/lib/chapterAnalysis';
import { makeDiscoveryContext } from '@/lib/__test__/factories';

vi.mock('@/lib/database');
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

function renderSection() {
  return render(
    <LookCloserSection book="Gen" chapter={12} translationId="nasb">
      <div id="discovery-card-repetition">cards</div>
    </LookCloserSection>
  );
}

const resetPrefs = () =>
  useDiscoveryPrefsStore.setState({ lookCloserOpen: undefined, lookCloserForcedFor: null });

describe('LookCloserSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPrefs();
    useDiscoveryStore.setState({ lens: null, activePrompt: null, context: makeDiscoveryContext({ book: 'Gen', chapter: 12 }) });
    usePreferencesStore.setState({ isHydrated: true, inductiveToolsEnabled: false });
  });
  afterEach(cleanup);

  it('is collapsed by default in discovery mode', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /Look closer/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('cards')).toBeNull();
  });

  it('is open by default in inductive mode', () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true });
    renderSection();
    expect(screen.getByText('cards')).toBeTruthy();
  });

  it('renders collapsed before preferences hydrate, then opens when they do', () => {
    usePreferencesStore.setState({ isHydrated: false, inductiveToolsEnabled: true });
    renderSection();
    expect(screen.queryByText('cards')).toBeNull();
    act(() => usePreferencesStore.setState({ isHydrated: true }));
    expect(screen.getByText('cards')).toBeTruthy();
  });

  it('lets the stored choice beat the mode default', () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true });
    useDiscoveryPrefsStore.setState({ lookCloserOpen: false });
    renderSection();
    expect(screen.queryByText('cards')).toBeNull();
  });

  it('toggles, stores the choice, and fires look_closer tapped', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Look closer/ }));
    expect(screen.getByText('cards')).toBeTruthy();
    expect(useDiscoveryPrefsStore.getState().lookCloserOpen).toBe(true);
    expect(track).toHaveBeenCalledWith('discovery_chip_tapped', {
      feature: 'look_closer',
      dedupeKey: 'discovery_chip_tapped:look_closer:Gen:12:nasb',
    });
    fireEvent.click(screen.getByRole('button', { name: /Look closer/ }));
    expect(screen.queryByText('cards')).toBeNull();
    expect(useDiscoveryPrefsStore.getState().lookCloserOpen).toBe(false);
  });

  it('is forced open by the connectors lens, an active prompt, or the session flag', () => {
    useDiscoveryPrefsStore.setState({ lookCloserOpen: false });

    useDiscoveryStore.setState({ lens: 'connectors' });
    renderSection();
    expect(screen.getByText('cards')).toBeTruthy();
    cleanup();

    useDiscoveryStore.setState({ lens: null, activePrompt: {} as ConnectorHit });
    renderSection();
    expect(screen.getByText('cards')).toBeTruthy();
    cleanup();

    useDiscoveryStore.setState({ activePrompt: null });
    useDiscoveryPrefsStore.getState().forceLookCloserOpen('Gen', 12);
    renderSection();
    expect(screen.getByText('cards')).toBeTruthy();
  });

  it('lets the reader close a session-forced section', () => {
    useDiscoveryPrefsStore.getState().forceLookCloserOpen('Gen', 12);
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Look closer/ }));
    expect(screen.queryByText('cards')).toBeNull();
  });

  it('disables the toggle while an active prompt or lens forces it open', () => {
    useDiscoveryPrefsStore.setState({ lookCloserOpen: undefined });
    for (const forced of [{ lens: 'connectors' as const, activePrompt: null }, { lens: null, activePrompt: {} as ConnectorHit }]) {
      useDiscoveryStore.setState(forced);
      renderSection();
      const toggle = screen.getByRole('button', { name: /Look closer/ }) as HTMLButtonElement;
      expect(toggle.disabled).toBe(true);
      fireEvent.click(toggle);
      expect(useDiscoveryPrefsStore.getState().lookCloserOpen).toBeUndefined();
      expect(track).not.toHaveBeenCalled();
      expect(screen.getByText('cards')).toBeTruthy();
      cleanup();
    }
  });

  it('stops forcing open once the reader moves to another chapter', () => {
    useDiscoveryPrefsStore.getState().forceLookCloserOpen('Gen', 12);
    renderSection();
    expect(screen.getByText('cards')).toBeTruthy();
    act(() => useDiscoveryStore.setState({ context: makeDiscoveryContext({ book: 'Gen', chapter: 13 }) }));
    expect(screen.queryByText('cards')).toBeNull();
  });

  it('persists only lookCloserOpen', () => {
    useDiscoveryPrefsStore.getState().forceLookCloserOpen('Gen', 12);
    useDiscoveryPrefsStore.getState().setLookCloserOpen(true);
    const options = useDiscoveryPrefsStore.persist.getOptions();
    expect(options.name).toBe('discovery-prefs');
    expect(options.partialize?.(useDiscoveryPrefsStore.getState())).toEqual({ lookCloserOpen: true });
  });
});
