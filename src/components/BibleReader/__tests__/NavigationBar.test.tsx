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
import { useAppModeStore } from '@/stores/appModeStore';
import { usePanelStore } from '@/stores/panelStore';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
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
vi.mock('../TextOptionsPanel', () => ({ TextOptionsPanel: () => <div data-testid="text-options-panel" /> }));
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
  useAppModeStore.setState({ mode: 'read' });
  usePanelStore.setState({ orientation: 'horizontal', activePanel: null });
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

  it('marks the overflow button and offers Settings in its menu', async () => {
    await act(async () => { render(<NavigationBar />); });
    const more = screen.getByRole('button', { name: 'More actions' });
    expect(more.hasAttribute('data-nav-more')).toBe(true);
    fireEvent.click(more);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(usePanelStore.getState().activePanel).toBe('settings');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('NavigationBar text options', () => {
  it('has an "Aa" button and no menu item on a wide layout', async () => {
    await act(async () => { render(<NavigationBar />); });
    const button = screen.getByRole('button', { name: 'Text options' });
    expect(button.textContent).toBe('Aa');
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Text options' })).toBeNull();
  });

  it('opens the panel from the "Aa" button and toggles it closed', async () => {
    await act(async () => { render(<NavigationBar />); });
    const button = screen.getByRole('button', { name: 'Text options' });
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Text options' })).toBeTruthy();
    expect(screen.getByTestId('text-options-panel')).toBeTruthy();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(button);
    expect(screen.queryByRole('dialog', { name: 'Text options' })).toBeNull();
  });

  it('has no button and lists the menu item just above Settings on a narrow layout', async () => {
    usePanelStore.setState({ orientation: 'vertical' });
    await act(async () => { render(<NavigationBar />); });
    expect(screen.queryByRole('button', { name: 'Text options' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const items = screen.getAllByRole('menuitem').map(item => item.textContent?.replace('Aa', '').trim());
    const at = items.indexOf('Text options');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(items[at + 1]).toBe('Settings');
  });

  it('opens the panel from the menu item and closes the menu', async () => {
    usePanelStore.setState({ orientation: 'vertical' });
    await act(async () => { render(<NavigationBar />); });
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Text options/ }));
    expect(screen.queryByRole('menu', { name: 'More actions' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Text options' })).toBeTruthy();
  });

  it('closes the panel when another top-bar menu opens', async () => {
    await act(async () => { render(<NavigationBar />); });
    fireEvent.click(screen.getByRole('button', { name: 'Text options' }));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('dialog', { name: 'Text options' })).toBeNull();
    expect(screen.getByRole('menu', { name: 'More actions' })).toBeTruthy();
  });
});
