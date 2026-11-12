/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppModeStore, type AppMode } from '@/stores/appModeStore';
import { useFeatureFlagsStore } from '@/stores/featureFlagsStore';
import { FLAG_KEYS, DEFAULT_FLAGS } from '@/lib/feature-flags';
import type { SearchResult } from '@/lib/search';

const searchAllMock = vi.fn<(...args: unknown[]) => Promise<SearchResult[]>>();
vi.mock('@/lib/search', () => ({
  searchAll: (...args: unknown[]) => searchAllMock(...args),
}));

vi.mock('@/stores/bibleStore', () => ({
  useBibleStore: () => ({ currentModuleId: 'sword-nasb2020', currentBook: 'John', currentChapter: 3 }),
}));

vi.mock('@/hooks/useModal', () => ({
  useModal: () => ({ handleBackdropClick: vi.fn() }),
}));

let discoveryEnabled = true;
vi.mock('@/lib/discovery-config', () => ({
  useDiscoveryEnabled: () => discoveryEnabled,
}));

import { Search } from '../Search';

const KEYWORD_RESULT: SearchResult = {
  type: 'keyword',
  book: 'John',
  chapter: 3,
  verse: 16,
  text: 'love',
  keywordWord: 'love',
};

const VERSE_RESULT: SearchResult = {
  type: 'verse',
  book: 'John',
  chapter: 3,
  verse: 16,
  text: 'For God so loved the world',
};

function setMode(mode: AppMode) {
  useAppModeStore.setState({ mode });
}

async function typeQuery() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Search input'), 'love');
  return user;
}

describe('Search', () => {
  beforeEach(() => {
    discoveryEnabled = true;
    useFeatureFlagsStore.setState({ flags: { ...DEFAULT_FLAGS, [FLAG_KEYS.discoveryEnabled]: true } });
    searchAllMock.mockReset();
    searchAllMock.mockResolvedValue([VERSE_RESULT, KEYWORD_RESULT]);
  });

  afterEach(() => {
    cleanup();
  });

  it('offers the Keywords scope and keyword results in Study', async () => {
    setMode('study');
    render(<Search onClose={vi.fn()} onNavigate={vi.fn()} />);

    expect(screen.getByLabelText('Search in keywords')).toBeTruthy();
    await typeQuery();

    await waitFor(() => expect(screen.getByLabelText('love keyword')).toBeTruthy());
  });

  it.each(['read', 'discover'] as const)('hides the Keywords scope and keyword results in %s', async mode => {
    setMode(mode);
    render(<Search onClose={vi.fn()} onNavigate={vi.fn()} />);

    expect(screen.queryByLabelText('Search in keywords')).toBeNull();
    await typeQuery();

    await waitFor(() => expect(screen.getByLabelText(/John 3:16 - verse/)).toBeTruthy());
    expect(screen.queryByLabelText('love keyword')).toBeNull();
  });

  it('still navigates to a Bible-text result in Read', async () => {
    setMode('read');
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    render(<Search onClose={onClose} onNavigate={onNavigate} />);
    const user = await typeQuery();

    await user.click(await screen.findByLabelText(/John 3:16 - verse/));

    expect(onNavigate).toHaveBeenCalledWith('John', 3, 16);
    expect(onClose).toHaveBeenCalled();
  });
});
