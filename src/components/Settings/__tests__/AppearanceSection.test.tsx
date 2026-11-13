/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { AppearanceSection } from '../AppearanceSection';
import { useAppModeStore, type AppMode } from '@/stores/appModeStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { changeTheme } from '@/lib/textSettings';

vi.mock('@/lib/database', () => ({
  updatePreferences: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/textSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/textSettings')>()),
  changeTheme: vi.fn(),
  changeHighContrast: vi.fn(),
}));

afterEach(cleanup);

const STUDY_ONLY = ['Symbol Position', 'Multi-Word Keyword Marking', 'Symbol Visibility', 'Symbol Size'];
const EVERY_MODE = ['Theme', 'Accessibility'];
const MOVED_TO_TEXT_OPTIONS = ['Font Size', 'Scripture Font'];

function renderIn(mode: AppMode) {
  useAppModeStore.setState({ mode });
  return render(<AppearanceSection />);
}

describe('AppearanceSection modes', () => {
  it('shows the symbol and marking settings in Study', () => {
    renderIn('study');

    for (const name of [...STUDY_ONLY, ...EVERY_MODE]) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
  });

  it.each<AppMode>(['read', 'discover', 'study'])('no longer has Font Size or Scripture Font in %s', mode => {
    renderIn(mode);

    for (const name of MOVED_TO_TEXT_OPTIONS) {
      expect(screen.queryByRole('heading', { name })).toBeNull();
    }
  });

  it.each<AppMode>(['read', 'discover'])('hides the Study-only settings in %s', mode => {
    const { container } = renderIn(mode);

    for (const name of STUDY_ONLY) {
      expect(screen.queryByRole('heading', { name })).toBeNull();
    }
    for (const name of EVERY_MODE) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
    expect(container.querySelectorAll('.border-t')).toHaveLength(EVERY_MODE.length - 1);
    expect(container.querySelector('.space-y-0')?.firstElementChild?.classList.contains('border-t')).toBe(false);
  });
});

describe('AppearanceSection theme', () => {
  it('shows the theme from the store, including a change made elsewhere', () => {
    useAnnotationStore.setState({ theme: 'dark' });
    renderIn('read');
    const selected = () => screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked');
    expect(selected()).toBe('false');

    act(() => useAnnotationStore.setState({ theme: 'light' }));

    expect(selected()).toBe('true');
  });

  it('changes the theme through the shared handler', () => {
    useAnnotationStore.setState({ theme: 'dark' });
    renderIn('read');

    fireEvent.click(screen.getByRole('radio', { name: 'Auto' }));

    expect(changeTheme).toHaveBeenCalledWith('auto');
  });
});
