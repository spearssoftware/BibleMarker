/**
 * @vitest-environment jsdom
 *
 * Study Tools is reachable in both modes. Discovery-first (default) mode only
 * advertises the everyday lookups — Chapter and Search — while Strong's,
 * Hebrew/Greek and Cross-Refs come with the inductive toolkit. An explicit
 * deep link (e.g. the verse menu's "Cross-References") un-hides its own tab.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
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

  it('falls back to a visible tab when the toolkit turns off after manually navigating there', () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true, isHydrated: true });

    render(<ReferenceToolsPanel onClose={() => {}} />);

    // Manually navigate to a toolkit-only tab (not via a deep-link initialTab).
    fireEvent.click(screen.getByRole('tab', { name: "Strong's" }));
    expect(screen.getByText('strongs-tab')).toBeTruthy();

    act(() => {
      usePreferencesStore.setState({ inductiveToolsEnabled: false });
    });

    expect(screen.queryByText('strongs-tab')).toBeNull();
    expect(screen.getByText('chapter-tab')).toBeTruthy();
  });

  it('deep link: un-hides the requested tab and shows its content even with tools off', () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: false, isHydrated: true });

    render(<ReferenceToolsPanel onClose={() => {}} initialTab="cross-refs" verse={5} />);

    expect(screen.getByRole('tab', { name: 'Cross-Refs' })).toBeTruthy();
    expect(screen.getByText('cross-refs-tab')).toBeTruthy();
  });

  it('deep link: wires aria-selected and the tabpanel id/aria-labelledby to the effective tab', () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: false, isHydrated: true });

    render(<ReferenceToolsPanel onClose={() => {}} initialTab="cross-refs" verse={5} />);

    const tab = screen.getByRole('tab', { name: 'Cross-Refs' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(tab.id).toBe('reference-tab-cross-refs');

    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe('reference-tabpanel-cross-refs');
    expect(panel.getAttribute('aria-labelledby')).toBe('reference-tab-cross-refs');
  });
});
