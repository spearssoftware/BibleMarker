/**
 * @vitest-environment jsdom
 *
 * HingesCard replaces the old ConnectorChip + ConnectorPrompt: a list of
 * every hinge grouped by verse, a lens toggle, and per-row "Add to Flow"
 * gated behind the inductive toolkit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HingesCard } from '../HingesCard';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import type { ConnectorHit } from '@/lib/chapterAnalysis';

vi.mock('@/lib/database', () => ({
  updatePreferences: vi.fn(async () => {}),
  getPreferences: vi.fn(async () => ({})),
}));

const navigateToVerse = vi.fn();
vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: (selector: (s: { navigateToVerse: typeof navigateToVerse }) => unknown) =>
    selector({ navigateToVerse }),
}));

const { addConnectorToFlowMock } = vi.hoisted(() => ({ addConnectorToFlowMock: vi.fn(async () => {}) }));
vi.mock('@/lib/discoveryActions', () => ({
  addConnectorToFlow: addConnectorToFlowMock,
}));

const hits: ConnectorHit[] = [
  { phrase: 'Therefore', category: 'conclusion', verse: 8, start: 0, end: 9 },
  { phrase: 'But', category: 'contrast', verse: 3, start: 0, end: 3 },
];

describe('HingesCard', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ lensActive: false, activePrompt: null });
    usePreferencesStore.setState({ inductiveToolsEnabled: false, isHydrated: true });
    navigateToVerse.mockClear();
    addConnectorToFlowMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing below the minCount threshold', () => {
    const { container } = render(<HingesCard connectors={hits} minCount={3} book="Rom" chapter={5} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists rows grouped by verse in ascending order', () => {
    render(<HingesCard connectors={hits} minCount={1} book="Rom" chapter={5} />);
    expect(screen.getByText('2 hinges in this chapter')).toBeTruthy();
    const rows = screen.getAllByRole('button', { name: /v\.\d/ });
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('v.3');
    expect(rows[1].textContent).toContain('v.8');
  });

  it('tapping a row navigates to the verse and expands the prompt', () => {
    render(<HingesCard connectors={hits} minCount={1} book="Rom" chapter={5} />);
    fireEvent.click(screen.getByText(/But/));
    expect(navigateToVerse).toHaveBeenCalledWith('Rom', 5, 3);
    expect(useDiscoveryStore.getState().activePrompt).toMatchObject({ verse: 3, phrase: 'But' });
  });

  it('shows "Add to Flow" only when the inductive toolkit is on', () => {
    render(<HingesCard connectors={hits} minCount={1} book="Rom" chapter={5} />);
    fireEvent.click(screen.getByText(/But/));
    expect(screen.queryByText('Add to Flow')).toBeNull();
  });

  it('shows and calls "Add to Flow" when the inductive toolkit is on', async () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true, isHydrated: true });
    render(<HingesCard connectors={hits} minCount={1} book="Rom" chapter={5} />);
    fireEvent.click(screen.getByText(/But/));
    const addButton = screen.getByText('Add to Flow');
    fireEvent.click(addButton);
    await vi.waitFor(() => expect(addConnectorToFlowMock).toHaveBeenCalledWith(hits[1], 'Rom', 5));
  });

  it('toggles lensActive via the toggle switch', () => {
    render(<HingesCard connectors={hits} minCount={1} book="Rom" chapter={5} />);
    const toggle = screen.getByRole('switch', { name: 'Show hinges in the text' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(useDiscoveryStore.getState().lensActive).toBe(true);
  });
});
