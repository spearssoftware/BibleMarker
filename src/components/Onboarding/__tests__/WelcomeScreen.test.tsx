/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { WelcomeScreen } from '../WelcomeScreen';
import { getPreferences, updatePreferences } from '@/lib/database';
import { DEFAULT_FLAGS, FLAG_KEYS } from '@/lib/feature-flags';
import { useAppModeStore } from '@/stores/appModeStore';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { DEFAULT_MARKING_PREFERENCES } from '@/types';

vi.mock('@/lib/database', () => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn().mockResolvedValue(undefined),
}));

function setDiscoveryFlag(enabled: boolean) {
  useFeatureFlagsStore.setState({
    flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: enabled },
  });
}

function renderWelcome() {
  const onComplete = vi.fn();
  const onStartTour = vi.fn();
  const view = render(<WelcomeScreen onComplete={onComplete} onStartTour={onStartTour} />);
  return { ...view, onComplete, onStartTour };
}

beforeEach(() => {
  vi.mocked(getPreferences).mockResolvedValue({
    id: 'main',
    marking: DEFAULT_MARKING_PREFERENCES,
    fontSize: 'base',
    theme: 'auto',
    onboarding: { hasSeenWelcome: false, hasCompletedTour: false, dismissedTooltips: [] },
  });
  setDiscoveryFlag(true);
  useAppModeStore.setState({ mode: null, modesBannerPending: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WelcomeScreen', () => {
  it('asks how to start with the three modes, the helper line and an accessible dialog', () => {
    renderWelcome();

    expect(screen.getByRole('dialog', { name: 'Welcome to BibleMarker' }).getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Read, discover and study the Bible, and mark it as you go.')).toBeTruthy();
    expect(screen.getByText('How do you want to start?')).toBeTruthy();
    expect(screen.getAllByRole('radio').map(radio => radio.textContent)).toEqual([
      'ReadJust the text. Highlight and mark as you go.',
      'DiscoverSee the setting, people, places and commentary beside the text.',
      'StudyThe full inductive toolset: key words, observation lists, chapter titles and analysis.',
    ]);
    expect(screen.getByText('You can switch any time from the top bar.')).toBeTruthy();
    expect(screen.queryByText('Key Features')).toBeNull();
    expect(screen.queryByText('Quick Tips')).toBeNull();
  });

  it('disables both buttons until a mode is chosen', () => {
    renderWelcome();
    const getStarted = screen.getByRole('button', { name: 'Get Started' }) as HTMLButtonElement;
    const takeTour = screen.getByRole('button', { name: 'Take Tour' }) as HTMLButtonElement;
    expect(getStarted.disabled).toBe(true);
    expect(takeTour.disabled).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: /^Read/ }));

    expect(getStarted.disabled).toBe(false);
    expect(takeTour.disabled).toBe(false);
    expect(screen.getByRole('radio', { name: /^Read/ }).getAttribute('aria-checked')).toBe('true');
  });

  it.each([
    ['Read', 'read'],
    ['Discover', 'discover'],
    ['Study', 'study'],
  ] as const)('choosing %s then Get Started sets the mode and completes', async (label, mode) => {
    const { onComplete, onStartTour } = renderWelcome();

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${label}`) }));
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(useAppModeStore.getState().mode).toBe(mode);
    expect(updatePreferences).toHaveBeenCalledWith({
      onboarding: expect.objectContaining({ hasSeenWelcome: true }),
    });
    expect(onStartTour).not.toHaveBeenCalled();
  });

  it('Take Tour sets the mode and starts the tour', async () => {
    const { onComplete, onStartTour } = renderWelcome();

    fireEvent.click(screen.getByRole('radio', { name: /^Study/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Take Tour' }));

    await waitFor(() => expect(onStartTour).toHaveBeenCalledTimes(1));
    expect(useAppModeStore.getState().mode).toBe('study');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does nothing when the backdrop is clicked', () => {
    const { container, onComplete, onStartTour } = renderWelcome();

    const backdrop = container.querySelector('.backdrop-overlay');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    expect(onComplete).not.toHaveBeenCalled();
    expect(onStartTour).not.toHaveBeenCalled();
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(useAppModeStore.getState().mode).toBeNull();
  });

  it('offers only Read and Study when the Discover kill switch is off', () => {
    setDiscoveryFlag(false);
    renderWelcome();

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('radio', { name: /^Discover/ })).toBeNull();
  });

  it('preselects a stored mode', () => {
    useAppModeStore.setState({ mode: 'study' });
    renderWelcome();

    expect(screen.getByRole('radio', { name: /^Study/ }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByRole('button', { name: 'Take Tour' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not preselect a stored Discover when it is not offered', () => {
    setDiscoveryFlag(false);
    useAppModeStore.setState({ mode: 'discover' });
    renderWelcome();

    expect(screen.getAllByRole('radio').every(r => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });
});
