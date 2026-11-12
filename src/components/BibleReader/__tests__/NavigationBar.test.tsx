/**
 * @vitest-environment jsdom
 *
 * NavigationBar shows the verse published by useReadingPositionStore and
 * pauses verse tracking while the unified picker is open.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { NavigationBar } from '../NavigationBar';
import { useReadingPositionStore } from '@/stores/readingPositionStore';
import { useBibleStore } from '@/stores/bibleStore';

vi.mock('@/lib/bible-api', () => ({
  getAllTranslations: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/database', () => ({
  getPreferences: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/stores/multiTranslationStore', () => {
  const state = {
    activeView: null,
    chaptersByTranslation: {},
    loadActiveView: vi.fn(),
    addTranslation: vi.fn(),
    removeTranslation: vi.fn(),
  };
  const useMultiTranslationStore = (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state;
  return { useMultiTranslationStore };
});
vi.mock('@/hooks/useSyncStatus', () => ({
  useSyncStatus: () => ({ status: null, isSyncing: false, handleSync: vi.fn() }),
  getStatusColorClass: () => '',
}));
vi.mock('@/lib/sync', () => ({
  getSyncStatusIcon: () => '',
  getSyncStatusMessage: () => '',
}));
vi.mock('@/components/Search', () => ({ Search: () => null }));
vi.mock('../ExportPopover', () => ({ ExportPopover: () => null }));
vi.mock('@/components/shared/SyncStatusIndicator', () => ({ SyncDetailsPanel: () => null }));
const unifiedPickerProps = vi.hoisted(() => ({ current: null as { currentVerse: number } | null }));
vi.mock('../pickers', () => ({
  TranslationPicker: () => <div data-testid="translation-picker" />,
  UnifiedPicker: (props: { currentVerse: number }) => {
    unifiedPickerProps.current = props;
    return <div data-testid="unified-picker" />;
  },
}));

const locationButton = () => screen.getByRole('button', { name: /Current location/ });

beforeEach(() => {
  useBibleStore.setState({ currentBook: 'JHN', currentChapter: 3 });
  useReadingPositionStore.setState({ currentVerse: null, verseTrackingPaused: false });
});

afterEach(cleanup);

describe('NavigationBar', () => {
  it('shows verse 1 when no verse is tracked', async () => {
    await act(async () => { render(<NavigationBar />); });
    expect(locationButton().getAttribute('aria-label')).toContain('3:1');
  });

  it('shows the verse from the reading position store', async () => {
    await act(async () => { render(<NavigationBar />); });
    act(() => { useReadingPositionStore.setState({ currentVerse: 16 }); });
    expect(locationButton().getAttribute('aria-label')).toContain('3:16');
  });

  it('pauses verse tracking while the unified picker is open', async () => {
    await act(async () => { render(<NavigationBar />); });
    fireEvent.click(locationButton());
    expect(screen.getByTestId('unified-picker')).toBeTruthy();
    expect(useReadingPositionStore.getState().verseTrackingPaused).toBe(true);
    act(() => { window.dispatchEvent(new CustomEvent('closePickers')); });
    expect(screen.queryByTestId('unified-picker')).toBeNull();
    expect(useReadingPositionStore.getState().verseTrackingPaused).toBe(false);
  });

  it('passes the tracked verse to the unified picker, defaulting to 1', async () => {
    useReadingPositionStore.setState({ currentVerse: 16 });
    await act(async () => { render(<NavigationBar />); });
    fireEvent.click(locationButton());
    expect(unifiedPickerProps.current?.currentVerse).toBe(16);
    act(() => { window.dispatchEvent(new CustomEvent('closePickers')); });
    act(() => { useReadingPositionStore.setState({ currentVerse: null }); });
    fireEvent.click(locationButton());
    expect(unifiedPickerProps.current?.currentVerse).toBe(1);
  });

  it('pauses verse tracking while the translation picker is open', async () => {
    await act(async () => { render(<NavigationBar />); });
    fireEvent.click(screen.getByRole('button', { name: 'Select translation' }));
    expect(screen.getByTestId('translation-picker')).toBeTruthy();
    expect(useReadingPositionStore.getState().verseTrackingPaused).toBe(true);
    act(() => { window.dispatchEvent(new CustomEvent('closePickers')); });
    expect(useReadingPositionStore.getState().verseTrackingPaused).toBe(false);
  });

  it('resets the pause when unmounted while a picker is open', async () => {
    const view = render(<NavigationBar />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(locationButton());
    expect(useReadingPositionStore.getState().verseTrackingPaused).toBe(true);
    view.unmount();
    expect(useReadingPositionStore.getState().verseTrackingPaused).toBe(false);
  });
});
