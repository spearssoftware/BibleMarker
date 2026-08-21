/**
 * @vitest-environment jsdom
 *
 * DiscoveryBar renders the three Discover-layer chips only when the kill
 * switch is on and there's analysis to show, and it names the primary
 * translation once a second column makes counts ambiguous.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DiscoveryBar } from '../DiscoveryBar';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { DEFAULT_DISCOVERY_THRESHOLDS, type ChapterAnalysis, type ConnectorHit } from '@/lib/chapterAnalysis';

vi.mock('@/lib/database', () => ({
  updatePreferences: vi.fn(async () => {}),
  getPreferences: vi.fn(async () => ({})),
  getAllMarkingPresets: vi.fn(async () => []),
  saveMarkingPreset: vi.fn(async () => {}),
  deleteMarkingPreset: vi.fn(async () => {}),
  searchMarkingPresets: vi.fn(async () => []),
  incrementMarkingPresetUsage: vi.fn(async () => {}),
  pruneTrackersForPreset: vi.fn(async () => {}),
  getAllStudies: vi.fn(async () => []),
  saveStudy: vi.fn(async () => {}),
  deleteStudy: vi.fn(async () => {}),
  getAllConclusions: vi.fn(async () => []),
  saveConclusion: vi.fn(async () => {}),
  deleteConclusion: vi.fn(async () => {}),
}));

vi.mock('@/hooks/useGnosis', () => ({
  useChapterEntities: () => ({
    entities: { book: 'John', chapter: 1, people: ['jesus'], places: [], events: [], topics: [] },
    isLoading: false,
    error: null,
  }),
}));

let discoveryEnabled = true;
vi.mock('@/lib/discovery-config', () => ({
  useDiscoveryEnabled: () => discoveryEnabled,
  useDiscoveryConfig: () => DEFAULT_DISCOVERY_THRESHOLDS,
  isDiscoveryEnabled: () => discoveryEnabled,
}));

function makeAnalysis(): ChapterAnalysis {
  const hit: ConnectorHit = { phrase: 'therefore', category: 'conclusion', verse: 1, start: 0, end: 9 };
  return {
    repetition: { token: 'word', count: 11, firstVerse: 1, lastVerse: 14, occurrences: [] },
    connectors: [hit],
    connectorRangesByVerse: new Map([[1, [hit]]]),
  };
}

describe('DiscoveryBar', () => {
  beforeEach(() => {
    discoveryEnabled = true;
    useActiveChapterStore.setState({ book: 'John', chapter: 1, translationId: 'sword-NASB', verses: [] });
    useDiscoveryStore.setState({ lensActive: false, found: null, activePrompt: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when the Discover kill-switch is off', () => {
    discoveryEnabled = false;
    const { container } = render(
      <DiscoveryBar analysis={makeAnalysis()} translationCount={1} primaryTranslationName="NASB" />
    );
    expect(container.querySelector('[data-discovery-bar]')).toBeNull();
  });

  it('renders nothing when there is no analysis yet', () => {
    const { container } = render(
      <DiscoveryBar analysis={null} translationCount={1} primaryTranslationName="NASB" />
    );
    expect(container.querySelector('[data-discovery-bar]')).toBeNull();
  });

  it('renders all three chips and suffixes the repetition chip with the translation name at translationCount 2', () => {
    const { container } = render(
      <DiscoveryBar analysis={makeAnalysis()} translationCount={2} primaryTranslationName="NASB" />
    );
    expect(container.querySelector('[data-discovery-bar]')).toBeTruthy();
    expect(screen.getByText('One word appears 11× in this chapter (NASB)')).toBeTruthy();
    expect(screen.getByText('1 hinge in this chapter')).toBeTruthy();
    expect(screen.getByText('1 people')).toBeTruthy();
  });

  it('omits the translation suffix with a single translation column', () => {
    render(<DiscoveryBar analysis={makeAnalysis()} translationCount={1} primaryTranslationName="NASB" />);
    expect(screen.getByText('One word appears 11× in this chapter')).toBeTruthy();
  });
});
