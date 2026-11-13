/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TextOptionsPanel } from '../TextOptionsPanel';
import { useAppModeStore, type AppMode } from '@/stores/appModeStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { changeFontSize, changeScriptureFont, changeShowVerseNumbers, changeTheme } from '@/lib/textSettings';

vi.mock('@/lib/textSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/textSettings')>()),
  changeFontSize: vi.fn(),
  changeScriptureFont: vi.fn(),
  changeTheme: vi.fn(),
  changeShowVerseNumbers: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useAnnotationStore.setState({
    fontSize: 'base',
    scriptureFont: 'crimson-pro',
    theme: 'auto',
    showVerseNumbers: true,
  });
});

function renderIn(mode: AppMode) {
  useAppModeStore.setState({ mode });
  return render(<TextOptionsPanel />);
}

describe('TextOptionsPanel', () => {
  it.each<AppMode>(['read', 'discover', 'study'])('shows font size, font and theme in %s', mode => {
    renderIn(mode);

    for (const name of ['Font Size', 'Scripture Font', 'Theme']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
  });

  it('offers the verse numbers toggle only in Read', () => {
    renderIn('read');
    expect(screen.getByRole('switch', { name: 'Verse numbers' })).toBeTruthy();
    cleanup();

    for (const mode of ['discover', 'study'] as const) {
      renderIn(mode);
      expect(screen.queryByText('Verse numbers')).toBeNull();
      cleanup();
    }
  });

  it('removes the toggle when the mode leaves Read while open', () => {
    renderIn('read');

    useAppModeStore.setState({ mode: 'study' });

    return vi.waitFor(() => expect(screen.queryByText('Verse numbers')).toBeNull());
  });

  it('calls the shared handlers for size, font, theme and verse numbers', () => {
    renderIn('read');

    fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
    fireEvent.click(screen.getByRole('button', { name: /Lora/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Verse numbers' }));

    expect(changeFontSize).toHaveBeenCalledWith('lg');
    expect(changeScriptureFont).toHaveBeenCalledWith('lora');
    expect(changeTheme).toHaveBeenCalledWith('light');
    expect(changeShowVerseNumbers).toHaveBeenCalledWith(false);
  });

  it('shows the stored size, font and theme as selected', () => {
    useAnnotationStore.setState({ fontSize: 'lg', scriptureFont: 'lora', theme: 'dark' });
    renderIn('read');

    expect(screen.getByRole('radio', { name: 'Large' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: /Lora/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Crimson Pro/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
  });
});
