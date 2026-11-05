/**
 * @vitest-environment jsdom
 *
 * DiscoveryPanel composes the "reading…" / card states, plus the
 * `discovery_chip_shown` telemetry that lives here (not in the
 * always-mounted `useDiscoveryHost`) so it only fires when a card is
 * actually rendered. ConnectorsCard, CrossRefsCard and the map are
 * shallow-mocked so this file mostly exercises DiscoveryPanel's own
 * branching. Setting, Who's here, Look closer and RepetitionCard are left
 * un-mocked (only the Gnosis hooks beneath them are stubbed) so section
 * order and Look closer gating are verified end-to-end.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DiscoveryPanel } from '../DiscoveryPanel';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import type { ChapterEvent, ChapterPerson, ChapterPlace } from '@/types';
import { DEFAULT_DISCOVERY_THRESHOLDS } from '@/lib/chapterAnalysis';
import { makeChapterAnalysis, makeCrossRefPassageRow, makeDiscoveryContext } from '@/lib/__test__/factories';

const NO_CROSS_REF_PASSAGES = { rows: [], expand: () => {} };
const ONE_CROSS_REF_PASSAGE = { rows: [makeCrossRefPassageRow()], expand: () => {} };

vi.mock('@/lib/database', () => ({
  updatePreferences: vi.fn(async () => {}),
  getPreferences: vi.fn(async () => ({})),
}));

vi.mock('@/stores/studyStore', () => ({
  useStudyStore: (selector: (s: { activeStudyId: string | null }) => unknown) =>
    selector({ activeStudyId: null }),
}));

type MockEntities = { book: string; chapter: number; people: string[]; places: string[]; events: string[]; topics: string[] } | null;
interface GnosisState<T> { data: T | null; isLoading: boolean; error: string | null }
const ready = <T,>(data: T | null = null): GnosisState<T> => ({ data, isLoading: false, error: null });
let mockEntities: MockEntities = null;
let mockEntitiesLoading = false;
let mockEntitiesError: string | null = null;
let peopleState: GnosisState<ChapterPerson[]>;
let placesState: GnosisState<ChapterPlace[]>;
let eventsState: GnosisState<ChapterEvent[]>;
let yearState: GnosisState<{ year: number; yearDisplay: string }>;
vi.mock('@/hooks/useGnosis', () => ({
  useChapterEntities: () => ({ entities: mockEntities, isLoading: mockEntitiesLoading, error: mockEntitiesError }),
  useChapterPeople: () => ({ people: peopleState.data, isLoading: peopleState.isLoading, error: peopleState.error }),
  useChapterPlaces: () => ({ places: placesState.data, isLoading: placesState.isLoading, error: placesState.error }),
  useChapterEvents: () => ({ events: eventsState.data, isLoading: eventsState.isLoading, error: eventsState.error }),
  useChapterYear: () => ({ year: yearState.data, isLoading: yearState.isLoading, error: yearState.error }),
  usePeopleSpread: () => ({ spread: null, isLoading: false, error: null }),
}));

let discoveryEnabled = true;
vi.mock('@/lib/discovery-config', () => ({
  useDiscoveryConfig: () => DEFAULT_DISCOVERY_THRESHOLDS,
  useDiscoveryEnabled: () => discoveryEnabled,
}));

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

vi.mock('../ConnectorsCard', () => ({
  ConnectorsCard: () => <div data-testid="connectors-card">connectors</div>,
}));
vi.mock('../ChapterMap', () => ({
  ChapterMap: () => <div data-testid="chapter-map">map</div>,
}));
vi.mock('../ChapterMapModal', () => ({
  ChapterMapModal: () => null,
}));
vi.mock('../WorthNoticingCard', () => ({
  WorthNoticingCard: () => <div data-testid="worth-noticing-card">worth noticing</div>,
}));
vi.mock('../CrossRefsCard', () => ({
  CrossRefsCard: () => <div data-testid="cross-refs-card">cross-refs</div>,
}));

vi.mock('../CommentaryCard', () => ({
  CommentaryCard: () => <div data-testid="commentary-card">commentary</div>,
}));

const PEOPLE: ChapterPerson[] = [{ slug: 'jesus-son-of-joseph', name: 'Jesus', verses: [1, 2] }];
const LOOK_CLOSER = { name: /Look closer/ };

function openLookCloser() {
  useDiscoveryPrefsStore.setState({ lookCloserOpen: true });
}

function sectionOrder(container: HTMLElement): string[] {
  const dialog = container.querySelector('[role="dialog"] > div');
  return Array.from(dialog?.children ?? []).map(el => {
    if (el.getAttribute('data-testid') === 'worth-noticing-card') return 'worth-noticing';
    if (el.getAttribute('data-testid') === 'cross-refs-card') return 'cross-refs';
    if (el.getAttribute('data-testid') === 'commentary-card') return 'commentary';
    if (el.querySelector('h3')?.textContent?.startsWith('John')) return 'setting';
    if (el.querySelector('h3')?.textContent === "Who's here") return 'whos-here';
    if (el.querySelector('button[aria-expanded]')?.textContent?.includes('Look closer')) return 'look-closer';
    return 'unknown';
  });
}

describe('DiscoveryPanel', () => {
  beforeEach(() => {
    mockEntities = null;
    mockEntitiesLoading = false;
    mockEntitiesError = null;
    peopleState = ready();
    placesState = ready();
    eventsState = ready();
    yearState = ready();
    discoveryEnabled = true;
    trackMock.mockClear();
    useDiscoveryPrefsStore.setState({ lookCloserOpen: undefined });
    usePreferencesStore.setState({ isHydrated: true, inductiveToolsEnabled: false });
    useDiscoveryStore.setState({
      context: null,
      lens: null,
      activePrompt: null,
      activeCrossRefKey: null,
      crossRefPassages: NO_CROSS_REF_PASSAGES,
      laterCrossRefPassages: NO_CROSS_REF_PASSAGES,
    });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('shows "Reading the chapter…" when analysis has not arrived yet', () => {
    render(<DiscoveryPanel />);
    expect(screen.getByText('Reading the chapter…')).toBeTruthy();
  });

  it('shows a muted message when the Discover kill switch is off, even before analysis arrives', () => {
    discoveryEnabled = false;
    render(<DiscoveryPanel />);
    expect(screen.getByText('Discover is turned off right now.')).toBeTruthy();
    expect(screen.queryByText('Reading the chapter…')).toBeNull();
  });

  it('shows Setting immediately, even when Gnosis never resolves', () => {
    useDiscoveryStore.setState({
      context: makeDiscoveryContext({ analysis: { repetition: null, connectors: [], connectorRangesByVerse: new Map() } }),
    });
    render(<DiscoveryPanel />);
    expect(screen.queryByText('Reading the chapter…')).toBeNull();
    expect(screen.getByText('John — a gospel')).toBeTruthy();
  });

  it('renders sections in Setting → Who\'s here → Worth noticing → Cross-References → Commentary → Look closer order, with the analytic cards inside Look closer', () => {
    mockEntities = { book: 'John', chapter: 1, people: ['jesus-son-of-joseph'], places: [], events: [], topics: [] };
    peopleState = ready(PEOPLE);
    useDiscoveryStore.setState({
      context: makeDiscoveryContext({ translationCount: 2, primaryTranslationAbbrev: 'NASB' }),
      crossRefPassages: ONE_CROSS_REF_PASSAGE,
    });
    openLookCloser();
    const { container } = render(<DiscoveryPanel />);
    expect(sectionOrder(container)).toEqual(['setting', 'whos-here', 'worth-noticing', 'cross-refs', 'commentary', 'look-closer']);
    const lookCloser = container.querySelector('section') as HTMLElement;
    const inner = Array.from(lookCloser.children).slice(1).map(el => {
      if (el.textContent?.includes('appears 11×')) return 'repetition';
      if (el.getAttribute('data-testid') === 'connectors-card') return 'connectors';
      return 'unknown';
    });
    expect(inner).toEqual(['repetition', 'connectors']);
  });

  it('resets Setting\'s local state when the chapter changes', () => {
    useDiscoveryStore.setState({ context: makeDiscoveryContext({ chapter: 2 }) });
    render(<DiscoveryPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'About John' }));
    expect(screen.getByRole('button', { name: 'About John' }).getAttribute('aria-expanded')).toBe('true');
    act(() => useDiscoveryStore.setState({ context: makeDiscoveryContext({ chapter: 3 }) }));
    expect(screen.getByRole('button', { name: 'About John' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('hides the cross-refs card when the host published no cross-reference rows', () => {
    useDiscoveryStore.setState({ context: makeDiscoveryContext(), crossRefPassages: NO_CROSS_REF_PASSAGES });
    render(<DiscoveryPanel />);
    expect(screen.queryByTestId('cross-refs-card')).toBeNull();
  });

  it('shows the cross-refs card when the host published cross-reference rows', () => {
    useDiscoveryStore.setState({ context: makeDiscoveryContext(), crossRefPassages: ONE_CROSS_REF_PASSAGE });
    render(<DiscoveryPanel />);
    expect(screen.getByTestId('cross-refs-card')).toBeTruthy();
  });

  describe('Look closer', () => {
    beforeEach(() => {
      useDiscoveryStore.setState({ context: makeDiscoveryContext({ translationCount: 2, primaryTranslationAbbrev: 'NASB' }) });
    });

    it('is collapsed in discovery mode', () => {
      render(<DiscoveryPanel />);
      expect(screen.getByRole('button', LOOK_CLOSER).getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText(/appears 11×/)).toBeNull();
      expect(screen.queryByTestId('connectors-card')).toBeNull();
    });

    it('is expanded with inductive tools on, showing the real RepetitionCard suffix and connectors', () => {
      usePreferencesStore.setState({ inductiveToolsEnabled: true });
      render(<DiscoveryPanel />);
      expect(screen.getByRole('button', LOOK_CLOSER).getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('“Word” appears 11× in this chapter (NASB)')).toBeTruthy();
      expect(screen.getByTestId('connectors-card')).toBeTruthy();
    });

    it('stays collapsed before preferences hydrate, even with inductive tools on', () => {
      usePreferencesStore.setState({ isHydrated: false, inductiveToolsEnabled: true });
      render(<DiscoveryPanel />);
      expect(screen.getByRole('button', LOOK_CLOSER).getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByTestId('connectors-card')).toBeNull();
    });

    it('honors a persisted override over the mode default', () => {
      usePreferencesStore.setState({ inductiveToolsEnabled: true });
      useDiscoveryPrefsStore.setState({ lookCloserOpen: false });
      render(<DiscoveryPanel />);
      expect(screen.getByRole('button', LOOK_CLOSER).getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByTestId('connectors-card')).toBeNull();
    });

    it('opens when the reader taps it', () => {
      render(<DiscoveryPanel />);
      fireEvent.click(screen.getByRole('button', LOOK_CLOSER));
      expect(screen.getByTestId('connectors-card')).toBeTruthy();
    });

    it('is omitted entirely when the chapter has neither a repetition nor enough connectors', () => {
      useDiscoveryStore.setState({
        context: makeDiscoveryContext({ analysis: { repetition: null, connectors: [], connectorRangesByVerse: new Map() } }),
      });
      render(<DiscoveryPanel />);
      expect(screen.queryByRole('button', LOOK_CLOSER)).toBeNull();
    });

    it('hides the connectors card below the connector threshold', () => {
      openLookCloser();
      useDiscoveryStore.setState({
        context: makeDiscoveryContext({ analysis: makeChapterAnalysis({ connectors: [], connectorRangesByVerse: new Map() }) }),
      });
      render(<DiscoveryPanel />);
      expect(screen.getByText('“Word” appears 11× in this chapter')).toBeTruthy();
      expect(screen.queryByTestId('connectors-card')).toBeNull();
    });
  });

  describe('Gnosis-backed sections', () => {
    const states: [string, <T>() => GnosisState<T>][] = [
      ['loading', () => ({ data: null, isLoading: true, error: null })],
      ['error', () => ({ data: null, isLoading: false, error: 'boom' })],
      ['missing capability', () => ({ data: null, isLoading: false, error: null })],
    ];

    it.each(states)('hides Who\'s here, map, era strip and events on %s while intro and genre lines still render', (_label, makeState) => {
      peopleState = makeState();
      placesState = makeState();
      eventsState = makeState();
      yearState = makeState();
      useDiscoveryStore.setState({ context: makeDiscoveryContext() });
      render(<DiscoveryPanel />);
      expect(screen.getByText('John — a gospel')).toBeTruthy();
      expect(screen.getByText(/^The Gospel of John is traditionally attributed/)).toBeTruthy();
      expect(screen.queryByText("Who's here")).toBeNull();
      expect(screen.queryByTestId('chapter-map')).toBeNull();
      expect(screen.queryByTestId('era-strip')).toBeNull();
    });
  });

  describe('telemetry', () => {
    it('fires repetition and connector shown events, deduped per chapter, while Look closer is open', () => {
      useDiscoveryStore.setState({ context: makeDiscoveryContext() });
      openLookCloser();
      render(<DiscoveryPanel />);
      expect(trackMock).toHaveBeenCalledWith('discovery_chip_shown', {
        feature: 'repetition',
        dedupeKey: 'discovery_chip_shown:repetition:John:1:sword-NASB',
      });
      expect(trackMock).toHaveBeenCalledWith('discovery_chip_shown', {
        feature: 'connector',
        dedupeKey: 'discovery_chip_shown:connector:John:1:sword-NASB',
      });
    });

    it('does not fire repetition or connector shown events while Look closer is collapsed', () => {
      useDiscoveryStore.setState({ context: makeDiscoveryContext() });
      render(<DiscoveryPanel />);
      const features = trackMock.mock.calls.filter(c => c[0] === 'discovery_chip_shown').map(c => (c[1] as { feature: string }).feature);
      expect(features).not.toContain('repetition');
      expect(features).not.toContain('connector');
    });

    it('fires the repetition shown event once the reader opens Look closer', () => {
      useDiscoveryStore.setState({ context: makeDiscoveryContext() });
      render(<DiscoveryPanel />);
      fireEvent.click(screen.getByRole('button', LOOK_CLOSER));
      expect(trackMock).toHaveBeenCalledWith('discovery_chip_shown', {
        feature: 'repetition',
        dedupeKey: 'discovery_chip_shown:repetition:John:1:sword-NASB',
      });
    });

    it('fires the entity shown event from Who\'s here, and not when there are no people', () => {
      peopleState = ready(PEOPLE);
      useDiscoveryStore.setState({ context: makeDiscoveryContext() });
      render(<DiscoveryPanel />);
      expect(trackMock).toHaveBeenCalledWith('discovery_chip_shown', {
        feature: 'entity',
        dedupeKey: 'discovery_chip_shown:entity:John:1:sword-NASB',
      });
      cleanup();
      trackMock.mockClear();
      peopleState = ready([]);
      render(<DiscoveryPanel />);
      expect(trackMock).not.toHaveBeenCalledWith('discovery_chip_shown', expect.objectContaining({ feature: 'entity' }));
    });

    it('fires discovery_chip_shown for the crossref feature only when cross-reference rows exist', () => {
      useDiscoveryStore.setState({ context: makeDiscoveryContext(), crossRefPassages: ONE_CROSS_REF_PASSAGE });
      render(<DiscoveryPanel />);
      expect(trackMock).toHaveBeenCalledWith('discovery_chip_shown', {
        feature: 'crossref',
        dedupeKey: 'discovery_chip_shown:crossref:John:1:sword-NASB',
      });
      cleanup();
      trackMock.mockClear();
      useDiscoveryStore.setState({ crossRefPassages: NO_CROSS_REF_PASSAGES });
      render(<DiscoveryPanel />);
      expect(trackMock).not.toHaveBeenCalledWith('discovery_chip_shown', expect.objectContaining({ feature: 'crossref' }));
    });

    it('renders the cross-reference card and fires crossref_later when only later rows exist', () => {
      useDiscoveryStore.setState({ context: makeDiscoveryContext(), laterCrossRefPassages: ONE_CROSS_REF_PASSAGE });
      render(<DiscoveryPanel />);
      expect(screen.getByTestId('cross-refs-card')).toBeTruthy();
      expect(trackMock).toHaveBeenCalledWith('discovery_chip_shown', {
        feature: 'crossref_later',
        dedupeKey: 'discovery_chip_shown:crossref_later:John:1:sword-NASB',
      });
      expect(trackMock).not.toHaveBeenCalledWith('discovery_chip_shown', expect.objectContaining({ feature: 'crossref' }));
    });

    it('does not fire discovery_chip_shown when the Discover kill switch is off', () => {
      discoveryEnabled = false;
      useDiscoveryStore.setState({ context: makeDiscoveryContext() });
      render(<DiscoveryPanel />);
      expect(trackMock).not.toHaveBeenCalled();
    });
  });
});
