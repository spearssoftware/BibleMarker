/**
 * @vitest-environment jsdom
 *
 * CrossRefsCard shows two passages side by side and lets the reader tap the
 * words they share — `useCrossRefPassages` is mocked here (its own behavior,
 * including the network-cost rule, is covered by its own test file) so this
 * file only exercises the card's rendering and store wiring. The shared-word
 * answer must never leak into the DOM as a prompt/answer line before the
 * reader finds it or presses "Show me".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CrossRefsCard } from '../CrossRefsCard';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { makeChapterCrossRef } from '@/lib/__test__/factories';
import type { CrossRefPassageRow } from '@/hooks/useCrossRefPassages';
import type { ChapterCrossRef } from '@/types';

const navigateToVerse = vi.fn();
vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: (selector: (s: { navigateToVerse: typeof navigateToVerse }) => unknown) =>
    selector({ navigateToVerse }),
}));

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

const expandMock = vi.fn();
let mockRows: CrossRefPassageRow[] = [];
vi.mock('@/hooks/useCrossRefPassages', () => ({
  useCrossRefPassages: () => ({ rows: mockRows, expand: expandMock }),
}));

function makeRow(overrides: Partial<CrossRefPassageRow> = {}): CrossRefPassageRow {
  const crossRef: ChapterCrossRef = makeChapterCrossRef({ verse: 29, targetRef: 'Isa.53.7', votes: 100 });
  return {
    key: 'John.1:29:Isa.53.7',
    crossRef,
    section: 'the prophets',
    label: 'Isaiah 53:7',
    jumpTarget: { book: 'Isa', chapter: 53, verse: 7 },
    sourceRefLabel: 'John 1:29',
    sourceText: 'Behold, the Lamb of God who takes away the sin of the world',
    status: 'ready',
    targetVerses: [{ verse: 7, text: 'He was led like a lamb to the slaughter' }],
    shared: ['lamb'],
    ...overrides,
  };
}

function renderCard(overrides: { book?: string; chapter?: number; translationId?: string; crossRefs?: ChapterCrossRef[] } = {}) {
  return render(
    <CrossRefsCard
      crossRefs={overrides.crossRefs ?? [makeChapterCrossRef({ verse: 29, targetRef: 'Isa.53.7' })]}
      book={overrides.book ?? 'John'}
      chapter={overrides.chapter ?? 1}
      translationId={overrides.translationId ?? 'sword-NASB'}
    />
  );
}

describe('CrossRefsCard', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ crossRefProgress: {} });
    mockRows = [];
    navigateToVerse.mockClear();
    trackMock.mockClear();
    expandMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when the hook yields no rows', () => {
    mockRows = [];
    const { container } = renderCard();
    expect(container.innerHTML).toBe('');
  });

  it('agrees the title and shows the intro line for n=1', () => {
    mockRows = [makeRow()];
    renderCard();
    expect(screen.getByText('1 verse here connects to older Scripture')).toBeTruthy();
    expect(screen.getByText('Read them together — what do they share?')).toBeTruthy();
  });

  it('agrees the title at n>1', () => {
    mockRows = [makeRow({ key: 'a' }), makeRow({ key: 'b', crossRef: makeChapterCrossRef({ verse: 14 }) })];
    renderCard();
    expect(screen.getByText('2 verses here connect to older Scripture')).toBeTruthy();
  });

  it('shows a collapsed row with the section teaser and no passage text', () => {
    mockRows = [makeRow()];
    renderCard();
    expect(screen.getByText('v.29 — something in the prophets')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Read v.29 together with its older passage' })).toBeTruthy();
    expect(screen.queryByText(/Behold, the Lamb/)).toBeNull();
    expect(screen.queryByText(/led like a lamb/)).toBeNull();
    // The answer must never leak before the row is opened.
    expect(document.body.innerHTML).not.toContain('lamb');
  });

  it('falls back to "an older passage" when the row has no section', () => {
    mockRows = [makeRow({ section: undefined })];
    renderCard();
    expect(screen.getByText('v.29 — an older passage')).toBeTruthy();
  });

  it('opens the row, fires the tap telemetry once, and shows both passages', () => {
    mockRows = [makeRow()];
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Read v.29 together with its older passage' }));

    expect(expandMock).toHaveBeenCalledWith('John.1:29:Isa.53.7');
    expect(trackMock).toHaveBeenCalledWith('discovery_chip_tapped', { feature: 'crossref' });
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('John 1:29')).toBeTruthy();
    expect(screen.getByText('Isaiah 53:7')).toBeTruthy();
    expect(screen.getByText(/These share 1 word — tap it\./)).toBeTruthy();

    // Re-clicking (row already open) must not fire the telemetry again.
    useDiscoveryStore.getState().openCrossRef('John.1:29:Isa.53.7');
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it('never renders stopwords as buttons', () => {
    mockRows = [makeRow({ shared: ['lamb'], sourceText: 'the Lamb of God' })];
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Read v.29 together with its older passage' }));

    const theButtons = screen.queryAllByRole('button', { name: 'the' });
    expect(theButtons).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Lamb' })).toBeTruthy();
  });

  it('tapping the shared word highlights it in both passages and updates the found count', () => {
    mockRows = [
      makeRow({
        shared: ['lamb'],
        sourceText: 'Behold the Lamb of God',
        targetVerses: [{ verse: 7, text: 'like a lamb led to slaughter' }],
      }),
    ];
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Read v.29 together with its older passage' }));

    const lambButtons = screen.getAllByRole('button', { name: 'Lamb' }).concat(screen.getAllByRole('button', { name: 'lamb' }));
    expect(lambButtons).toHaveLength(2);
    fireEvent.click(lambButtons[0]);

    const foundButtons = screen.getAllByRole('button', { name: /lamb/i });
    expect(foundButtons.every(b => b.getAttribute('aria-pressed') === 'true')).toBe(true);
  });

  it('shows a miss message on a wrong tap and clears it on the next correct tap', () => {
    mockRows = [
      makeRow({
        shared: ['lamb'],
        sourceText: 'Behold the Lamb of God',
        targetVerses: [{ verse: 7, text: 'like a lamb led to slaughter' }],
      }),
    ];
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Read v.29 together with its older passage' }));

    fireEvent.click(screen.getByRole('button', { name: 'God' }));
    expect(screen.getByText('Not that one — it has to appear in both.')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /lamb/i })[0]);
    expect(screen.queryByText('Not that one — it has to appear in both.')).toBeNull();
  });

  it('completing by tapping shows "Both say…" using source surface form, a jump button, and fires the confirm telemetry once', () => {
    useDiscoveryStore.setState({ crossRefProgress: { 'John.1:29:Isa.53.7': { opened: true, found: [], shownAll: false } } });
    mockRows = [
      makeRow({
        shared: ['lamb'],
        sourceText: 'Behold the Lamb of God',
        targetVerses: [{ verse: 7, text: 'like a lamb led to slaughter' }],
      }),
    ];
    renderCard();
    trackMock.mockClear();

    fireEvent.click(screen.getAllByRole('button', { name: /lamb/i })[0]);

    expect(screen.getByText((_, el) => el?.tagName === 'P' && el?.textContent === 'Both say Lamb.')).toBeTruthy();
    expect(screen.getByText('Lamb', { selector: 'strong' })).toBeTruthy(); // surface form from the SOURCE text, capitalized
    const jump = screen.getByRole('button', { name: 'Go to Isaiah 53:7' });
    expect(jump).toBeTruthy();
    expect(trackMock).toHaveBeenCalledWith('discovery_find_confirmed', { feature: 'crossref' });
    expect(trackMock).toHaveBeenCalledTimes(1);

    fireEvent.click(jump);
    expect(navigateToVerse).toHaveBeenCalledWith('Isa', 53, 7, true);
  });

  it('"Show me" completes the row without firing the confirm telemetry', () => {
    useDiscoveryStore.setState({ crossRefProgress: { 'John.1:29:Isa.53.7': { opened: true, found: [], shownAll: false } } });
    mockRows = [makeRow({ shared: ['lamb', 'slaughter'] })];
    renderCard();
    trackMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));

    expect(screen.getByText((_, el) => el?.tagName === 'P' && (el?.textContent?.startsWith('Both say') ?? false))).toBeTruthy();
    expect(trackMock).not.toHaveBeenCalledWith('discovery_find_confirmed', expect.anything());
  });

  it('zero-shared ready row renders plain text, the idea prompt, and shows the jump button immediately', () => {
    useDiscoveryStore.setState({ crossRefProgress: { 'John.1:29:Isa.53.7': { opened: true, found: [], shownAll: false } } });
    mockRows = [makeRow({ shared: [] })];
    renderCard();

    expect(screen.getByText('What idea connects these?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to Isaiah 53:7' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /lamb/i })).toBeNull();
  });

  it('shows a loading state and an error state with a jump button', () => {
    useDiscoveryStore.setState({ crossRefProgress: { 'John.1:29:Isa.53.7': { opened: true, found: [], shownAll: false } } });
    mockRows = [makeRow({ status: 'loading', targetVerses: [], shared: [] })];
    const { rerender } = renderCard();
    expect(screen.getByText('Loading…')).toBeTruthy();

    mockRows = [makeRow({ status: 'error', targetVerses: [], shared: [] })];
    rerender(<CrossRefsCard crossRefs={[makeChapterCrossRef({ verse: 29, targetRef: 'Isa.53.7' })]} book="John" chapter={1} translationId="sword-NASB" />);
    expect(screen.getByText("Couldn't load that passage.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to Isaiah 53:7' })).toBeTruthy();
  });

  it('fires discovery_chip_tapped only once per row even across two rows', () => {
    mockRows = [
      makeRow({ key: 'row-a', crossRef: makeChapterCrossRef({ verse: 1, targetRef: 'Gen.1.1' }) }),
      makeRow({ key: 'row-b', crossRef: makeChapterCrossRef({ verse: 5, targetRef: 'Ps.2.7' }) }),
    ];
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /Read v\.1 together/ }));
    fireEvent.click(screen.getByRole('button', { name: /Read v\.5 together/ }));
    expect(trackMock).toHaveBeenCalledTimes(2);
  });

  it('reloads a row that was opened before the panel closed (store says opened, hook says idle)', () => {
    useDiscoveryStore.setState({
      crossRefProgress: { 'John.1:29:Isa.53.7': { opened: true, found: [], shownAll: false } },
    });
    mockRows = [makeRow({ status: 'idle', targetVerses: [], shared: [] })];
    renderCard();
    expect(expandMock).toHaveBeenCalledTimes(1);
    expect(expandMock).toHaveBeenCalledWith('John.1:29:Isa.53.7');
  });

  it('never calls expand for a row the reader has not opened', () => {
    mockRows = [makeRow({ status: 'idle', targetVerses: [], shared: [] })];
    renderCard();
    expect(expandMock).not.toHaveBeenCalled();
  });

  it('"Show me" highlights the shared word in both passages and ignores later taps', () => {
    mockRows = [makeRow()];
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Read v\.29 together/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));

    const pressed = screen.getAllByRole('button', { pressed: true });
    expect(pressed.map(b => b.textContent)).toEqual(['Lamb', 'lamb']);

    fireEvent.click(screen.getByRole('button', { name: 'slaughter' }));
    expect(screen.queryByText(/Not that one/)).toBeNull();
  });
});
