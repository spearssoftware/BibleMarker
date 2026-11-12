/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';
import { useAppModeStore } from '@/stores/appModeStore';
import { getPreferences, updatePreferences } from '@/lib/database';

vi.mock('@/lib/database', () => ({
  getPreferences: vi.fn().mockResolvedValue({}),
  updatePreferences: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/theme', () => ({ applyTheme: vi.fn() }));
vi.mock('@/lib/debug', () => ({
  clearDebugFlagsCache: vi.fn(),
  getDebugFlags: vi.fn().mockResolvedValue({}),
}));
vi.mock('../AppearanceSection', () => ({ AppearanceSection: () => <div>Appearance content</div> }));
vi.mock('../StudiesSection', () => ({ StudiesSection: () => <div>Studies content</div> }));
vi.mock('../BibleSection', () => ({ BibleSection: () => <div>Bible content</div> }));
vi.mock('../DataSection', () => ({ DataSection: () => <div>Data content</div> }));
vi.mock('../AboutSection', () => ({ AboutSection: () => <div>About content</div> }));
vi.mock('../GettingStartedSection', () => ({ GettingStartedSection: () => <div>Getting started</div> }));
vi.mock('../KeyboardShortcutsHelp', () => ({ KeyboardShortcutsHelp: () => <div>Shortcuts</div> }));

afterEach(cleanup);

describe('SettingsPanel modes', () => {
  it('lists the Studies tab only in Study', async () => {
    useAppModeStore.setState({ mode: 'study' });
    const { unmount } = render(<SettingsPanel onClose={vi.fn()} />);
    await screen.findByText('Appearance content');
    expect(screen.getByRole('tab', { name: 'Studies' })).toBeTruthy();
    unmount();

    for (const mode of ['read', 'discover'] as const) {
      useAppModeStore.setState({ mode });
      const view = render(<SettingsPanel onClose={vi.fn()} />);
      await screen.findByText('Appearance content');
      expect(screen.queryByRole('tab', { name: 'Studies' })).toBeNull();
      view.unmount();
    }
  });

  it('falls back to Appearance when the mode leaves Study on the Studies tab', async () => {
    useAppModeStore.setState({ mode: 'study' });
    render(<SettingsPanel onClose={vi.fn()} initialTab="studies" />);
    await screen.findByText('Studies content');

    act(() => useAppModeStore.setState({ mode: 'read' }));

    expect(await screen.findByText('Appearance content')).toBeTruthy();
    expect(screen.queryByText('Studies content')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Appearance' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('SettingsPanel restart tour', () => {
  it('clears hasCompletedTour, keeps the other onboarding flags and dispatches restartOnboarding', async () => {
    vi.mocked(getPreferences).mockResolvedValue({
      onboarding: {
        hasSeenWelcome: true,
        hasSeenTranslationLibrary: true,
        hasCompletedTour: true,
        dismissedTooltips: ['a'],
      },
    } as Awaited<ReturnType<typeof getPreferences>>);
    const onClose = vi.fn();
    const restarted = vi.fn();
    window.addEventListener('restartOnboarding', restarted);
    useAppModeStore.setState({ mode: 'study' });
    render(<SettingsPanel onClose={onClose} initialTab="help" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restart Tour' }));

    await waitFor(() => expect(restarted).toHaveBeenCalledTimes(1));
    expect(updatePreferences).toHaveBeenCalledWith({
      onboarding: {
        hasSeenWelcome: true,
        hasSeenTranslationLibrary: true,
        hasCompletedTour: false,
        dismissedTooltips: ['a'],
      },
    });
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText('Show the guided tour again')).toBeTruthy();
    window.removeEventListener('restartOnboarding', restarted);
  });
});
