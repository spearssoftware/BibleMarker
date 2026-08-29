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
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LookAgainCard } from '../LookAgainCard';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { usePanelStore } from '@/stores/panelStore';
import type { LookAgainItem } from '@/hooks/useLookAgain';

const anchors = { repetition: 'anchor-repetition', hinge: 'anchor-hinge', peoplePlaces: 'anchor-people-places' };

function makeItems(overrides?: Partial<Record<LookAgainItem['id'], boolean>>): LookAgainItem[] {
  return [
    { id: 'repetition', label: 'One word repeats 11× — find and mark it', done: overrides?.repetition ?? false },
    { id: 'person', label: '1 person is named — mark one where a person appears', done: overrides?.person ?? false },
    { id: 'hinge', label: '1 hinge holds this chapter together — mark one', done: overrides?.hinge ?? false },
    { id: 'title', label: 'Say this chapter in your own words — give it a title', done: overrides?.title ?? false },
  ];
}

describe('LookAgainCard', () => {
  beforeEach(() => {
    usePreferencesStore.setState({ inductiveToolsEnabled: false, telemetryEnabled: false });
    usePanelStore.setState({ activePanel: null });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('renders nothing for an empty item list', () => {
    const { container } = render(<LookAgainCard items={[]} ready anchors={anchors} />);
    expect(container.firstChild).toBeNull();
  });

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

  it('scrolls to the repetition anchor when the undone repetition row is tapped', () => {
    document.body.innerHTML += '<div id="anchor-repetition"></div>';
    const anchorEl = document.getElementById('anchor-repetition')!;
    const scrollSpy = vi.fn();
    anchorEl.scrollIntoView = scrollSpy;

    render(<LookAgainCard items={makeItems()} ready anchors={anchors} />);
    fireEvent.click(screen.getByRole('button', { name: 'One word repeats 11× — find and mark it' }));

    expect(scrollSpy).toHaveBeenCalled();
  });

  it('scrolls to the hinge anchor when the undone hinge row is tapped', () => {
    document.body.innerHTML += '<div id="anchor-hinge"></div>';
    const scrollSpy = vi.fn();
    document.getElementById('anchor-hinge')!.scrollIntoView = scrollSpy;

    render(<LookAgainCard items={makeItems()} ready anchors={anchors} />);
    fireEvent.click(screen.getByRole('button', { name: '1 hinge holds this chapter together — mark one' }));

    expect(scrollSpy).toHaveBeenCalled();
  });

  it('scrolls to the people-places anchor when the undone person row is tapped', () => {
    document.body.innerHTML += '<div id="anchor-people-places"></div>';
    const scrollSpy = vi.fn();
    document.getElementById('anchor-people-places')!.scrollIntoView = scrollSpy;

    render(<LookAgainCard items={makeItems()} ready anchors={anchors} />);
    fireEvent.click(screen.getByRole('button', { name: '1 person is named — mark one where a person appears' }));

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
});
