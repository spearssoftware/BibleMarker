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
import { useToastStore } from '@/stores/toastStore';
import { groupConnectorsByVerse, type ConnectorHit } from '@/lib/chapterAnalysis';

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
const connectorRangesByVerse = groupConnectorsByVerse(hits);

describe('HingesCard', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ lensActive: false, activePrompt: null });
    usePreferencesStore.setState({ inductiveToolsEnabled: false, isHydrated: true });
    useToastStore.setState({ toasts: [] });
    navigateToVerse.mockClear();
    addConnectorToFlowMock.mockReset();
    addConnectorToFlowMock.mockImplementation(async () => {});
  });

  afterEach(() => {
    cleanup();
  });

  it('lists rows grouped by verse in ascending order', () => {
    render(<HingesCard connectorRangesByVerse={connectorRangesByVerse} hingeCount={hits.length} book="Rom" chapter={5} />);
    expect(screen.getByText('2 hinges in this chapter')).toBeTruthy();
    const rows = screen.getAllByRole('button', { name: /v\.\d/ });
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('v.3');
    expect(rows[1].textContent).toContain('v.8');
  });

  it('tapping a row navigates to the verse and expands the prompt', () => {
    render(<HingesCard connectorRangesByVerse={connectorRangesByVerse} hingeCount={hits.length} book="Rom" chapter={5} />);
    fireEvent.click(screen.getByText(/But/));
    expect(navigateToVerse).toHaveBeenCalledWith('Rom', 5, 3);
    expect(useDiscoveryStore.getState().activePrompt).toMatchObject({ verse: 3, phrase: 'But' });
  });

  it('shows "Add to Flow" only when the inductive toolkit is on', () => {
    render(<HingesCard connectorRangesByVerse={connectorRangesByVerse} hingeCount={hits.length} book="Rom" chapter={5} />);
    fireEvent.click(screen.getByText(/But/));
    expect(screen.queryByText('Add to Flow')).toBeNull();
  });

  it('shows and calls "Add to Flow" when the inductive toolkit is on', async () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true, isHydrated: true });
    render(<HingesCard connectorRangesByVerse={connectorRangesByVerse} hingeCount={hits.length} book="Rom" chapter={5} />);
    fireEvent.click(screen.getByText(/But/));
    const addButton = screen.getByText('Add to Flow');
    fireEvent.click(addButton);
    await vi.waitFor(() => expect(addConnectorToFlowMock).toHaveBeenCalledWith(hits[1], 'Rom', 5));
  });

  it('only disables the row whose "Add to Flow" request is in flight, not a row switched to afterward', async () => {
    let resolveAdd: () => void = () => {};
    addConnectorToFlowMock.mockImplementation(() => new Promise<void>(resolve => { resolveAdd = resolve; }));
    usePreferencesStore.setState({ inductiveToolsEnabled: true, isHydrated: true });
    render(<HingesCard connectorRangesByVerse={connectorRangesByVerse} hingeCount={hits.length} book="Rom" chapter={5} />);

    fireEvent.click(screen.getByText(/But/));
    fireEvent.click(screen.getByText('Add to Flow'));
    expect((screen.getByText('Add to Flow') as HTMLButtonElement).disabled).toBe(true);

    // Switch to the other row while the first request is still in flight.
    fireEvent.click(screen.getByText(/Therefore/));
    expect((screen.getByText('Add to Flow') as HTMLButtonElement).disabled).toBe(false);

    resolveAdd();
    await vi.waitFor(() => expect(addConnectorToFlowMock).toHaveBeenCalledWith(hits[1], 'Rom', 5));
  });

  it('shows a toast and logs when "Add to Flow" fails', async () => {
    addConnectorToFlowMock.mockRejectedValueOnce(new Error('db write failed'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    usePreferencesStore.setState({ inductiveToolsEnabled: true, isHydrated: true });
    render(<HingesCard connectorRangesByVerse={connectorRangesByVerse} hingeCount={hits.length} book="Rom" chapter={5} />);

    fireEvent.click(screen.getByText(/But/));
    fireEvent.click(screen.getByText('Add to Flow'));

    await vi.waitFor(() =>
      expect((screen.getByText('Add to Flow') as HTMLButtonElement).disabled).toBe(false)
    );
    expect(useToastStore.getState().toasts).toContainEqual(
      expect.objectContaining({ message: "Couldn't add to Flow.", variant: 'error' })
    );
    consoleErrorSpy.mockRestore();
  });

  it('toggles lensActive via the toggle switch', () => {
    render(<HingesCard connectorRangesByVerse={connectorRangesByVerse} hingeCount={hits.length} book="Rom" chapter={5} />);
    const toggle = screen.getByRole('switch', { name: 'Show hinges in the text' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(useDiscoveryStore.getState().lensActive).toBe(true);
  });
});
