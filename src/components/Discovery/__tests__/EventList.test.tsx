/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EventList } from '../EventList';
import { usePanelStore } from '@/stores/panelStore';
import { track } from '@/lib/telemetry';
import type { ChapterEvent } from '@/types';

vi.mock('@/lib/database');
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const navigateToVerse = vi.fn();
vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: (selector: (s: { navigateToVerse: typeof navigateToVerse }) => unknown) => selector({ navigateToVerse }),
}));

function event(n: number, overrides: Partial<ChapterEvent> = {}): ChapterEvent {
  return {
    slug: `event-${n}`,
    title: `Event ${n}`,
    startYearDisplay: '1921 BC',
    sortKey: n,
    participants: [{ slug: 'abram', name: 'Abram' }, { slug: 'sarai', name: 'Sarai' }],
    verses: [1, 4],
    ...overrides,
  };
}

const manyEvents = Array.from({ length: 7 }, (_, i) => event(i + 1));

describe('EventList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePanelStore.setState({ activePanel: null });
  });
  afterEach(cleanup);

  it('renders nothing when there are no events', () => {
    const { container } = render(<EventList events={[]} book="Gen" chapter={12} translationId="nasb" />);
    expect(container.textContent).toBe('');
    expect(track).not.toHaveBeenCalled();
  });

  it('keeps the given order and shows about <year> per row', () => {
    render(<EventList events={[event(2), event(1)]} book="Gen" chapter={12} translationId="nasb" />);
    const rows = screen.getAllByRole('button', { expanded: false });
    expect(rows[0].textContent).toContain('Event 2');
    expect(rows[0].textContent).toContain('about 1921 BC');
  });

  it('caps at 5 rows with +N more that reveals the rest', () => {
    render(<EventList events={manyEvents} book="Gen" chapter={12} translationId="nasb" />);
    expect(screen.queryByText('Event 6')).toBeNull();
    fireEvent.click(screen.getByText('+2 more'));
    expect(screen.getByText('Event 7')).toBeTruthy();
    expect(screen.queryByText('+2 more')).toBeNull();
  });

  it('shows no years anywhere in Genesis 1-11', () => {
    render(<EventList events={[event(1)]} book="Gen" chapter={6} translationId="nasb" />);
    fireEvent.click(screen.getByText('Event 1'));
    expect(screen.queryByText(/about 1921 BC/)).toBeNull();
  });

  it('expands inline with year, participants and tappable verses, and fires tapped telemetry under one dedupe key', () => {
    render(<EventList events={[event(1)]} book="Gen" chapter={12} translationId="nasb" />);
    const row = screen.getByRole('button', { name: /Event 1/ });
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('With Abram, Sarai')).toBeTruthy();
    fireEvent.click(screen.getByText('4'));
    expect(navigateToVerse).toHaveBeenCalledWith('Gen', 12, 4, true);
    fireEvent.click(row);
    fireEvent.click(row);
    const tapped = vi.mocked(track).mock.calls.filter(c => c[0] === 'discovery_chip_tapped');
    expect(tapped.length).toBeGreaterThan(0);
    for (const call of tapped) {
      expect(call[1]).toEqual({
        feature: 'setting_timeline',
        dedupeKey: 'discovery_chip_tapped:setting_timeline:Gen:12:nasb',
      });
    }
  });

  it('More in Reference opens the event detail', () => {
    render(<EventList events={[event(1)]} book="Gen" chapter={12} translationId="nasb" />);
    fireEvent.click(screen.getByText('Event 1'));
    fireEvent.click(screen.getByText('More in Reference'));
    const state = usePanelStore.getState();
    expect(state.activePanel).toBe('reference');
    expect(state.referenceEntitySlug).toBe('event-1');
    expect(state.referenceEntityType).toBe('event');
  });
});
