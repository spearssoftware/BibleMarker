/**
 * @vitest-environment jsdom
 *
 * DiscoveryPanel composes the "reading…" / "nothing to see" / card states,
 * plus the `discovery_chip_shown` telemetry that now lives here (moved out
 * of the always-mounted `useDiscoveryHost` so it only fires when a card is
 * actually rendered). HingesCard and PeoplePlacesCard are shallow-mocked so
 * this file mostly exercises DiscoveryPanel's own branching — their content
 * is covered by HingesCard.test.tsx / PeoplePlacesCard's own coverage.
 * RepetitionCard is deliberately left un-mocked so at least the translation
 * suffix is verified end-to-end through the real component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DiscoveryPanel } from '../DiscoveryPanel';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { DEFAULT_DISCOVERY_THRESHOLDS } from '@/lib/chapterAnalysis';
import { makeChapterAnalysis, makeDiscoveryContext } from '@/lib/__test__/factories';

vi.mock('@/lib/database', () => ({
  updatePreferences: vi.fn(async () => {}),
  getPreferences: vi.fn(async () => ({})),
}));

vi.mock('@/stores/studyStore', () => ({
  useStudyStore: (selector: (s: { activeStudyId: string | null }) => unknown) =>
    selector({ activeStudyId: null }),
}));

type MockEntities = { book: string; chapter: number; people: string[]; places: string[]; events: string[]; topics: string[] } | null;
let mockEntities: MockEntities = null;
let mockEntitiesLoading = false;
let mockEntitiesError: string | null = null;
vi.mock('@/hooks/useGnosis', () => ({
  useChapterEntities: () => ({ entities: mockEntities, isLoading: mockEntitiesLoading, error: mockEntitiesError }),
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

vi.mock('../HingesCard', () => ({
  HingesCard: () => <div data-testid="hinges-card">hinges</div>,
}));
vi.mock('../PeoplePlacesCard', () => ({
  PeoplePlacesCard: () => <div data-testid="people-places-card">people-places</div>,
}));

describe('DiscoveryPanel', () => {
  beforeEach(() => {
    mockEntities = null;
    mockEntitiesLoading = false;
    mockEntitiesError = null;
    discoveryEnabled = true;
    trackMock.mockClear();
    useDiscoveryStore.setState({
      context: null,
      lensActive: false,
      activePrompt: null,
      found: null,
      markedPresetId: null,
      revealedRungs: [],
    });
  });

  afterEach(() => {
    cleanup();
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

  it('keeps showing "Reading the chapter…" while entities are still unresolved, even with nothing else to report', () => {
    useDiscoveryStore.setState({
      context: makeDiscoveryContext({ analysis: { repetition: null, connectors: [], connectorRangesByVerse: new Map() } }),
    });
    // entities: null + no error + not loading is the ambiguous "hasn't resolved yet" case.
    render(<DiscoveryPanel />);
    expect(screen.getByText('Reading the chapter…')).toBeTruthy();
    expect(screen.queryByText('Nothing stands out here — just read.')).toBeNull();
  });

  it('shows "Nothing stands out" once analysis and entities have both resolved to nothing', () => {
    mockEntities = { book: 'John', chapter: 1, people: [], places: [], events: [], topics: [] };
    useDiscoveryStore.setState({
      context: makeDiscoveryContext({ analysis: { repetition: null, connectors: [], connectorRangesByVerse: new Map() } }),
    });
    render(<DiscoveryPanel />);
    expect(screen.getByText('Nothing stands out here — just read.')).toBeTruthy();
    expect(screen.queryByTestId('hinges-card')).toBeNull();
  });

  it('renders the repetition and hinges cards, with the real RepetitionCard suffix, when everything qualifies', () => {
    mockEntities = { book: 'John', chapter: 1, people: ['jesus'], places: [], events: [], topics: [] };
    useDiscoveryStore.setState({ context: makeDiscoveryContext({ translationCount: 2, primaryTranslationAbbrev: 'NASB' }) });
    render(<DiscoveryPanel />);
    expect(screen.getByText('One word appears 11× in this chapter (NASB)')).toBeTruthy();
    expect(screen.getByTestId('hinges-card')).toBeTruthy();
    expect(screen.getByTestId('people-places-card')).toBeTruthy();
  });

  it('hides the hinges card below the connector threshold', () => {
    useDiscoveryStore.setState({
      context: makeDiscoveryContext({ analysis: makeChapterAnalysis({ connectors: [], connectorRangesByVerse: new Map() }) }),
    });
    render(<DiscoveryPanel />);
    expect(screen.getByText('One word appears 11× in this chapter')).toBeTruthy();
    expect(screen.queryByTestId('hinges-card')).toBeNull();
  });

  it('fires discovery_chip_shown, deduped per chapter, when the repetition and hinges cards render', () => {
    useDiscoveryStore.setState({ context: makeDiscoveryContext() });
    render(<DiscoveryPanel />);
    expect(trackMock).toHaveBeenCalledWith('discovery_chip_shown', {
      feature: 'repetition',
      dedupeKey: 'repetition:John:1:sword-NASB',
    });
    expect(trackMock).toHaveBeenCalledWith('discovery_chip_shown', {
      feature: 'connector',
      dedupeKey: 'connector:John:1:sword-NASB',
    });
  });

  it('fires discovery_chip_shown for the entity feature when the People & Places card renders with counts', () => {
    mockEntities = { book: 'John', chapter: 1, people: ['jesus'], places: [], events: [], topics: [] };
    useDiscoveryStore.setState({ context: makeDiscoveryContext() });
    render(<DiscoveryPanel />);
    expect(trackMock).toHaveBeenCalledWith('discovery_chip_shown', {
      feature: 'entity',
      dedupeKey: 'entity:John:1:sword-NASB',
    });
  });

  it('does not fire discovery_chip_shown for the entity feature when there are no people or places', () => {
    mockEntities = { book: 'John', chapter: 1, people: [], places: [], events: [], topics: [] };
    useDiscoveryStore.setState({ context: makeDiscoveryContext() });
    render(<DiscoveryPanel />);
    expect(trackMock).not.toHaveBeenCalledWith('discovery_chip_shown', expect.objectContaining({ feature: 'entity' }));
  });

  it('does not fire discovery_chip_shown when the Discover kill switch is off', () => {
    discoveryEnabled = false;
    useDiscoveryStore.setState({ context: makeDiscoveryContext() });
    render(<DiscoveryPanel />);
    expect(trackMock).not.toHaveBeenCalled();
  });
});
