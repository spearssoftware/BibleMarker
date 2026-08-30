/**
 * @vitest-environment jsdom
 *
 * LookAgainCard renders `useLookAgain`'s items as a list — undone rows are
 * real buttons that scroll to the matching anchor card (the title row
 * dispatches `openChapterTitleCreator` instead), done rows are static
 * checked content. It renders nothing until `ready`, and when everything
 * shown is done and inductive tools are off it shows the footer nudge with
 * a button that opens Settings → Bible.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { LookAgainCard } from '../LookAgainCard';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { usePanelStore } from '@/stores/panelStore';
import { useToastStore } from '@/stores/toastStore';
import type { LookAgainFollowUp, LookAgainItem } from '@/hooks/useLookAgain';
import type { MarkingPreset } from '@/types';

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

const anchors = { repetition: 'anchor-repetition', hinge: 'anchor-hinge', peoplePlaces: 'anchor-people-places' };

function makeItems(overrides?: Partial<Record<LookAgainItem['id'], boolean>>): LookAgainItem[] {
  return [
    { id: 'repetition', label: 'One word repeats 11× — find and mark it', done: overrides?.repetition ?? false },
    { id: 'person', label: '1 person is named — mark one where a person appears', done: overrides?.person ?? false },
    { id: 'hinge', label: '1 hinge holds this chapter — mark it', done: overrides?.hinge ?? false },
    { id: 'title', label: 'Say this chapter in your own words — give it a title', done: overrides?.title ?? false },
  ];
}

describe('LookAgainCard', () => {
  beforeEach(() => {
    usePreferencesStore.setState({ inductiveToolsEnabled: false, telemetryEnabled: false });
    usePanelStore.setState({ activePanel: null });
    useToastStore.setState({ toasts: [] });
    trackMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  // `ready` (from useLookAgain) already implies items.length > 0 in real
  // usage, so the card's render gate now checks only `ready` — an empty item
  // list can no longer occur alongside `ready: true`.
  it('renders nothing until ready, even with items', () => {
    const { container } = render(<LookAgainCard items={makeItems()} ready={false} anchors={anchors} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders each undone row as a button in the checklist list', () => {
    render(<LookAgainCard items={makeItems()} ready anchors={anchors} />);
    const list = screen.getByRole('list', { name: 'Look-again checklist' });
    expect(list.querySelectorAll('li')).toHaveLength(4);
    for (const item of makeItems()) {
      expect(screen.getByRole('button', { name: item.label })).toBeTruthy();
    }
  });

  it('renders a done row as static checked content, not a button', () => {
    render(<LookAgainCard items={makeItems({ title: true })} ready anchors={anchors} />);
    const label = 'Say this chapter in your own words — give it a title';
    expect(screen.queryByRole('button', { name: label })).toBeNull();
    const row = screen.getByText(label).closest('li');
    expect(row?.textContent).toContain('✓');
    expect(row?.textContent).toContain('(done)');
    expect(row?.querySelector('[aria-hidden="true"]')?.textContent).toBe('✓');
  });

  it.each([
    ['anchor-repetition', 'One word repeats 11× — find and mark it'],
    ['anchor-hinge', '1 hinge holds this chapter — mark it'],
    ['anchor-people-places', '1 person is named — mark one where a person appears'],
  ])('scrolls to the %s anchor when the matching undone row is tapped', (anchorId, label) => {
    document.body.innerHTML += `<div id="${anchorId}"></div>`;
    const scrollSpy = vi.fn();
    document.getElementById(anchorId)!.scrollIntoView = scrollSpy;

    render(<LookAgainCard items={makeItems()} ready anchors={anchors} />);
    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(scrollSpy).toHaveBeenCalled();
  });

  it('dispatches openChapterTitleCreator when the undone title row is tapped', () => {
    const listener = vi.fn();
    window.addEventListener('openChapterTitleCreator', listener);

    render(<LookAgainCard items={makeItems()} ready anchors={anchors} />);
    fireEvent.click(screen.getByRole('button', { name: 'Say this chapter in your own words — give it a title' }));

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('openChapterTitleCreator', listener);
  });

  it('does not react to a tap on an already-done row', () => {
    const listener = vi.fn();
    window.addEventListener('openChapterTitleCreator', listener);

    render(<LookAgainCard items={makeItems({ title: true })} ready anchors={anchors} />);
    fireEvent.click(screen.getByText('Say this chapter in your own words — give it a title'));

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('openChapterTitleCreator', listener);
  });

  it('shows the tools-off footer nudge only when every shown item is done and inductive tools are off', () => {
    const { rerender } = render(<LookAgainCard items={makeItems()} ready anchors={anchors} />);
    expect(screen.queryByText(/full toolkit/)).toBeNull();

    rerender(
      <LookAgainCard
        items={makeItems({ repetition: true, person: true, hinge: true, title: true })}
        ready
        anchors={anchors}
      />
    );
    expect(screen.getByText(/full toolkit/)).toBeTruthy();
  });

  it('the footer nudge button opens Settings on the Bible tab', () => {
    render(
      <LookAgainCard
        items={makeItems({ repetition: true, person: true, hinge: true, title: true })}
        ready
        anchors={anchors}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Turn on inductive tools' }));

    expect(usePanelStore.getState().activePanel).toBe('settings');
    expect(usePanelStore.getState().settingsInitialTab).toBe('bible');
  });

  it('hides the footer nudge when all done but inductive tools are on', () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true });
    render(
      <LookAgainCard
        items={makeItems({ repetition: true, person: true, hinge: true, title: true })}
        ready
        anchors={anchors}
      />
    );
    expect(screen.queryByText(/full toolkit/)).toBeNull();
  });

  describe('person/place follow-up (refinement A)', () => {
    function makeItemsWithFollowUp(run: LookAgainFollowUp['run']): LookAgainItem[] {
      return makeItems({ person: true }).map(item =>
        item.id === 'person'
          ? {
              ...item,
              followUp: {
                text: `Marked ‘Pharaoh’? Highlight every mention in this chapter.`,
                actionLabel: 'Highlight every mention',
                word: 'Pharaoh',
                run,
              },
            }
          : item
      );
    }

    const fakePreset = {} as MarkingPreset;

    it('renders the follow-up text and button under the done row', () => {
      const run = vi.fn().mockResolvedValue(fakePreset);
      render(<LookAgainCard items={makeItemsWithFollowUp(run)} ready anchors={anchors} />);

      expect(screen.getByText(`Marked ‘Pharaoh’? Highlight every mention in this chapter.`)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Highlight every mention of Pharaoh' })).toBeTruthy();
    });

    it('calls run and disables the button while pending', async () => {
      let resolveRun: (preset: MarkingPreset) => void = () => {};
      const run = vi.fn(() => new Promise<MarkingPreset>(res => { resolveRun = res; }));
      render(<LookAgainCard items={makeItemsWithFollowUp(run)} ready anchors={anchors} />);

      const button = screen.getByRole('button', { name: 'Highlight every mention of Pharaoh' }) as HTMLButtonElement;
      fireEvent.click(button);

      expect(run).toHaveBeenCalledTimes(1);
      expect(button.disabled).toBe(true);

      resolveRun(fakePreset);
      await Promise.resolve();
    });

    it('shows an error toast when run fails', async () => {
      const run = vi.fn().mockRejectedValue(new Error('boom'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<LookAgainCard items={makeItemsWithFollowUp(run)} ready anchors={anchors} />);

      fireEvent.click(screen.getByRole('button', { name: 'Highlight every mention of Pharaoh' }));
      await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
      expect(useToastStore.getState().toasts[0]).toMatchObject({ variant: 'error' });

      consoleError.mockRestore();
    });

    it('renders no follow-up row when the item has none', () => {
      render(<LookAgainCard items={makeItems({ person: true })} ready anchors={anchors} />);
      expect(screen.queryByRole('button', { name: 'Highlight every mention' })).toBeNull();
    });

    it('gives the follow-up button a distinguishing accessible name (item 9)', () => {
      const run = vi.fn().mockResolvedValue(fakePreset);
      render(<LookAgainCard items={makeItemsWithFollowUp(run)} ready anchors={anchors} />);
      expect(screen.getByRole('button', { name: 'Highlight every mention of Pharaoh' })).toBeTruthy();
    });

    it('tracks discovery_chip_tapped with the upsell feature on click (item 8)', () => {
      const run = vi.fn().mockResolvedValue(fakePreset);
      render(<LookAgainCard items={makeItemsWithFollowUp(run)} ready anchors={anchors} />);

      fireEvent.click(screen.getByRole('button', { name: 'Highlight every mention of Pharaoh' }));

      expect(trackMock).toHaveBeenCalledWith('discovery_chip_tapped', { feature: 'upsell' });
    });

    it('shows a success toast once run() resolves (item 15)', async () => {
      const run = vi.fn().mockResolvedValue(fakePreset);
      render(<LookAgainCard items={makeItemsWithFollowUp(run)} ready anchors={anchors} />);

      fireEvent.click(screen.getByRole('button', { name: 'Highlight every mention of Pharaoh' }));

      await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
      expect(useToastStore.getState().toasts[0]).toMatchObject({
        variant: 'success',
        message: 'Highlighted every mention in this chapter.',
      });
    });
  });

  describe('heading item static row (refinement C)', () => {
    const headingLabel = 'Where does this chapter shift? Add a section heading where it turns';

    function makeItemsWithHeading(done: boolean): LookAgainItem[] {
      return [...makeItems(), { id: 'heading', label: headingLabel, done }];
    }

    it('renders the undone heading item as a static row, not a button, with the how-to line matching the real control', () => {
      render(<LookAgainCard items={makeItemsWithHeading(false)} ready anchors={anchors} />);

      expect(screen.queryByRole('button', { name: headingLabel })).toBeNull();
      expect(screen.getByText(headingLabel)).toBeTruthy();
      // Matches VerseNumberMenu's actual button copy — "Add Section Heading".
      expect(screen.getByText('Tap a verse number, then Add Section Heading.')).toBeTruthy();
    });

    it('gives the undone heading row a visually-hidden "not done" for screen-reader parity with done rows (item 13)', () => {
      render(<LookAgainCard items={makeItemsWithHeading(false)} ready anchors={anchors} />);
      const row = screen.getByText(headingLabel).closest('li');
      expect(row?.textContent).toContain('(not done)');
    });

    it('does not scroll or dispatch anything when the static heading row is clicked', () => {
      const listener = vi.fn();
      window.addEventListener('openChapterTitleCreator', listener);

      render(<LookAgainCard items={makeItemsWithHeading(false)} ready anchors={anchors} />);
      fireEvent.click(screen.getByText(headingLabel));

      expect(listener).not.toHaveBeenCalled();
      window.removeEventListener('openChapterTitleCreator', listener);
    });

    it('renders the done heading item as static checked content', () => {
      render(<LookAgainCard items={makeItemsWithHeading(true)} ready anchors={anchors} />);

      expect(screen.queryByRole('button', { name: headingLabel })).toBeNull();
      const row = screen.getByText(headingLabel).closest('li');
      expect(row?.textContent).toContain('✓');
      expect(row?.textContent).toContain('(done)');
    });
  });
});
