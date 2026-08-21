/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingTour } from '../OnboardingTour';
import { usePreferencesStore } from '@/stores/preferencesStore';

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
  'data-discovery-bar',
  'data-marking-toolbar',
  'data-toolbar-keywords',
  'data-toolbar-observe',
  'data-toolbar-analyze',
  'data-toolbar-reference',
  'data-nav-search',
  'data-toolbar-settings',
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
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('has no toolkit steps and includes the discovery step when tools are off', async () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: false, isHydrated: true });
    render(<OnboardingTour onComplete={vi.fn()} />);

    expect(screen.getByText('Navigation Bar')).toBeTruthy();
    await clickNext();

    await waitFor(() => expect(screen.getByText('Bible Reading')).toBeTruthy());
    await clickNext();

    await waitFor(() => expect(screen.getByText('Notice Something')).toBeTruthy());
    await clickNext();

    // Toolkit steps are filtered out, so the very next step is Search — not
    // Marking Toolbar / Key Words / Observe / Analyze / Study Tools.
    await waitFor(() => expect(screen.getByText('Search')).toBeTruthy());
    expect(screen.queryByText('Marking Toolbar')).toBeNull();
    expect(screen.queryByText('Key Words: Keyword, Match, Apply')).toBeNull();
  });

  it('includes the toolkit steps when tools are on', async () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true, isHydrated: true });
    render(<OnboardingTour onComplete={vi.fn()} />);

    expect(screen.getByText('Navigation Bar')).toBeTruthy();
    await clickNext();

    await waitFor(() => expect(screen.getByText('Bible Reading')).toBeTruthy());
    await clickNext();

    await waitFor(() => expect(screen.getByText('Notice Something')).toBeTruthy());
    await clickNext();

    await waitFor(() => expect(screen.getByText('Marking Toolbar')).toBeTruthy());
  });

  it('renders nothing until preferences finish hydrating', () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true, isHydrated: false });
    const { container } = render(<OnboardingTour onComplete={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
