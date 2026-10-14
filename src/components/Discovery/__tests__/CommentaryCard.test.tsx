/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CommentaryCard } from '../CommentaryCard';
import { track } from '@/lib/telemetry';
import type { CommentaryBlock } from '@/lib/commentary';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const navigateToVerse = vi.fn();
vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: (selector: (s: { navigateToVerse: typeof navigateToVerse }) => unknown) =>
    selector({ navigateToVerse }),
}));

interface CommentaryState { blocks: CommentaryBlock[]; isLoading: boolean; error: string | null }
interface PassageState {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'missing';
  verses: { verse: number; text: string }[];
  passage: { book: string; chapter: number; startVerse: number; endVerse: number; label: string } | null;
}

let commentary: CommentaryState;
let passageState: PassageState;
const passageCalls: (string | null)[] = [];

vi.mock('@/hooks/useChapterCommentary', () => ({
  useChapterCommentary: (book: string, chapter: number) => {
    // Blocks belong to the chapter they were loaded for, as in the real hook.
    return commentary.blocks.length && commentary.blocks[0].chapter !== chapter && book
      ? { blocks: [], isLoading: false, error: null }
      : commentary;
  },
}));
vi.mock('@/hooks/useCommentaryPassage', () => ({
  useCommentaryPassage: (osisRef: string | null) => {
    passageCalls.push(osisRef);
    return passageState;
  },
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

const BOOK_INTRO = makeBlock({
  id: 'book-intro',
  kind: 'book-intro',
  paragraphs: [
    [{ text: 'First paragraph, see ' }, { text: 'Ac 16:10', osisRef: 'Acts.16.10' }, { text: ' and ' }, { text: 'Jn 3:16', osisRef: 'John.3.16' }],
    [{ text: 'Second paragraph.' }],
  ],
});
const WHOLE = makeBlock({ id: 'whole', kind: 'whole-chapter' });
const TITLED = makeBlock({ id: 's1', kind: 'section', startVerse: 5, endVerse: 25, title: 'Zacharias and Elisabeth' });
const UNTITLED = makeBlock({ id: 's2', kind: 'section', startVerse: 26, endVerse: 38 });
const SINGLE = makeBlock({ id: 's3', kind: 'section', startVerse: 39, endVerse: 39, title: 'Mary visits' });

const SCOPE = { feature: 'commentary', dedupeKey: 'discovery_chip_shown:commentary:Luke:1:sword-NASB' };

const renderCard = (props: Partial<{ chapter: number; translationId: string; translationAbbrev: string | null }> = {}) =>
  render(
    <CommentaryCard
      book="Luke"
      chapter={props.chapter ?? 1}
      translationId={props.translationId ?? 'sword-NASB'}
      translationAbbrev={props.translationAbbrev === undefined ? 'NASB' : props.translationAbbrev}
    />
  );

const protoScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
const protoClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

function mockOverflow(overflowing: boolean) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => (overflowing ? 100 : 40) });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 40 });
}

function restore(prop: 'scrollHeight' | 'clientHeight', descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
}

describe('CommentaryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    passageCalls.length = 0;
    commentary = { blocks: [BOOK_INTRO, WHOLE, TITLED, UNTITLED, SINGLE], isLoading: false, error: null };
    passageState = { status: 'idle', verses: [], passage: null };
    mockOverflow(true);
  });

  afterEach(() => {
    cleanup();
    restore('scrollHeight', protoScrollHeight);
    restore('clientHeight', protoClientHeight);
  });

  it('renders the title and attribution line', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: "Matthew Henry's Concise Commentary" })).toBeTruthy();
    expect(screen.getByText("Public domain · abridged from Matthew Henry's Exposition")).toBeTruthy();
  });

  it('renders blocks in the order given', () => {
    renderCard();
    const text = document.body.textContent ?? '';
    const positions = ['First paragraph', 'Plain commentary text.', 'Zacharias and Elisabeth', '1:26–38', 'Mary visits'].map(t =>
      text.indexOf(t)
    );
    expect(positions.every(p => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('formats section headings with a title, without one, and for a single verse', () => {
    renderCard();
    const headings = screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent);
    expect(headings).toEqual(['Zacharias and Elisabeth · 1:5–25', '1:26–38', 'Mary visits · 1:39']);
  });

  it('gives intro and whole-chapter blocks no heading', () => {
    commentary = { ...commentary, blocks: [BOOK_INTRO, WHOLE] };
    renderCard();
    expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0);
  });

  it('shows Read more only when the clamped text overflows', () => {
    mockOverflow(false);
    renderCard();
    expect(screen.queryByRole('button', { name: 'Read more' })).toBeNull();
    cleanup();
    mockOverflow(true);
    renderCard();
    expect(screen.getAllByRole('button', { name: 'Read more' })).toHaveLength(5);
  });

  it('clamps collapsed text in one paragraph and expands to one paragraph each', () => {
    commentary = { ...commentary, blocks: [BOOK_INTRO] };
    const { container } = renderCard();
    expect(container.querySelectorAll('p.line-clamp-3')).toHaveLength(1);
    const more = screen.getByRole('button', { name: 'Read more' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(container.querySelectorAll('p.line-clamp-3')).toHaveLength(0);
    expect(screen.getByText('Second paragraph.').closest('p')).toBeTruthy();
    const less = screen.getByRole('button', { name: 'Show less' });
    expect(less.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(less);
    expect(container.querySelectorAll('p.line-clamp-3')).toHaveLength(1);
  });

  it('keeps Show less available on an expanded block that no longer overflows', () => {
    commentary = { ...commentary, blocks: [WHOLE] };
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    mockOverflow(false);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
  });

  it('resets every block to clamped when the chapter changes', () => {
    commentary = { ...commentary, blocks: [WHOLE] };
    const { rerender } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
    commentary = { ...commentary, blocks: [{ ...WHOLE, chapter: 2 }] };
    rerender(<CommentaryCard book="Luke" chapter={2} translationId="sword-NASB" translationAbbrev="NASB" />);
    expect(screen.getByRole('button', { name: 'Read more' })).toBeTruthy();
  });

  it('jumps to the first verse when a range is tapped and tracks commentary_range', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: '1:26–38' }));
    expect(navigateToVerse).toHaveBeenCalledWith('Luke', 1, 26, true);
    expect(track).toHaveBeenCalledWith('discovery_chip_tapped', {
      feature: 'commentary_range',
      dedupeKey: 'discovery_chip_tapped:commentary_range:Luke:1:sword-NASB',
    });
  });

  describe('references', () => {
    beforeEach(() => {
      commentary = { ...commentary, blocks: [BOOK_INTRO] };
    });

    it('keeps references out of the tab order while collapsed', () => {
      renderCard();
      expect(screen.getByRole('button', { name: 'Ac 16:10' }).getAttribute('tabindex')).toBe('-1');
    });

    it('fetches nothing until a reference is tapped', () => {
      renderCard();
      expect(passageCalls).toEqual([]);
    });

    it('expands a clamped block and shows the loading state', () => {
      passageState = { status: 'loading', verses: [], passage: null };
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
      expect(screen.getByText('Loading…')).toBeTruthy();
      expect(passageCalls).toContain('Acts.16.10');
      expect(screen.getByRole('button', { name: 'Ac 16:10' }).getAttribute('tabindex')).toBeNull();
    });

    it('shows the passage below its paragraph with a Go to button', () => {
      passageState = {
        status: 'ready',
        verses: [{ verse: 10, text: 'And when he had seen the vision.' }],
        passage: { book: 'Acts', chapter: 16, startVerse: 10, endVerse: 10, label: 'Acts 16:10' },
      };
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      const verse = screen.getByText('And when he had seen the vision.');
      const firstParagraph = screen.getByText('First paragraph, see').closest('p') as HTMLElement;
      expect(firstParagraph.parentElement?.contains(verse)).toBe(true);
      expect(screen.getByText('Second paragraph.').closest('p')?.parentElement?.contains(verse)).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Go to Acts 16:10' }));
      expect(navigateToVerse).toHaveBeenCalledWith('Acts', 16, 10, true);
    });

    it('numbers the verses when the passage spans more than one', () => {
      passageState = {
        status: 'ready',
        verses: [{ verse: 10, text: 'Ten text.' }, { verse: 11, text: 'Eleven text.' }],
        passage: { book: 'Acts', chapter: 16, startVerse: 10, endVerse: 11, label: 'Acts 16:10–11' },
      };
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      expect(screen.getByText('11')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Go to Acts 16:10–11' })).toBeTruthy();
    });

    it('shows a failure message on error', () => {
      passageState = { status: 'error', verses: [], passage: null };
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      expect(screen.getByText("Couldn't load that passage.")).toBeTruthy();
    });

    it('says the passage is missing, using the abbreviation, with no Go to button', () => {
      passageState = {
        status: 'missing',
        verses: [],
        passage: { book: 'Acts', chapter: 16, startVerse: 10, endVerse: 10, label: 'Acts 16:10' },
      };
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      expect(screen.getByText("This passage isn't in NASB.")).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Go to/ })).toBeNull();
    });

    it('falls back to the translation id without its sword- prefix', () => {
      passageState = { status: 'missing', verses: [], passage: null };
      renderCard({ translationAbbrev: null, translationId: 'sword-ASV' });
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      expect(screen.getByText("This passage isn't in ASV.")).toBeTruthy();
    });

    it('collapses on a second tap of the same reference', () => {
      passageState = { status: 'loading', verses: [], passage: null };
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      expect(screen.getByText('Loading…')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      expect(screen.queryByText('Loading…')).toBeNull();
    });

    it('closes the open passage on Show less', () => {
      passageState = { status: 'loading', verses: [], passage: null };
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
      expect(screen.queryByText('Loading…')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      expect(screen.getByText('Loading…')).toBeTruthy();
    });

    it('keeps one passage open per block, replacing it when another reference is tapped', () => {
      passageState = { status: 'loading', verses: [], passage: null };
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      fireEvent.click(screen.getByRole('button', { name: 'Jn 3:16' }));
      expect(screen.getAllByText('Loading…')).toHaveLength(1);
      expect(passageCalls[passageCalls.length - 1]).toBe('John.3.16');
    });

    it('discards the open passage when the chapter changes', () => {
      passageState = { status: 'loading', verses: [], passage: null };
      const { rerender } = renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      commentary = { ...commentary, blocks: [{ ...BOOK_INTRO, chapter: 2 }] };
      rerender(<CommentaryCard book="Luke" chapter={2} translationId="sword-NASB" translationAbbrev="NASB" />);
      expect(screen.queryByText('Loading…')).toBeNull();
    });
  });

  describe('visibility', () => {
    it('renders nothing while loading', () => {
      commentary = { blocks: [], isLoading: true, error: null };
      const { container } = renderCard();
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when there are no blocks', () => {
      commentary = { blocks: [], isLoading: false, error: null };
      const { container } = renderCard();
      expect(container.firstChild).toBeNull();
      expect(track).not.toHaveBeenCalled();
    });

    it('renders nothing on a load failure', () => {
      commentary = { blocks: [], isLoading: false, error: 'boom' };
      const { container } = renderCard();
      expect(container.firstChild).toBeNull();
      expect(track).not.toHaveBeenCalled();
    });
  });

  describe('telemetry', () => {
    it('fires discovery_chip_shown for commentary when blocks render', () => {
      renderCard();
      expect(track).toHaveBeenCalledWith('discovery_chip_shown', SCOPE);
    });

    it('fires discovery_chip_tapped for commentary on Read more', () => {
      commentary = { ...commentary, blocks: [WHOLE] };
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
      expect(track).toHaveBeenCalledWith('discovery_chip_tapped', {
        feature: 'commentary',
        dedupeKey: 'discovery_chip_tapped:commentary:Luke:1:sword-NASB',
      });
    });

    it('fires discovery_chip_tapped for commentary_reference when a reference opens', () => {
      commentary = { ...commentary, blocks: [BOOK_INTRO] };
      passageState = { status: 'loading', verses: [], passage: null };
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
      expect(track).toHaveBeenCalledWith('discovery_chip_tapped', {
        feature: 'commentary_reference',
        dedupeKey: 'discovery_chip_tapped:commentary_reference:Luke:1:sword-NASB',
      });
    });
  });
});
