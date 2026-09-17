/**
 * @vitest-environment jsdom
 *
 * The cross-reference card must never leak the target reference into the DOM before the
 * reader has earned the second rung — the category hint ("It's in the
 * law.") comes first and stays visible once the reference is revealed,
 * mirroring `RepetitionCard`'s accumulating ladder.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CrossRefsCard } from '../CrossRefsCard';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { makeChapterCrossRef } from '@/lib/__test__/factories';
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

function renderCard(crossRefs: ChapterCrossRef[], overrides: { book?: string; chapter?: number } = {}) {
  return render(<CrossRefsCard crossRefs={crossRefs} book={overrides.book ?? 'John'} chapter={overrides.chapter ?? 1} />);
}

describe('CrossRefsCard', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ revealedCrossRefs: {} });
    navigateToVerse.mockClear();
    trackMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when there are no cross-references', () => {
    const { container } = renderCard([]);
    expect(container.innerHTML).toBe('');
  });

  it('agrees the title at n=1', () => {
    renderCard([makeChapterCrossRef({ verse: 1 })]);
    expect(screen.getByText('1 verse here connects to older Scripture')).toBeTruthy();
  });

  it('agrees the title at n>1', () => {
    renderCard([
      makeChapterCrossRef({ verse: 1, votes: 300 }),
      makeChapterCrossRef({ verse: 14, targetRef: 'Isa.40.5', votes: 200 }),
    ]);
    expect(screen.getByText('2 verses here connect to older Scripture')).toBeTruthy();
  });

  it('shows at most the 3 highest-voted cross-references, verse-ordered', () => {
    const crossRefs = [
      makeChapterCrossRef({ verse: 29, targetRef: 'Isa.53.7', votes: 50 }),
      makeChapterCrossRef({ verse: 1, targetRef: 'Gen.1.1', votes: 276 }),
      makeChapterCrossRef({ verse: 14, targetRef: 'Isa.40.5', votes: 150 }),
      makeChapterCrossRef({ verse: 5, targetRef: 'Ps.2.7', votes: 10 }), // lowest-voted, should be dropped
    ];
    renderCard(crossRefs);
    expect(screen.getByText('3 verses here connect to older Scripture')).toBeTruthy();
    const buttons = screen.getAllByText(/Where does v\.\d+ come from\?/);
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toContain('v.1');
    expect(buttons[1].textContent).toContain('v.14');
    expect(buttons[2].textContent).toContain('v.29');
  });

  it('advances the ladder unrevealed → category → reference, keeping the category line visible, and never renders the target ref before the second rung', () => {
    renderCard([makeChapterCrossRef({ verse: 1, targetRef: 'Gen.1.1' })]);

    expect(screen.getByText('Where does v.1 come from?')).toBeTruthy();
    expect(screen.queryByText('Genesis 1:1')).toBeNull();

    fireEvent.click(screen.getByText('Where does v.1 come from?'));
    expect(screen.getByText("It's in the law.")).toBeTruthy();
    expect(screen.getByText('Show me')).toBeTruthy();
    expect(screen.queryByText('Genesis 1:1')).toBeNull();

    fireEvent.click(screen.getByText('Show me'));
    expect(screen.getByText("It's in the law.")).toBeTruthy();
    expect(screen.getByText('Genesis 1:1')).toBeTruthy();
    expect(screen.queryByText('Show me')).toBeNull();
    expect(screen.queryByText('Where does v.1 come from?')).toBeNull();
  });

  it('reveal state is store-backed and survives unmount/remount', () => {
    const { unmount } = renderCard([makeChapterCrossRef({ verse: 1, targetRef: 'Gen.1.1' })]);
    fireEvent.click(screen.getByText('Where does v.1 come from?'));
    unmount();

    renderCard([makeChapterCrossRef({ verse: 1, targetRef: 'Gen.1.1' })]);
    expect(screen.getByText("It's in the law.")).toBeTruthy();
  });

  it('jumps via navigateToVerse with the parsed start reference, pushing history', () => {
    renderCard([makeChapterCrossRef({ verse: 1, targetRef: 'Gen.1.1' })]);
    fireEvent.click(screen.getByText('Where does v.1 come from?'));
    fireEvent.click(screen.getByText('Show me'));
    fireEvent.click(screen.getByText('Genesis 1:1'));
    expect(navigateToVerse).toHaveBeenCalledWith('Gen', 1, 1, true);
  });

  it('fires discovery_chip_tapped once per cross-reference, only on the first reveal', () => {
    renderCard([makeChapterCrossRef({ verse: 1, targetRef: 'Gen.1.1' })]);
    trackMock.mockClear();

    fireEvent.click(screen.getByText('Where does v.1 come from?'));
    expect(trackMock).toHaveBeenCalledWith('discovery_chip_tapped', { feature: 'crossref' });
    expect(trackMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Show me'));
    expect(trackMock).toHaveBeenCalledTimes(1); // no second tap event for the same cross-reference
  });

  it('keeps the reveal button focusable across the unrevealed → category transition (same DOM node, not a remount)', () => {
    renderCard([makeChapterCrossRef({ verse: 1, targetRef: 'Gen.1.1' })]);
    const button = screen.getByText('Where does v.1 come from?');
    button.focus();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    // Same element updated in place — its label changed, but focus never left it.
    expect(document.activeElement).toBe(button);
    expect(button.textContent).toBe('Show me');
  });

  it('gives each row a distinguishing accessible name once revealed, even when the category line is identical across rows', () => {
    renderCard([
      makeChapterCrossRef({ verse: 1, targetRef: 'Ps.2.7', votes: 100 }),
      makeChapterCrossRef({ verse: 5, targetRef: 'Ps.45.6', votes: 90 }),
      makeChapterCrossRef({ verse: 14, targetRef: 'Ps.89.27', votes: 80 }),
    ]);

    fireEvent.click(screen.getByText('Where does v.1 come from?'));
    fireEvent.click(screen.getByText('Where does v.5 come from?'));

    // Both rows now show a "Show me" button — the bare text is ambiguous,
    // so the row for v.5 must be reachable by its distinguishing name.
    expect(screen.getAllByText('Show me')).toHaveLength(2);
    const showMeForFive = screen.getByRole('button', { name: 'Show me where v.5 comes from' });

    fireEvent.click(showMeForFive);
    expect(screen.getByText('Psalms 45:6')).toBeTruthy();
    // The other row's ladder is untouched.
    expect(screen.getByText('Show me')).toBeTruthy();
  });

  it('skips the category rung when the target book has no section label, going straight to the reference in one tap', () => {
    renderCard([makeChapterCrossRef({ verse: 3, targetRef: 'Xyz.1.1' })]);

    fireEvent.click(screen.getByText('Where does v.3 come from?'));

    expect(screen.queryByText(/^It's in/)).toBeNull();
    expect(screen.queryByText('Show me')).toBeNull();
    expect(screen.getByText('Xyz 1:1')).toBeTruthy();
  });

  it('renders a target with no verse number as plain text instead of a jump button', () => {
    renderCard([makeChapterCrossRef({ verse: 7, targetRef: 'Gen.5' })]);

    fireEvent.click(screen.getByText('Where does v.7 come from?'));
    fireEvent.click(screen.getByText('Show me'));

    const text = screen.getByText('Gen.5');
    expect(text.tagName).not.toBe('BUTTON');
    expect(screen.queryByRole('button', { name: 'Gen.5' })).toBeNull();
  });
});
