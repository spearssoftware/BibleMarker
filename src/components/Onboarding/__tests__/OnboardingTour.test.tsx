/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingTour } from '../OnboardingTour';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useAppModeStore } from '@/stores/appModeStore';
import { usePanelStore } from '@/stores/panelStore';

vi.mock('@/lib/database', () => ({
  getPreferences: vi.fn().mockResolvedValue({
    onboarding: { hasSeenWelcome: true, hasCompletedTour: false, dismissedTooltips: [] },
  }),
  updatePreferences: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/stores/studyStore', () => ({
  useStudyStore: () => ({
    createStudy: vi.fn(),
    setActiveStudy: vi.fn(),
  }),
}));

// Every selector any tour step might target. Stubbing all of them with a
// non-zero-size element means the component never auto-skips a step for a
// "missing" target — this test drives navigation explicitly via "Next"
// clicks instead of racing the component's own 500ms auto-skip timer.
const TOUR_TARGET_ATTRS = [
  'data-nav-bar',
  'data-bible-reader',
  'data-toolbar-discover',
  'data-marking-toolbar',
  'data-toolbar-keywords',
  'data-toolbar-observe',
  'data-toolbar-analyze',
  'data-toolbar-reference',
  'data-nav-search',
  'data-nav-more',
];

function stubTargets() {
  for (const attr of TOUR_TARGET_ATTRS) {
    const el = document.createElement('div');
    el.setAttribute(attr, 'true');
    el.getBoundingClientRect = () => ({
      top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0,
      toJSON: () => ({}),
    });
    document.body.appendChild(el);
  }
}

async function clickNext() {
  const user = userEvent.setup();
  await user.click(screen.getByText(/^(Next|Finish)$/));
}

describe('OnboardingTour', () => {
  beforeEach(() => {
    stubTargets();
    usePanelStore.setState({ orientation: 'vertical' });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('has no toolkit steps and no Study Tools in Discover mode', async () => {
    useAppModeStore.setState({ mode: 'discover' });
    usePreferencesStore.setState({ isHydrated: true });
    render(<OnboardingTour onComplete={vi.fn()} />);

    expect(screen.getByText('Navigation Bar')).toBeTruthy();
    await clickNext();

    await waitFor(() => expect(screen.getByText('Bible Reading')).toBeTruthy());
    await clickNext();

    await waitFor(() => expect(screen.getByText('Notice Something')).toBeTruthy());
    await clickNext();

    // Study-only steps (Marking Toolbar through Study Tools) are filtered out.
    await waitFor(() => expect(screen.getByText('Search')).toBeTruthy());
    expect(screen.queryByText('Marking Toolbar')).toBeNull();
    expect(screen.queryByText('Key Words: Keyword, Match, Apply')).toBeNull();
    expect(screen.queryByText('Study Tools')).toBeNull();
    await clickNext();

    await waitFor(() => expect(screen.getByText('Settings')).toBeTruthy());
    expect(screen.getByText('Open the ⋯ menu in the top bar and choose Settings.', { exact: false })).toBeTruthy();

    // The studies step is Study only, so Settings is the last step.
    expect(screen.getByText('Finish')).toBeTruthy();
    expect(screen.queryByText('Create a Study')).toBeNull();
  });

  it('skips the Discover step in Discover mode on a wide layout', async () => {
    useAppModeStore.setState({ mode: 'discover' });
    usePanelStore.setState({ orientation: 'horizontal' });
    usePreferencesStore.setState({ isHydrated: true });
    render(<OnboardingTour onComplete={vi.fn()} />);

    await clickNext();
    await waitFor(() => expect(screen.getByText('Bible Reading')).toBeTruthy());
    await clickNext();

    await waitFor(() => expect(screen.getByText('Search')).toBeTruthy());
    expect(screen.queryByText('Notice Something')).toBeNull();
  });

  it('skips the Discover step in Read mode', async () => {
    useAppModeStore.setState({ mode: 'read' });
    usePreferencesStore.setState({ isHydrated: true });
    render(<OnboardingTour onComplete={vi.fn()} />);

    await clickNext();
    await waitFor(() => expect(screen.getByText('Bible Reading')).toBeTruthy());
    await clickNext();

    await waitFor(() => expect(screen.getByText('Search')).toBeTruthy());
    expect(screen.queryByText('Notice Something')).toBeNull();
  });

  it('includes the toolkit steps when tools are on', async () => {
    useAppModeStore.setState({ mode: 'study' });
    usePreferencesStore.setState({ isHydrated: true });
    render(<OnboardingTour onComplete={vi.fn()} />);

    expect(screen.getByText('Navigation Bar')).toBeTruthy();
    await clickNext();

    await waitFor(() => expect(screen.getByText('Bible Reading')).toBeTruthy());
    await clickNext();

    await waitFor(() => expect(screen.getByText('Notice Something')).toBeTruthy());
    await clickNext();

    await waitFor(() => expect(screen.getByText('Marking Toolbar')).toBeTruthy());
    for (const title of ['Key Words: Keyword, Match, Apply', 'Observe', 'Analyze', 'Study Tools']) {
      await clickNext();
      await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    }
  });

  it('keeps the same steps when the mode changes mid-tour', async () => {
    useAppModeStore.setState({ mode: 'study' });
    usePreferencesStore.setState({ isHydrated: true });
    const onComplete = vi.fn();
    render(<OnboardingTour onComplete={onComplete} />);

    for (const title of ['Bible Reading', 'Notice Something', 'Marking Toolbar']) {
      await clickNext();
      await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    }

    act(() => useAppModeStore.setState({ mode: 'read' }));

    expect(screen.getByText('Marking Toolbar')).toBeTruthy();
    expect(screen.getByText('Step 4 of 11')).toBeTruthy();

    for (const title of ['Key Words: Keyword, Match, Apply', 'Observe', 'Analyze', 'Study Tools', 'Search', 'Settings', 'Create a Study']) {
      await clickNext();
      await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    }
    await clickNext();
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});
