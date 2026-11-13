/**
 * @vitest-environment jsdom
 *
 * A tap on plain text reveals the hidden top bar; a tap on a marked word or
 * another interactive element does not. No translations resolve, so the
 * reader renders its empty scroller; the tapped nodes are added by hand,
 * inside the React tree, where the root click handler still sees them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { MultiTranslationView } from '../MultiTranslationView';
import { useChromeStore } from '@/stores/chromeStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { useAppModeStore } from '@/stores/appModeStore';
import { useBibleStore } from '@/stores/bibleStore';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/bible-api', () => ({
  getAllTranslations: vi.fn().mockResolvedValue([]),
  fetchChapter: vi.fn(),
}));
vi.mock('@/lib/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/database')>()),
  getChapterAnnotations: vi.fn().mockResolvedValue([]),
  getChapterHeadings: vi.fn().mockResolvedValue([]),
  getChapterTitle: vi.fn().mockResolvedValue(null),
  getChapterNotes: vi.fn().mockResolvedValue([]),
}));

// Mounting reveals the bar (the reader resets it on mount), so hide it afterwards.
async function setup() {
  const view = render(<MultiTranslationView />);
  await act(async () => { await Promise.resolve(); });
  act(() => { useChromeStore.setState({ scrollHidden: true }); });
  const scroller = view.container.querySelector('.custom-scrollbar') as HTMLElement;
  return { scroller };
}

function tap(parent: HTMLElement, html: string) {
  const host = document.createElement('div');
  host.innerHTML = html;
  const target = host.firstElementChild as HTMLElement;
  parent.appendChild(target);
  fireEvent.click(target.querySelector('#t') ?? target);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  useAppModeStore.setState({ mode: 'read' });
  useBibleStore.setState({ currentBook: 'JHN', currentChapter: 3 });
  useMultiTranslationStore.setState({
    activeView: { id: 'v', name: 'v', translationIds: ['sword-KJV'], createdAt: new Date(), updatedAt: new Date() } as never,
    loadActiveView: vi.fn(),
  });
  useChromeStore.setState({ scrollHidden: false, topInset: 0, holds: {} });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MultiTranslationView tap to reveal', () => {
  it('reveals on a tap on plain text', async () => {
    const { scroller } = await setup();
    tap(scroller, '<p><span id="t">In the beginning</span></p>');
    expect(useChromeStore.getState().scrollHidden).toBe(false);
  });

  it('does not reveal on a tap on a marked word', async () => {
    const { scroller } = await setup();
    tap(scroller, '<p><span data-annotation-ids="a1"><span id="t">God</span></span></p>');
    expect(useChromeStore.getState().scrollHidden).toBe(true);
  });

  it('does not reveal on a tap on a verse number', async () => {
    const { scroller } = await setup();
    tap(scroller, '<span class="verse-number"><b id="t">3</b></span>');
    expect(useChromeStore.getState().scrollHidden).toBe(true);
  });

  it('does not reveal when a text selection is active', async () => {
    const { scroller } = await setup();
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false, toString: () => 'word' } as Selection);
    tap(scroller, '<p><span id="t">In the beginning</span></p>');
    expect(useChromeStore.getState().scrollHidden).toBe(true);
  });
});
