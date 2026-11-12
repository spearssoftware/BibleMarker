/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChapterTitleEditor } from '../ChapterTitleEditor';
import type { ChapterTitle } from '@/types';

afterEach(cleanup);

const title: ChapterTitle = {
  id: 't1',
  book: 'JHN',
  chapter: 1,
  title: 'The Word Became Flesh',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ChapterTitleEditor readOnly', () => {
  it('enters editing on click when not readOnly', async () => {
    render(<ChapterTitleEditor title={title} />);

    await userEvent.click(screen.getByText('The Word Became Flesh'));

    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('ignores clicks and drops the edit affordances when readOnly', async () => {
    render(<ChapterTitleEditor title={title} readOnly />);

    await userEvent.click(screen.getByText('The Word Became Flesh'));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByTitle('Click to edit')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.getByText('The Word Became Flesh').parentElement?.className).not.toContain('cursor-pointer');
  });
});
