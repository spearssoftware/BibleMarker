/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppearanceSection } from '../AppearanceSection';
import { useAppModeStore, type AppMode } from '@/stores/appModeStore';

vi.mock('@/lib/database', () => ({
  updatePreferences: vi.fn().mockResolvedValue(undefined),
}));

afterEach(cleanup);

const STUDY_ONLY = ['Symbol Position', 'Multi-Word Keyword Marking', 'Symbol Visibility', 'Symbol Size'];
const EVERY_MODE = ['Font Size', 'Scripture Font', 'Theme', 'Accessibility'];

function renderIn(mode: AppMode) {
  useAppModeStore.setState({ mode });
  return render(
    <AppearanceSection theme="dark" highContrast={false} onThemeChange={vi.fn()} onHighContrastChange={vi.fn()} />
  );
}

describe('AppearanceSection modes', () => {
  it('shows the symbol and marking settings in Study', () => {
    renderIn('study');

    for (const name of [...STUDY_ONLY, ...EVERY_MODE]) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
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
  });
});
