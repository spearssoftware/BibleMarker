/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VerseNumberMenu } from '../VerseNumberMenu';

afterEach(cleanup);

describe('VerseNumberMenu', () => {
  it('shows only Add Note and Cancel when only onAddNote is passed', () => {
    render(<VerseNumberMenu verseNum={3} onAddNote={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getAllByRole('menuitem').map(el => el.getAttribute('aria-label'))).toEqual([
      'Add note to verse 3',
      'Cancel',
    ]);
  });

  it('shows the Discover set', () => {
    render(
      <VerseNumberMenu
        verseNum={3}
        onAddNote={vi.fn()}
        onCrossRefs={vi.fn()}
        onOriginalLanguage={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Add Note')).toBeTruthy();
    expect(screen.getByText('Cross-References')).toBeTruthy();
    expect(screen.getByText('Hebrew/Greek')).toBeTruthy();
    expect(screen.queryByText('Add Section Heading')).toBeNull();
    expect(screen.queryByText('Add Observation')).toBeNull();
    expect(screen.queryByText('Add Time Expression')).toBeNull();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
  });

  it('shows every item when every handler is passed', () => {
    render(
      <VerseNumberMenu
        verseNum={3}
        onAddHeading={vi.fn()}
        onAddNote={vi.fn()}
        onAddObservation={vi.fn()}
        onAddTimeExpression={vi.fn()}
        onCrossRefs={vi.fn()}
        onOriginalLanguage={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getAllByRole('menuitem')).toHaveLength(7);
  });

  it.each([
    ['Add Section Heading', 'onAddHeading'],
    ['Add Note', 'onAddNote'],
    ['Add Observation', 'onAddObservation'],
    ['Add Time Expression', 'onAddTimeExpression'],
    ['Cross-References', 'onCrossRefs'],
    ['Hebrew/Greek', 'onOriginalLanguage'],
  ])('%s calls its handler and onClose', async (label, handlerName) => {
    const handler = vi.fn();
    const onClose = vi.fn();
    render(
      <VerseNumberMenu
        verseNum={3}
        onAddHeading={handlerName === 'onAddHeading' ? handler : vi.fn()}
        onAddNote={handlerName === 'onAddNote' ? handler : vi.fn()}
        onAddObservation={handlerName === 'onAddObservation' ? handler : vi.fn()}
        onAddTimeExpression={handlerName === 'onAddTimeExpression' ? handler : vi.fn()}
        onCrossRefs={handlerName === 'onCrossRefs' ? handler : vi.fn()}
        onOriginalLanguage={handlerName === 'onOriginalLanguage' ? handler : vi.fn()}
        onClose={onClose}
      />
    );

    await userEvent.click(screen.getByText(label));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
