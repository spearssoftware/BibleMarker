/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionHeadingEditor } from '../SectionHeadingEditor';
import type { SectionHeading } from '@/types';

afterEach(cleanup);

const heading: SectionHeading = {
  id: 'h1',
  beforeRef: { book: 'JHN', chapter: 1, verse: 1 },
  title: 'The Prologue',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('SectionHeadingEditor readOnly', () => {
  it('enters editing on click when not readOnly', async () => {
    render(<SectionHeadingEditor heading={heading} verseNum={1} />);

    await userEvent.click(screen.getByText('The Prologue'));

    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('ignores clicks and drops the edit affordances when readOnly', async () => {
    render(<SectionHeadingEditor heading={heading} verseNum={1} readOnly />);

    await userEvent.click(screen.getByText('The Prologue'));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByTitle('Click to edit')).toBeNull();
    expect(screen.getByText('The Prologue').className).not.toContain('cursor-pointer');
  });

  it('keeps showing the display when controlled isEditing is true but readOnly', () => {
    render(<SectionHeadingEditor heading={heading} verseNum={1} isEditing readOnly />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('The Prologue')).toBeTruthy();
  });
});
