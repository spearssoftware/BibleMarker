/**
 * @vitest-environment jsdom
 *
 * CrossRefsCard mirrors ConnectorsCard: a lens toggle, one row per verse,
 * and both passages expanded under the active row with their shared words
 * lit by default. The rows arrive as props (loaded by `useDiscoveryHost`,
 * covered by its own tests), so this file exercises the card's rendering,
 * store wiring, the opt-in shared-word hunt, and the lens-tap path (active
 * key set from outside → row expands, network row fetches).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { CrossRefsCard } from '../CrossRefsCard';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { makeChapterCrossRef, makeCrossRefPassageRow } from '@/lib/__test__/factories';
import type { CrossRefPassageRow } from '@/hooks/useCrossRefPassages';

const navigateToVerse = vi.fn();
vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: (selector: (s: { navigateToVerse: typeof navigateToVerse }) => unknown) =>
    selector({ navigateToVerse }),
}));

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

const ROW_KEY = 'John.1:29:Isa.53.7';
const expandMock = vi.fn();

function renderCard(rows: CrossRefPassageRow[]) {
  return render(<CrossRefsCard rows={rows} expand={expandMock} book="John" chapter={1} />);
}

/** Row with a single shared word ("lamb") appearing once in each passage. */
function lambRow(overrides: Partial<CrossRefPassageRow> = {}): CrossRefPassageRow {
  return makeCrossRefPassageRow({
    shared: ['lamb'],
    sourceText: 'Behold the Lamb of God',
    targetVerses: [{ verse: 7, text: 'like a lamb led to slaughter' }],
    ...overrides,
  });
}

describe('CrossRefsCard', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ crossRefProgress: {}, activeCrossRefKey: null, lens: null });
    navigateToVerse.mockClear();
    trackMock.mockClear();
    expandMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing with no rows', () => {
    const { container } = renderCard([]);
    expect(container.innerHTML).toBe('');
  });

  it('agrees the title, shows the intro line and lens toggle for n=1', () => {
    renderCard([makeCrossRefPassageRow()]);
    expect(screen.getByText('1 verse to read alongside older Scripture')).toBeTruthy();
    expect(screen.getByText('Read them together — what do they share?')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Show connecting verses in the text' })).toBeTruthy();
  });

  it('agrees the title at n>1', () => {
    renderCard([
      makeCrossRefPassageRow(),
      makeCrossRefPassageRow({ crossRef: makeChapterCrossRef({ verse: 14, targetRef: 'Isa.40.5' }) }),
    ]);
    expect(screen.getByText('2 verses to read alongside older Scripture')).toBeTruthy();
  });

  it('toggles the cross-reference lens and fires lens_toggled', () => {
    renderCard([makeCrossRefPassageRow()]);
    fireEvent.click(screen.getByRole('switch', { name: 'Show connecting verses in the text' }));
    expect(useDiscoveryStore.getState().lens).toBe('crossRefs');
    expect(trackMock).toHaveBeenCalledWith('lens_toggled', { feature: 'crossref' });
  });

  it('shows a collapsed row as "source → target" with no passage text', () => {
    renderCard([makeCrossRefPassageRow()]);
    const header = screen.getByRole('button', { name: 'John 1:29 Isaiah 53:7' });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Behold, the Lamb/)).toBeNull();
    expect(screen.queryByText(/led like a lamb/)).toBeNull();
  });

  it('tapping a row jumps the reader there, expands both passages with the shared word lit, and fires the tap telemetry', () => {
    renderCard([lambRow()]);

    fireEvent.click(screen.getByRole('button', { name: 'John 1:29 Isaiah 53:7' }));

    expect(navigateToVerse).toHaveBeenCalledWith('John', 1, 29);
    expect(useDiscoveryStore.getState().activeCrossRefKey).toBe(ROW_KEY);
    expect(trackMock).toHaveBeenCalledWith('discovery_chip_tapped', { feature: 'crossref', dedupeKey: `crossref-tap:${ROW_KEY}` });
    expect(screen.getByText('John 1:29', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('Isaiah 53:7', { selector: 'p' })).toBeTruthy();

    // Shared words are lit by default as plain marks, not tap targets.
    const marks = Array.from(document.querySelectorAll('mark')).map(m => m.textContent);
    expect(marks).toEqual(['Lamb', 'lamb']);
    expect(screen.queryByRole('button', { name: 'God' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Go to Isaiah 53:7' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Find them yourself' })).toBeTruthy();
    expect(screen.queryByText(/These share/)).toBeNull();
  });

  it('keeps punctuation outside the highlight and out of "Both say…"', () => {
    useDiscoveryStore.setState({ activeCrossRefKey: ROW_KEY });
    renderCard([
      lambRow({
        shared: ['glory'],
        sourceText: 'we saw His glory, glory as of the only Son',
        targetVerses: [{ verse: 5, text: 'Then the glory of the Lord' }],
      }),
    ]);
    const marks = Array.from(document.querySelectorAll('mark')).map(m => m.textContent);
    expect(marks).toEqual(['glory', 'glory', 'glory']);
    expect(screen.getByText('John 1:29', { selector: 'p' }).nextSibling?.textContent).toBe('we saw His glory, glory as of the only Son');

    fireEvent.click(screen.getByRole('button', { name: 'Find them yourself' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'glory' })[0]);
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el?.textContent === 'Both say glory.')).toBeTruthy();
  });

  it('tapping the active row again collapses it', () => {
    useDiscoveryStore.setState({ activeCrossRefKey: ROW_KEY });
    renderCard([lambRow()]);
    expect(screen.getByRole('button', { name: 'John 1:29 Isaiah 53:7' }).getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'John 1:29 Isaiah 53:7' }));

    expect(useDiscoveryStore.getState().activeCrossRefKey).toBeNull();
    expect(screen.queryByText('John 1:29', { selector: 'p' })).toBeNull();
    expect(navigateToVerse).not.toHaveBeenCalled();
  });

  it('expands the row when the active key is set from outside (lens tap in the text)', () => {
    renderCard([lambRow()]);
    expect(screen.queryByText('John 1:29', { selector: 'p' })).toBeNull();

    act(() => {
      useDiscoveryStore.getState().setActiveCrossRefKey(ROW_KEY);
    });

    expect(screen.getByText('John 1:29', { selector: 'p' })).toBeTruthy();
    expect(navigateToVerse).not.toHaveBeenCalled();
  });

  it('fetches a network row only once it becomes active', () => {
    renderCard([lambRow({ status: 'idle', targetVerses: [], shared: [] })]);
    expect(expandMock).not.toHaveBeenCalled();

    act(() => {
      useDiscoveryStore.getState().setActiveCrossRefKey(ROW_KEY);
    });
    expect(expandMock).toHaveBeenCalledTimes(1);
    expect(expandMock).toHaveBeenCalledWith(ROW_KEY);
  });

  it('"Go to" navigates to the target passage', () => {
    useDiscoveryStore.setState({ activeCrossRefKey: ROW_KEY });
    renderCard([lambRow()]);
    fireEvent.click(screen.getByRole('button', { name: 'Go to Isaiah 53:7' }));
    expect(navigateToVerse).toHaveBeenCalledWith('Isa', 53, 7, true);
  });

  describe('shared-word hunt', () => {
    beforeEach(() => {
      useDiscoveryStore.setState({ activeCrossRefKey: ROW_KEY });
    });

    it('"Find them yourself" hides the highlights and turns non-stopwords into tap targets', () => {
      renderCard([lambRow()]);
      fireEvent.click(screen.getByRole('button', { name: 'Find them yourself' }));

      expect(useDiscoveryStore.getState().crossRefProgress[ROW_KEY].hunting).toBe(true);
      expect(document.querySelectorAll('mark')).toHaveLength(0);
      expect(screen.getByText('These share 1 word — tap it.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Lamb' })).toBeTruthy();
      expect(screen.queryAllByRole('button', { name: 'the' })).toHaveLength(0);
      expect(screen.getByRole('button', { name: 'Show me' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Find them yourself' })).toBeNull();
    });

    it('a wrong tap shows a miss message, cleared by the next correct tap', () => {
      useDiscoveryStore.setState({ crossRefProgress: { [ROW_KEY]: { hunting: true, found: [] } } });
      renderCard([lambRow()]);

      fireEvent.click(screen.getByRole('button', { name: 'God' }));
      expect(screen.getByText('Not that one — it has to appear in both.')).toBeTruthy();

      fireEvent.click(screen.getAllByRole('button', { name: /lamb/i })[0]);
      expect(screen.queryByText('Not that one — it has to appear in both.')).toBeNull();
    });

    it('finding every word shows "Both say…" using the source surface form and fires the confirm telemetry', () => {
      useDiscoveryStore.setState({ crossRefProgress: { [ROW_KEY]: { hunting: true, found: [] } } });
      renderCard([lambRow()]);
      trackMock.mockClear();

      fireEvent.click(screen.getAllByRole('button', { name: /lamb/i })[0]);

      expect(screen.getByText((_, el) => el?.tagName === 'P' && el?.textContent === 'Both say Lamb.')).toBeTruthy();
      expect(screen.getByText('Lamb', { selector: 'strong' })).toBeTruthy();
      expect(trackMock).toHaveBeenCalledWith('discovery_find_confirmed', {
        feature: 'crossref',
        dedupeKey: `crossref-found:${ROW_KEY}`,
      });
      // Done: the words are lit again as marks and the hunt controls are gone.
      expect(Array.from(document.querySelectorAll('mark')).map(m => m.textContent)).toEqual(['Lamb', 'lamb']);
      expect(screen.queryByRole('button', { name: 'Show me' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Find them yourself' })).toBeNull();
    });

    it('a partial hunt shows the found count', () => {
      useDiscoveryStore.setState({ crossRefProgress: { [ROW_KEY]: { hunting: true, found: ['lamb'] } } });
      renderCard([lambRow({ shared: ['lamb', 'slaughter'] })]);
      expect(screen.getByText('1 of 2 found')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'lamb' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('"Show me" ends the hunt, lights the words, and offers the hunt again without the confirm telemetry', () => {
      useDiscoveryStore.setState({ crossRefProgress: { [ROW_KEY]: { hunting: true, found: [] } } });
      renderCard([lambRow()]);
      trackMock.mockClear();

      fireEvent.click(screen.getByRole('button', { name: 'Show me' }));

      expect(useDiscoveryStore.getState().crossRefProgress[ROW_KEY].hunting).toBe(false);
      expect(Array.from(document.querySelectorAll('mark')).map(m => m.textContent)).toEqual(['Lamb', 'lamb']);
      expect(screen.getByRole('button', { name: 'Find them yourself' })).toBeTruthy();
      expect(screen.queryByText(/Both say/)).toBeNull();
      expect(trackMock).not.toHaveBeenCalledWith('discovery_find_confirmed', expect.anything());
    });
  });

  it('a ready row with no shared words shows plain text, the idea prompt, and no hunt button', () => {
    useDiscoveryStore.setState({ activeCrossRefKey: ROW_KEY });
    renderCard([lambRow({ shared: [] })]);

    expect(screen.getByText('What idea connects these?')).toBeTruthy();
    expect(document.querySelectorAll('mark')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Find them yourself' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Go to Isaiah 53:7' })).toBeTruthy();
  });

  it('retries a failed row when it is re-opened, but not on every re-render', () => {
    const errorRow = lambRow({ status: 'error', targetVerses: [], shared: [] });
    const { rerender } = renderCard([errorRow]);
    expect(expandMock).not.toHaveBeenCalled();

    act(() => useDiscoveryStore.setState({ activeCrossRefKey: ROW_KEY }));
    expect(expandMock).toHaveBeenCalledTimes(1);
    expect(expandMock).toHaveBeenCalledWith(ROW_KEY);

    rerender(<CrossRefsCard rows={[{ ...errorRow }]} expand={expandMock} book="John" chapter={1} />);
    expect(expandMock).toHaveBeenCalledTimes(1);

    act(() => useDiscoveryStore.setState({ activeCrossRefKey: null }));
    act(() => useDiscoveryStore.setState({ activeCrossRefKey: ROW_KEY }));
    expect(expandMock).toHaveBeenCalledTimes(2);
  });

  it('shows a loading state and an error state with a jump button', () => {
    useDiscoveryStore.setState({ activeCrossRefKey: ROW_KEY });
    const { rerender } = renderCard([lambRow({ status: 'loading', targetVerses: [], shared: [] })]);
    expect(screen.getByText('Loading…')).toBeTruthy();

    rerender(<CrossRefsCard rows={[lambRow({ status: 'error', targetVerses: [], shared: [] })]} expand={expandMock} book="John" chapter={1} />);
    expect(screen.getByText("Couldn't load that passage.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to Isaiah 53:7' })).toBeTruthy();
  });
});
