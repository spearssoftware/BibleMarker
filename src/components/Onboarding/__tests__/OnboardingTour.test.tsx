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
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { DEFAULT_FLAGS, FLAG_KEYS } from '@/lib/feature-flags';

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
  'data-discover-panel',
  'data-mode-switch',
  'data-marking-toolbar',
  'data-toolbar-keywords',
  'data-toolbar-observe',
  'data-toolbar-analyze',
  'data-toolbar-reference',
  'data-nav-search',
  'data-nav-more',
];

function stubTarget(attr: string, top = 0) {
  const el = document.createElement('div');
  el.setAttribute(attr, 'true');
  el.getBoundingClientRect = () => ({
    top, left: 0, right: 100, bottom: top + 100, width: 100, height: 100, x: 0, y: top,
    toJSON: () => ({}),
  });
  document.body.appendChild(el);
}

function stubTargets(attrs: readonly string[] = TOUR_TARGET_ATTRS) {
  for (const attr of attrs) stubTarget(attr);
}

async function clickNext() {
  const user = userEvent.setup();
  await user.click(screen.getByText(/^(Next|Finish)$/));
}

function currentTitle(): string | null {
  return screen.getByRole('heading', { level: 3 }).textContent;
}

/** Walks the tour with "Next" and returns every step title, stopping on the last step. */
async function walkTitles(): Promise<string[]> {
  const titles = [currentTitle()];
  while (screen.queryByText('Finish') === null) {
    await clickNext();
    titles.push(currentTitle());
  }
  return titles as string[];
}

function highlightTop(): number | null {
  const el = document.querySelector<HTMLElement>('.animate-pulse');
  return el ? Number.parseFloat(el.style.top) + 4 : null;
}

function setDiscoveryFlag(enabled: boolean) {
  useFeatureFlagsStore.setState({
    flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: enabled },
  });
}

const READ_TITLES = ['Navigation Bar', 'Bible Reading', 'Mark as you read', 'Switch modes'];
const DISCOVER_TITLES = ['Navigation Bar', 'Bible Reading', 'Mark as you read', 'Discover', 'Switch modes'];
const STUDY_TITLES = [
  'Navigation Bar', 'Bible Reading', 'Marking Toolbar',
  'Key Words: Keyword, Match, Apply', 'Observe', 'Analyze', 'Study Tools', 'Search', 'Settings',
  'Create a Study', 'Switch modes',
];

describe('OnboardingTour', () => {
  beforeEach(() => {
    stubTargets();
    usePanelStore.setState({ orientation: 'vertical' });
    useDiscoveryPrefsStore.setState({ discoverPanelClosed: false });
    setDiscoveryFlag(true);
    usePreferencesStore.setState({ isHydrated: true });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it.each([
    ['read', READ_TITLES],
    ['discover', DISCOVER_TITLES],
    ['study', STUDY_TITLES],
  ] as const)('walks the %s tour in order', async (mode, titles) => {
    useAppModeStore.setState({ mode });
    render(<OnboardingTour onComplete={vi.fn()} />);

    expect(await walkTitles()).toEqual(titles);
    expect(screen.getByText(`Step ${titles.length} of ${titles.length}`)).toBeTruthy();
  });

  it('ends every tour on "Switch modes"', async () => {
    for (const mode of ['read', 'discover', 'study'] as const) {
      useAppModeStore.setState({ mode });
      const view = render(<OnboardingTour onComplete={vi.fn()} />);
      const titles = await walkTitles();
      expect(titles[titles.length - 1]).toBe('Switch modes');
      view.unmount();
    }
  });

  it('uses the new reading and marking wording', async () => {
    useAppModeStore.setState({ mode: 'read' });
    render(<OnboardingTour onComplete={vi.fn()} />);

    await clickNext();
    expect(screen.getByText('Read Scripture here. Tap or click a verse number to add a note.')).toBeTruthy();
    await clickNext();
    expect(
      screen.getByText(
        'Select a word or phrase to highlight, underline or color it. Choose "every one in this chapter" to mark each place it appears.'
      )
    ).toBeTruthy();
  });

  it('mentions Discover in the Study toolbar step', async () => {
    useAppModeStore.setState({ mode: 'study' });
    render(<OnboardingTour onComplete={vi.fn()} />);

    for (let i = 0; i < 2; i++) await clickNext();

    expect(screen.getByText('The toolbar opens Discover, Key Words,', { exact: false })).toBeTruthy();
  });

  it('targets the Discover button on a narrow layout', async () => {
    document.body.innerHTML = '';
    stubTargets(TOUR_TARGET_ATTRS.filter(a => a !== 'data-toolbar-discover' && a !== 'data-discover-panel'));
    stubTarget('data-toolbar-discover', 200);
    stubTarget('data-discover-panel', 400);
    useAppModeStore.setState({ mode: 'discover' });
    render(<OnboardingTour onComplete={vi.fn()} />);

    for (let i = 0; i < 3; i++) await clickNext();
    expect(currentTitle()).toBe('Discover');

    await waitFor(() => expect(highlightTop()).toBe(200));
  });

  it('targets the Discover panel on a wide layout', async () => {
    document.body.innerHTML = '';
    stubTargets(TOUR_TARGET_ATTRS.filter(a => a !== 'data-toolbar-discover' && a !== 'data-discover-panel'));
    stubTarget('data-toolbar-discover', 200);
    stubTarget('data-discover-panel', 400);
    usePanelStore.setState({ orientation: 'horizontal' });
    useAppModeStore.setState({ mode: 'discover' });
    render(<OnboardingTour onComplete={vi.fn()} />);

    for (let i = 0; i < 3; i++) await clickNext();
    expect(currentTitle()).toBe('Discover');

    await waitFor(() => expect(highlightTop()).toBe(400));
  });

  it('omits the Discover step on a wide layout when the user closed the panel', async () => {
    usePanelStore.setState({ orientation: 'horizontal' });
    useDiscoveryPrefsStore.setState({ discoverPanelClosed: true });
    useAppModeStore.setState({ mode: 'discover' });
    render(<OnboardingTour onComplete={vi.fn()} />);

    expect(await walkTitles()).toEqual(READ_TITLES);
  });

  it('keeps the Discover step on a narrow layout even when the panel was closed', async () => {
    useDiscoveryPrefsStore.setState({ discoverPanelClosed: true });
    useAppModeStore.setState({ mode: 'discover' });
    render(<OnboardingTour onComplete={vi.fn()} />);

    expect(await walkTitles()).toEqual(DISCOVER_TITLES);
  });

  it('uses the two-mode wording when Discover is unavailable', async () => {
    setDiscoveryFlag(false);
    useAppModeStore.setState({ mode: 'discover' });
    render(<OnboardingTour onComplete={vi.fn()} />);

    expect(await walkTitles()).toEqual(READ_TITLES);
    expect(screen.getByText('Read and Study are one tap apart in the top bar.')).toBeTruthy();
  });

  it('uses the three-mode wording when Discover is available', async () => {
    useAppModeStore.setState({ mode: 'read' });
    render(<OnboardingTour onComplete={vi.fn()} />);

    await walkTitles();
    expect(screen.getByText('Read, Discover and Study are one tap apart in the top bar.')).toBeTruthy();
  });

  it('keeps the same steps when the mode changes mid-tour', async () => {
    useAppModeStore.setState({ mode: 'study' });
    const onComplete = vi.fn();
    render(<OnboardingTour onComplete={onComplete} />);

    for (const title of ['Bible Reading', 'Marking Toolbar']) {
      await clickNext();
      await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    }

    act(() => useAppModeStore.setState({ mode: 'read' }));

    expect(screen.getByText('Marking Toolbar')).toBeTruthy();
    expect(screen.getByText('Step 3 of 11')).toBeTruthy();

    for (const title of STUDY_TITLES.slice(3)) {
      await clickNext();
      await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    }
    await clickNext();
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});
