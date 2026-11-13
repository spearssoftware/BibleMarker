/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { VerseText } from '../VerseText';
import type { TextAnnotation, Verse } from '@/types';

vi.mock('@/lib/database', () => ({
  getPreferences: vi.fn(async () => ({})),
  getAllMarkingPresets: vi.fn(async () => []),
  getAllStudies: vi.fn(async () => []),
  getAllKeywordExclusions: vi.fn(async () => []),
}));

afterEach(cleanup);

const verse: Verse = { ref: { book: 'Rom', chapter: 5, verse: 8 }, text: 'But God shows his love for us.' };

const highlight: TextAnnotation = {
  id: 'ann-1',
  moduleId: 'sword-NASB',
  type: 'highlight',
  startRef: verse.ref,
  endRef: verse.ref,
  startOffset: 4,
  endOffset: 7,
  color: 'yellow',
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe('VerseText verse number', () => {
  it('shows the number and its menu by default', () => {
    const { container } = render(
      <VerseText verse={verse} annotations={[]} verseMenu={<div data-testid="menu" />} />
    );

    expect(container.querySelector('.verse-number')?.textContent).toBe('8');
    expect(container.querySelector('[data-testid="menu"]')).toBeTruthy();
  });

  it('hides the number and its menu but keeps the verse row, text and marks', () => {
    const { container } = render(
      <VerseText
        verse={verse}
        annotations={[highlight]}
        showVerseNumber={false}
        verseMenu={<div data-testid="menu" />}
      />
    );

    expect(container.querySelector('.verse-number')).toBeNull();
    expect(container.querySelector('[data-testid="menu"]')).toBeNull();
    expect(container.querySelector('[data-verse="8"]')).toBeTruthy();
    expect(container.querySelector('.verse-content')?.textContent).toBe(verse.text);
    expect(container.querySelector('.annotation-text')?.textContent).toBe('God');
  });
});
