/**
 * @vitest-environment jsdom
 *
 * Echo Hints must never leak the target reference into the DOM before the
 * reader has earned the second rung — the category hint ("It's in the
 * law.") comes first and stays visible once the reference is revealed,
 * mirroring `RepetitionCard`'s accumulating ladder.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EchoesCard } from '../EchoesCard';
import { formatEchoTarget } from '@/lib/chapterAnalysis';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { makeChapterEcho } from '@/lib/__test__/factories';
import type { ChapterEcho } from '@/types';

const navigateToVerse = vi.fn();
vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: (selector: (s: { navigateToVerse: typeof navigateToVerse }) => unknown) =>
    selector({ navigateToVerse }),
}));

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

function renderCard(echoes: ChapterEcho[], overrides: { book?: string; chapter?: number; translationId?: string } = {}) {
  return render(
    <EchoesCard
      echoes={echoes}
      book={overrides.book ?? 'John'}
      chapter={overrides.chapter ?? 1}
      translationId={overrides.translationId ?? 'sword-NASB'}
    />
  );
}

describe('EchoesCard', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ revealedEchoes: {} });
    navigateToVerse.mockClear();
    trackMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when there are no echoes', () => {
    const { container } = renderCard([]);
    expect(container.innerHTML).toBe('');
  });

  it('agrees the title at n=1', () => {
    renderCard([makeChapterEcho({ verse: 1 })]);
    expect(screen.getByText('1 verse here echoes something older')).toBeTruthy();
  });

  it('agrees the title at n>1', () => {
    renderCard([
      makeChapterEcho({ verse: 1, votes: 300 }),
      makeChapterEcho({ verse: 14, targetRef: 'Isa.40.5', votes: 200 }),
    ]);
    expect(screen.getByText('2 verses here echo something older')).toBeTruthy();
  });

  it('shows at most the 3 highest-voted echoes, verse-ordered', () => {
    const echoes = [
      makeChapterEcho({ verse: 29, targetRef: 'Isa.53.7', votes: 50 }),
      makeChapterEcho({ verse: 1, targetRef: 'Gen.1.1', votes: 276 }),
      makeChapterEcho({ verse: 14, targetRef: 'Isa.40.5', votes: 150 }),
      makeChapterEcho({ verse: 5, targetRef: 'Ps.2.7', votes: 10 }), // lowest-voted, should be dropped
    ];
    renderCard(echoes);
    expect(screen.getByText('3 verses here echo something older')).toBeTruthy();
    const buttons = screen.getAllByText(/Where does v\.\d+ come from\?/);
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toContain('v.1');
    expect(buttons[1].textContent).toContain('v.14');
    expect(buttons[2].textContent).toContain('v.29');
  });

  it('advances the ladder unrevealed → category → reference, keeping the category line visible, and never renders the target ref before the second rung', () => {
    renderCard([makeChapterEcho({ verse: 1, targetRef: 'Gen.1.1' })]);

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
    const { unmount } = renderCard([makeChapterEcho({ verse: 1, targetRef: 'Gen.1.1' })]);
    fireEvent.click(screen.getByText('Where does v.1 come from?'));
    unmount();

    renderCard([makeChapterEcho({ verse: 1, targetRef: 'Gen.1.1' })]);
    expect(screen.getByText("It's in the law.")).toBeTruthy();
  });

  it('jumps via navigateToVerse with the parsed start reference, pushing history', () => {
    renderCard([makeChapterEcho({ verse: 1, targetRef: 'Gen.1.1' })]);
    fireEvent.click(screen.getByText('Where does v.1 come from?'));
    fireEvent.click(screen.getByText('Show me'));
    fireEvent.click(screen.getByText('Genesis 1:1'));
    expect(navigateToVerse).toHaveBeenCalledWith('Gen', 1, 1, true);
  });

  it('fires discovery_chip_shown once with the echo feature and dedupe key', () => {
    renderCard([makeChapterEcho({ verse: 1 })], { book: 'Heb', chapter: 1, translationId: 'sword-NASB' });
    expect(trackMock).toHaveBeenCalledWith('discovery_chip_shown', {
      feature: 'echo',
      dedupeKey: 'echo:Heb:1:sword-NASB',
    });
  });

  it('fires discovery_chip_tapped once per echo, only on the first reveal', () => {
    renderCard([makeChapterEcho({ verse: 1, targetRef: 'Gen.1.1' })]);
    trackMock.mockClear();

    fireEvent.click(screen.getByText('Where does v.1 come from?'));
    expect(trackMock).toHaveBeenCalledWith('discovery_chip_tapped', { feature: 'echo' });
    expect(trackMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Show me'));
    expect(trackMock).toHaveBeenCalledTimes(1); // no second tap event for the same echo
  });
});

describe('formatEchoTarget', () => {
  it('formats a single verse', () => {
    expect(formatEchoTarget('Gen.1.1', null)).toBe('Genesis 1:1');
  });

  it('formats a same-book, same-chapter range as "Psalms 45:6–7"', () => {
    expect(formatEchoTarget('Ps.45.6', 'Ps.45.7')).toBe('Psalms 45:6–7');
  });

  it('formats a same-book, cross-chapter range as "Deuteronomy 28:2–29:1"', () => {
    expect(formatEchoTarget('Deut.28.2', 'Deut.29.1')).toBe('Deuteronomy 28:2–29:1');
  });

  it('falls back to the start ref for a cross-book range', () => {
    expect(formatEchoTarget('Mal.4.5', 'Matt.11.14')).toBe('Malachi 4:5');
  });
});
