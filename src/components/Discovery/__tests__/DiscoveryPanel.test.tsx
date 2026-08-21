/**
 * @vitest-environment jsdom
 *
 * DiscoveryPanel composes the "reading…" / "nothing to see" / card states.
 * The three cards themselves are shallow-mocked so this file only exercises
 * DiscoveryPanel's own branching — their content is covered by
 * RepetitionCard.test.tsx / HingesCard.test.tsx.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DiscoveryPanel } from '../DiscoveryPanel';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { DEFAULT_DISCOVERY_THRESHOLDS, type ChapterAnalysis, type ConnectorHit } from '@/lib/chapterAnalysis';

vi.mock('@/lib/database', () => ({
  updatePreferences: vi.fn(async () => {}),
  getPreferences: vi.fn(async () => ({})),
}));

let mockEntities: { book: string; chapter: number; people: string[]; places: string[]; events: string[]; topics: string[] } | null = null;
vi.mock('@/hooks/useGnosis', () => ({
  useChapterEntities: () => ({ entities: mockEntities, isLoading: false, error: null }),
}));

vi.mock('@/lib/discovery-config', () => ({
  useDiscoveryConfig: () => DEFAULT_DISCOVERY_THRESHOLDS,
}));

vi.mock('../RepetitionCard', () => ({
  RepetitionCard: (props: { translationCount: number; primaryTranslationAbbrev: string | null }) => (
    <div data-testid="repetition-card">
      repetition:{props.translationCount}:{props.primaryTranslationAbbrev ?? ''}
    </div>
  ),
}));
vi.mock('../HingesCard', () => ({
  HingesCard: () => <div data-testid="hinges-card">hinges</div>,
}));
vi.mock('../PeoplePlacesCard', () => ({
  PeoplePlacesCard: () => <div data-testid="people-places-card">people-places</div>,
}));

function makeAnalysis(overrides: Partial<ChapterAnalysis> = {}): ChapterAnalysis {
  const hit: ConnectorHit = { phrase: 'therefore', category: 'conclusion', verse: 1, start: 0, end: 9 };
  return {
    repetition: { token: 'word', count: 11, firstVerse: 1, lastVerse: 14, occurrences: [], forms: ['word', 'words'] },
    connectors: [hit],
    connectorRangesByVerse: new Map([[1, [hit]]]),
    ...overrides,
  };
}

describe('DiscoveryPanel', () => {
  beforeEach(() => {
    mockEntities = null;
    useActiveChapterStore.setState({ book: 'John', chapter: 1, translationId: 'sword-NASB', verses: [] });
    useDiscoveryStore.setState({
      analysis: null,
      translationCount: 1,
      primaryTranslationAbbrev: null,
      lensActive: false,
      activePrompt: null,
      found: null,
      markedPresetId: null,
      revealedHints: 0,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows "Reading the chapter…" when analysis has not arrived yet', () => {
    render(<DiscoveryPanel />);
    expect(screen.getByText('Reading the chapter…')).toBeTruthy();
  });

  it('shows "Nothing stands out" when analysis has nothing to report and there are no entities', () => {
    useDiscoveryStore.setState({
      analysis: { repetition: null, connectors: [], connectorRangesByVerse: new Map() },
    });
    render(<DiscoveryPanel />);
    expect(screen.getByText('Nothing stands out here — just read.')).toBeTruthy();
    expect(screen.queryByTestId('repetition-card')).toBeNull();
    expect(screen.queryByTestId('hinges-card')).toBeNull();
  });

  it('renders all three cards when everything qualifies', () => {
    mockEntities = { book: 'John', chapter: 1, people: ['jesus'], places: [], events: [], topics: [] };
    useDiscoveryStore.setState({ analysis: makeAnalysis(), translationCount: 2, primaryTranslationAbbrev: 'NASB' });
    render(<DiscoveryPanel />);
    expect(screen.getByTestId('repetition-card')).toBeTruthy();
    expect(screen.getByTestId('hinges-card')).toBeTruthy();
    expect(screen.getByTestId('people-places-card')).toBeTruthy();
    expect(screen.getByText('repetition:2:NASB')).toBeTruthy();
  });

  it('hides the hinges card below the connector threshold', () => {
    useDiscoveryStore.setState({
      analysis: makeAnalysis({ connectors: [], connectorRangesByVerse: new Map() }),
    });
    render(<DiscoveryPanel />);
    expect(screen.getByTestId('repetition-card')).toBeTruthy();
    expect(screen.queryByTestId('hinges-card')).toBeNull();
  });
});
