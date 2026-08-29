/**
 * @vitest-environment jsdom
 *
 * LookAgainCard renders `useLookAgain`'s items as read-only checkbox rows,
 * scrolls to the matching anchor card on an undone-row tap (title dispatches
 * `openChapterTitleCreator` instead), and shows the tools-off footer nudge
 * only when everything shown is done.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LookAgainCard } from '../LookAgainCard';
import { usePreferencesStore } from '@/stores/preferencesStore';
import type { LookAgainItem } from '@/hooks/useLookAgain';

const anchors = { repetition: 'anchor-repetition', hinge: 'anchor-hinge', peoplePlaces: 'anchor-people-places' };

function makeItems(overrides?: Partial<Record<LookAgainItem['id'], boolean>>): LookAgainItem[] {
  return [
    { id: 'repetition', label: 'One word repeats 11× — find and mark it', done: overrides?.repetition ?? false },
    { id: 'person', label: '1 person are named — mark one where a person appears', done: overrides?.person ?? false },
    { id: 'hinge', label: '1 hinge hold this chapter together — mark one', done: overrides?.hinge ?? false },
    { id: 'title', label: 'Say this chapter in your own words — give it a title', done: overrides?.title ?? false },
  ];
}

describe('LookAgainCard', () => {
  beforeEach(() => {
    usePreferencesStore.setState({ inductiveToolsEnabled: false, telemetryEnabled: false });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('renders nothing for an empty item list', () => {
    const { container } = render(<LookAgainCard items={[]} anchors={anchors} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders each row with its label, unchecked for undone items', () => {
    render(<LookAgainCard items={makeItems()} anchors={anchors} />);
    for (const item of makeItems()) {
      const row = screen.getByText(item.label).closest('[role="checkbox"]');
      expect(row).not.toBeNull();
      expect(row?.getAttribute('aria-checked')).toBe('false');
    }
  });

  it('mutes and checks a done row', () => {
    render(<LookAgainCard items={makeItems({ title: true })} anchors={anchors} />);
    const row = screen.getByText('Say this chapter in your own words — give it a title').closest('[role="checkbox"]');
    expect(row?.getAttribute('aria-checked')).toBe('true');
    expect(row?.textContent).toContain('✓');
  });

  it('scrolls to the repetition anchor when the undone repetition row is tapped', () => {
    document.body.innerHTML += '<div id="anchor-repetition"></div>';
    const anchorEl = document.getElementById('anchor-repetition')!;
    const scrollSpy = vi.fn();
    anchorEl.scrollIntoView = scrollSpy;

    render(<LookAgainCard items={makeItems()} anchors={anchors} />);
    fireEvent.click(screen.getByText('One word repeats 11× — find and mark it'));

    expect(scrollSpy).toHaveBeenCalled();
  });

  it('scrolls to the hinge anchor when the undone hinge row is tapped', () => {
    document.body.innerHTML += '<div id="anchor-hinge"></div>';
    const scrollSpy = vi.fn();
    document.getElementById('anchor-hinge')!.scrollIntoView = scrollSpy;

    render(<LookAgainCard items={makeItems()} anchors={anchors} />);
    fireEvent.click(screen.getByText('1 hinge hold this chapter together — mark one'));

    expect(scrollSpy).toHaveBeenCalled();
  });

  it('scrolls to the people-places anchor when the undone person row is tapped', () => {
    document.body.innerHTML += '<div id="anchor-people-places"></div>';
    const scrollSpy = vi.fn();
    document.getElementById('anchor-people-places')!.scrollIntoView = scrollSpy;

    render(<LookAgainCard items={makeItems()} anchors={anchors} />);
    fireEvent.click(screen.getByText('1 person are named — mark one where a person appears'));

    expect(scrollSpy).toHaveBeenCalled();
  });

  it('dispatches openChapterTitleCreator when the undone title row is tapped', () => {
    const listener = vi.fn();
    window.addEventListener('openChapterTitleCreator', listener);

    render(<LookAgainCard items={makeItems()} anchors={anchors} />);
    fireEvent.click(screen.getByText('Say this chapter in your own words — give it a title'));

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('openChapterTitleCreator', listener);
  });

  it('does not react to a tap on an already-done row', () => {
    const listener = vi.fn();
    window.addEventListener('openChapterTitleCreator', listener);

    render(<LookAgainCard items={makeItems({ title: true })} anchors={anchors} />);
    fireEvent.click(screen.getByText('Say this chapter in your own words — give it a title'));

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('openChapterTitleCreator', listener);
  });

  it('shows the tools-off footer nudge only when every shown item is done and inductive tools are off', () => {
    const { rerender } = render(<LookAgainCard items={makeItems()} anchors={anchors} />);
    expect(screen.queryByText(/full toolkit/)).toBeNull();

    rerender(
      <LookAgainCard
        items={makeItems({ repetition: true, person: true, hinge: true, title: true })}
        anchors={anchors}
      />
    );
    expect(screen.getByText(/full toolkit/)).toBeTruthy();
  });

  it('hides the footer nudge when all done but inductive tools are on', () => {
    usePreferencesStore.setState({ inductiveToolsEnabled: true });
    render(
      <LookAgainCard
        items={makeItems({ repetition: true, person: true, hinge: true, title: true })}
        anchors={anchors}
      />
    );
    expect(screen.queryByText(/full toolkit/)).toBeNull();
  });
});
