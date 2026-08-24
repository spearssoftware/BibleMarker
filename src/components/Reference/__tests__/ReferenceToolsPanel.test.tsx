/**
 * @vitest-environment jsdom
 *
 * Study Tools is reachable in both modes, but discovery-first (default) mode
 * only exposes the pull-based lookups — Chapter and Search. Strong's,
 * Hebrew/Greek and Cross-Refs need the inductive toolkit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReferenceToolsPanel } from '../ReferenceToolsPanel';
import { usePreferencesStore } from '@/stores/preferencesStore';

vi.mock('@/lib/database');
vi.mock('../ChapterEntitiesTab', () => ({ ChapterEntitiesTab: () => <div>chapter-tab</div> }));
vi.mock('../SearchTab', () => ({ SearchTab: () => <div>search-tab</div> }));
vi.mock('../CrossRefsTab', () => ({ CrossRefsTab: () => <div>cross-refs-tab</div> }));
vi.mock('../OriginalLanguageTab', () => ({ OriginalLanguageTab: () => <div>original-lang-tab</div> }));
vi.mock('../StrongsTab', () => ({ StrongsTab: () => <div>strongs-tab</div> }));
vi.mock('../PersonDetail', () => ({ PersonDetail: () => null }));
vi.mock('../PlaceDetail', () => ({ PlaceDetail: () => null }));
vi.mock('../EventDetail', () => ({ EventDetail: () => null }));
vi.mock('../TopicDetail', () => ({ TopicDetail: () => null }));

const TOOLKIT_TABS = ["Strong's", 'Hebrew/Greek', 'Cross-Refs'];

describe('ReferenceToolsPanel tab gating', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows only Chapter and Search when inductive tools are off', () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: false, isHydrated: true });

    render(<ReferenceToolsPanel onClose={() => {}} />);

    expect(screen.getByRole('tab', { name: 'Chapter' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Search' })).toBeTruthy();
    for (const label of TOOLKIT_TABS) {
      expect(screen.queryByRole('tab', { name: label })).toBeNull();
    }
  });

  it('shows every tab when inductive tools are on', () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true, isHydrated: true });

    render(<ReferenceToolsPanel onClose={() => {}} />);

    for (const label of ['Chapter', 'Search', ...TOOLKIT_TABS]) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    }
  });

  it('falls back to a visible tab when a hidden one is requested', () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: false, isHydrated: true });

    render(<ReferenceToolsPanel onClose={() => {}} initialTab="strongs" />);

    expect(screen.queryByText('strongs-tab')).toBeNull();
    expect(screen.getByText('chapter-tab')).toBeTruthy();
  });
});
