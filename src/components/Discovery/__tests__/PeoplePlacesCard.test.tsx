/**
 * @vitest-environment jsdom
 *
 * PeoplePlacesCard — count teaser and its jump into Study Tools.
 *
 * The jump is available in both modes: the reference panel is reachable from
 * here whether or not the inductive toolkit is switched on.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PeoplePlacesCard } from '../PeoplePlacesCard';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { usePanelStore } from '@/stores/panelStore';
import type { ChapterEntities } from '@/types';

vi.mock('@/lib/database');
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

function entities(overrides: Partial<ChapterEntities> = {}): ChapterEntities {
  return { book: 'John', chapter: 1, people: ['jesus', 'john-the-baptist'], places: ['bethany'], events: [], topics: [], ...overrides };
}

describe('PeoplePlacesCard', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    usePanelStore.setState({ activePanel: null });
    usePreferencesStore.setState({ inductiveToolsEnabled: false, isHydrated: true });
  });

  it('renders counts with singular and plural forms', () => {
    render(<PeoplePlacesCard entities={entities({ people: ['jesus'] })} isLoading={false} error={null} />);
    expect(screen.getByText('1 person · 1 place')).toBeTruthy();
  });

  it('omits a zero count from the title', () => {
    render(<PeoplePlacesCard entities={entities({ places: [] })} isLoading={false} error={null} />);
    expect(screen.getByText('2 people')).toBeTruthy();
  });

  it('renders nothing while loading, on error, or with no entities', () => {
    const { container: loading } = render(<PeoplePlacesCard entities={null} isLoading={true} error={null} />);
    expect(loading.textContent).toBe('');
    cleanup();
    const { container: errored } = render(<PeoplePlacesCard entities={entities()} isLoading={false} error="nope" />);
    expect(errored.textContent).toBe('');
    cleanup();
    const { container: empty } = render(<PeoplePlacesCard entities={entities({ people: [], places: [] })} isLoading={false} error={null} />);
    expect(empty.textContent).toBe('');
  });

  // The component doesn't read the inductive-tools preference at all — the
  // jump into Study Tools works the same regardless of the toggle.
  it('opens Study Tools on the Chapter tab regardless of the inductive-tools toggle', () => {
    render(<PeoplePlacesCard entities={entities()} isLoading={false} error={null} />);

    fireEvent.click(screen.getByText('See who and where'));

    expect(usePanelStore.getState().activePanel).toBe('reference');
    expect(usePanelStore.getState().referenceInitialTab).toBe('chapter');
  });
});
