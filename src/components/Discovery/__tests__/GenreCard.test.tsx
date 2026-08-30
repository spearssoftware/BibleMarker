/**
 * @vitest-environment jsdom
 *
 * GenreCard shows the book's genre-tuned orientation + per-chapter question,
 * a deterministic question across reloads/different per chapter, and a
 * neutral one-line fallback (no orientation/question) for a book id with no
 * genre entry.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { GenreCard } from '../GenreCard';
import { orientationFor, questionFor } from '@/lib/chapterAnalysis';

describe('GenreCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the book name + genre label, orientation, and question for a known book', () => {
    render(<GenreCard book="Heb" chapter={1} />);
    expect(screen.getByText('Hebrews — a letter')).toBeTruthy();
    expect(screen.getByText(orientationFor('Heb')!)).toBeTruthy();
    expect(screen.getByText(questionFor('Heb', 1)!)).toBeTruthy();
  });

  it('labels Psalms as a collection of poems, not a single poem', () => {
    render(<GenreCard book="Ps" chapter={1} />);
    expect(screen.getByText('Psalms — a collection of poems')).toBeTruthy();
  });

  it('labels Daniel with plain-language "visions", not the jargon term "apocalypse"', () => {
    render(<GenreCard book="Dan" chapter={1} />);
    expect(screen.getByText(/Daniel — /)).toBeTruthy();
    expect(screen.queryByText(/apocalypse/i)).toBeNull();
  });

  it('renders a different, deterministic question for a different chapter', () => {
    const { unmount } = render(<GenreCard book="Ps" chapter={1} />);
    const q1 = questionFor('Ps', 1)!;
    expect(screen.getByText(q1)).toBeTruthy();
    unmount();

    render(<GenreCard book="Ps" chapter={2} />);
    const q2 = questionFor('Ps', 2)!;
    expect(screen.getByText(q2)).toBeTruthy();
    expect(q1).not.toBe(q2);
  });

  it('shows a neutral one-line fallback, with no orientation/question, for a book id with no genre entry', () => {
    render(<GenreCard book="NotABook" chapter={1} />);
    expect(screen.getByText('NotABook')).toBeTruthy();
    expect(screen.queryByText('Hebrews — a letter')).toBeNull();
    // No orientation/question lines rendered — just the fallback body copy.
    expect(screen.getByText(/every chapter rewards a close read/i)).toBeTruthy();
  });
});
