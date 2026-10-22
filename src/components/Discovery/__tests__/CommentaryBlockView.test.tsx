/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CommentaryBlockView } from '../CommentaryCard';
import { track } from '@/lib/telemetry';
import type { CommentaryBlock } from '@/lib/commentary';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: (selector: (s: { navigateToVerse: () => void }) => unknown) =>
    selector({ navigateToVerse: vi.fn() }),
}));
vi.mock('@/hooks/useCommentaryPassage', () => ({
  useCommentaryPassage: () => ({ status: 'loading', verses: [], passage: null }),
}));

const BLOCK: CommentaryBlock = {
  id: 's1',
  commentaryId: 'mhcc',
  kind: 'section',
  book: 'Luke',
  chapter: 1,
  startVerse: 5,
  endVerse: 25,
  title: 'Zacharias and Elisabeth',
  paragraphs: [[{ text: 'See ' }, { text: 'Ac 16:10', osisRef: 'Acts.16.10' }]],
};

const SCOPE = { book: 'Luke', chapter: 1, translationId: 'sword-NASB' };

const protoScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
const protoClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

function restore(prop: 'scrollHeight' | 'clientHeight', descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
}

describe('CommentaryBlockView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 100 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 40 });
  });

  afterEach(() => {
    cleanup();
    restore('scrollHeight', protoScrollHeight);
    restore('clientHeight', protoClientHeight);
  });

  it('renders expanded when controlled and Read more only reports the change', () => {
    const onExpandedChange = vi.fn();
    const { rerender } = render(
      <CommentaryBlockView block={BLOCK} scope={SCOPE} translationAbbrev="NASB" expanded={false} onExpandedChange={onExpandedChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Read more' })).toBeTruthy();

    rerender(
      <CommentaryBlockView block={BLOCK} scope={SCOPE} translationAbbrev="NASB" expanded onExpandedChange={onExpandedChange} />
    );
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  });

  it('reports expansion when a reference is tapped', () => {
    const onExpandedChange = vi.fn();
    render(<CommentaryBlockView block={BLOCK} scope={SCOPE} translationAbbrev="NASB" onExpandedChange={onExpandedChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it('sends custom feature names to telemetry', () => {
    render(
      <CommentaryBlockView
        block={BLOCK}
        scope={SCOPE}
        translationAbbrev="NASB"
        features={{ more: 'commentary_follow_more', reference: 'commentary_follow_reference' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    expect(track).toHaveBeenCalledWith('discovery_chip_tapped', expect.objectContaining({ feature: 'commentary_follow_more' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ac 16:10' }));
    expect(track).toHaveBeenCalledWith('discovery_chip_tapped', expect.objectContaining({ feature: 'commentary_follow_reference' }));
  });

  it('hides the range header when showHeader is false', () => {
    const { rerender } = render(<CommentaryBlockView block={BLOCK} scope={SCOPE} translationAbbrev="NASB" />);
    expect(screen.getByRole('heading', { level: 4 })).toBeTruthy();
    rerender(<CommentaryBlockView block={BLOCK} scope={SCOPE} translationAbbrev="NASB" showHeader={false} />);
    expect(screen.queryByRole('heading', { level: 4 })).toBeNull();
  });
});
