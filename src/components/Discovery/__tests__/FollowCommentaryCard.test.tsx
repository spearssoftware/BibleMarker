/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FollowCommentaryCard } from '../FollowCommentaryCard';
import { track } from '@/lib/telemetry';
import { useReadingPositionStore } from '@/stores/readingPositionStore';
import type { CommentaryBlock } from '@/lib/commentary';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: (selector: (s: { navigateToVerse: () => void }) => unknown) =>
    selector({ navigateToVerse: vi.fn() }),
}));

interface CommentaryState { blocks: CommentaryBlock[]; isLoading: boolean; error: string | null }
let commentary: CommentaryState;

vi.mock('@/hooks/useChapterCommentary', () => ({
  useChapterCommentary: () => commentary,
}));
vi.mock('@/hooks/useCommentaryPassage', () => ({
  useCommentaryPassage: () => ({ status: 'loading', verses: [], passage: null }),
}));

function makeBlock(overrides: Partial<CommentaryBlock> & Pick<CommentaryBlock, 'id' | 'kind'>): CommentaryBlock {
  return {
    commentaryId: 'mhcc',
    book: 'Luke',
    chapter: 1,
    startVerse: null,
    endVerse: null,
    title: null,
    paragraphs: [[{ text: 'Plain commentary text.' }]],
    ...overrides,
  };
}

const LUKE_1: CommentaryBlock[] = [
  makeBlock({ id: 'book-intro', kind: 'book-intro' }),
  makeBlock({
    id: 's1-4', kind: 'section', startVerse: 1, endVerse: 4, title: 'The Preface',
    paragraphs: [[{ text: 'See ' }, { text: 'Ac 16:10', osisRef: 'Acts.16.10' }]],
  }),
  makeBlock({ id: 's5-25', kind: 'section', startVerse: 5, endVerse: 25, title: 'Zacharias and Elisabeth' }),
  makeBlock({ id: 's26-38', kind: 'section', startVerse: 26, endVerse: 38 }),
  makeBlock({ id: 's57-66', kind: 'section', startVerse: 57, endVerse: 66, title: 'John born' }),
  makeBlock({ id: 's67-80', kind: 'section', startVerse: 67, endVerse: 80 }),
];

const SOURCE_LINE = "Matthew Henry's Concise Commentary · public domain";
const dedupe = (type: string, feature: string, chapter = 1) =>
  `${type}:${feature}:Luke:${chapter}:sword-NASB`;

const renderCard = (chapter = 1) =>
  render(<FollowCommentaryCard book="Luke" chapter={chapter} translationId="sword-NASB" translationAbbrev="NASB" />);

const setVerse = (currentVerse: number | null) => act(() => useReadingPositionStore.setState({ currentVerse }));

const protoScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
const protoClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

function restore(prop: 'scrollHeight' | 'clientHeight', descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
}

describe('FollowCommentaryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commentary = { blocks: LUKE_1, isLoading: false, error: null };
    useReadingPositionStore.setState({ currentVerse: null });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 100 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 40 });
  });

  afterEach(() => {
    cleanup();
    restore('scrollHeight', protoScrollHeight);
    restore('clientHeight', protoClientHeight);
  });

  it('shows the first section before the reader position is known', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Commentary on 1:1–4' })).toBeTruthy();
    expect(screen.getByText(SOURCE_LINE)).toBeTruthy();
    expect(screen.getByText('The Preface')).toBeTruthy();
  });

  it('follows the current verse', () => {
    renderCard();
    setVerse(10);
    expect(screen.getByRole('heading', { name: 'Commentary on 1:5–25' })).toBeTruthy();
    expect(screen.getByText('Zacharias and Elisabeth')).toBeTruthy();
  });

  it('pins on Read more so the card stops following', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    setVerse(60);
    expect(screen.getByRole('heading', { name: 'Commentary on 1:1–4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
  });

  it('pins when a reference is tapped', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
    setVerse(60);
    expect(screen.getByRole('heading', { name: 'Commentary on 1:1–4' })).toBeTruthy();
  });

  it('unpins on Show less and follows the reader again', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    setVerse(60);
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.getByRole('heading', { name: 'Commentary on 1:57–66' })).toBeTruthy();
  });

  it('titles a whole-chapter block by chapter', () => {
    commentary = { blocks: [makeBlock({ id: 'whole', kind: 'whole-chapter', chapter: 36 })], isLoading: false, error: null };
    renderCard(36);
    expect(screen.getByRole('heading', { name: 'Commentary on chapter 36' })).toBeTruthy();
  });

  it('titles a chapter intro by chapter', () => {
    commentary = { blocks: [makeBlock({ id: 'intro', kind: 'chapter-intro', chapter: 19 })], isLoading: false, error: null };
    renderCard(19);
    expect(screen.getByRole('heading', { name: 'Commentary on chapter 19' })).toBeTruthy();
  });

  it('titles a single-verse section without a range', () => {
    commentary = {
      blocks: [makeBlock({ id: 's7', kind: 'section', startVerse: 7, endVerse: 7 })],
      isLoading: false,
      error: null,
    };
    renderCard();
    expect(screen.getByRole('heading', { name: 'Commentary on 1:7' })).toBeTruthy();
  });

  it.each([
    ['loading', { blocks: [], isLoading: true, error: null }],
    ['an error', { blocks: LUKE_1, isLoading: false, error: 'boom' }],
    ['no commentary', { blocks: [], isLoading: false, error: null }],
  ])('renders nothing for %s', (_label, state) => {
    commentary = state;
    const { container } = renderCard();
    expect(container.innerHTML).toBe('');
  });

  it('tracks shown, Read more and reference taps with follow features', () => {
    renderCard();
    expect(track).toHaveBeenCalledWith('discovery_chip_shown', {
      feature: 'commentary_follow',
      dedupeKey: dedupe('discovery_chip_shown', 'commentary_follow'),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    expect(track).toHaveBeenCalledWith('discovery_chip_tapped', {
      feature: 'commentary_follow_more',
      dedupeKey: dedupe('discovery_chip_tapped', 'commentary_follow_more'),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
    expect(track).toHaveBeenCalledWith('discovery_chip_tapped', {
      feature: 'commentary_follow_reference',
      dedupeKey: dedupe('discovery_chip_tapped', 'commentary_follow_reference'),
    });
  });
});
