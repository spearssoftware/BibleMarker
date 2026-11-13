import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnnotationStore } from '@/stores/annotationStore';
import { updatePreferences } from '@/lib/database';
import { applyScriptureFont, applyTheme } from '@/lib/theme';
import {
  changeFontSize,
  changeHighContrast,
  changeScriptureFont,
  changeShowVerseNumbers,
  changeTheme,
  hydrateTextSettings,
} from '../textSettings';

vi.mock('@/lib/database', () => ({
  updatePreferences: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/theme', () => ({
  applyTheme: vi.fn(),
  applyScriptureFont: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updatePreferences).mockResolvedValue(undefined);
  useAnnotationStore.setState({
    fontSize: 'base',
    scriptureFont: 'crimson-pro',
    theme: 'auto',
    highContrast: false,
    showVerseNumbers: true,
  });
});

describe('text settings handlers', () => {
  it('changeFontSize sets the store and saves', async () => {
    await changeFontSize('lg');

    expect(useAnnotationStore.getState().fontSize).toBe('lg');
    expect(updatePreferences).toHaveBeenCalledWith({ fontSize: 'lg' });
  });

  it('changeScriptureFont sets the store, applies the font and saves', async () => {
    await changeScriptureFont('lora');

    expect(useAnnotationStore.getState().scriptureFont).toBe('lora');
    expect(applyScriptureFont).toHaveBeenCalledWith('lora');
    expect(updatePreferences).toHaveBeenCalledWith({ scriptureFont: 'lora' });
  });

  it('changeTheme keeps High Contrast on', async () => {
    useAnnotationStore.setState({ highContrast: true });

    await changeTheme('light');

    expect(applyTheme).toHaveBeenCalledWith('light', true);
    expect(useAnnotationStore.getState().theme).toBe('light');
    expect(useAnnotationStore.getState().highContrast).toBe(true);
    expect(updatePreferences).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('changeHighContrast keeps the theme', async () => {
    useAnnotationStore.setState({ theme: 'dark' });

    await changeHighContrast(true);

    expect(applyTheme).toHaveBeenCalledWith('dark', true);
    expect(useAnnotationStore.getState().theme).toBe('dark');
    expect(updatePreferences).toHaveBeenCalledWith({ highContrast: true });
  });

  it('changeShowVerseNumbers sets the store and saves', async () => {
    await changeShowVerseNumbers(false);

    expect(useAnnotationStore.getState().showVerseNumbers).toBe(false);
    expect(updatePreferences).toHaveBeenCalledWith({ showVerseNumbers: false });
  });

  it('logs a failed save without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(updatePreferences).mockRejectedValueOnce(new Error('disk full'));

    await expect(changeFontSize('xl')).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
    expect(useAnnotationStore.getState().fontSize).toBe('xl');
    error.mockRestore();
  });

  it('starts the second save only after the first finishes', async () => {
    const events: string[] = [];
    let releaseFirst: () => void = () => {};
    vi.mocked(updatePreferences)
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            events.push('first start');
            releaseFirst = () => {
              events.push('first end');
              resolve();
            };
          })
      )
      .mockImplementationOnce(async () => {
        events.push('second start');
      });

    const first = changeFontSize('lg');
    const second = changeScriptureFont('lora');
    await Promise.resolve();
    expect(events).toEqual(['first start']);

    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(['first start', 'first end', 'second start']);
    expect(updatePreferences).toHaveBeenNthCalledWith(1, { fontSize: 'lg' });
    expect(updatePreferences).toHaveBeenNthCalledWith(2, { scriptureFont: 'lora' });
  });
});

describe('hydrateTextSettings', () => {
  it('fills the store from saved preferences', () => {
    hydrateTextSettings({
      fontSize: 'xl',
      scriptureFont: 'literata',
      theme: 'dark',
      highContrast: true,
      showVerseNumbers: false,
    });

    expect(useAnnotationStore.getState()).toMatchObject({
      fontSize: 'xl',
      scriptureFont: 'literata',
      theme: 'dark',
      highContrast: true,
      showVerseNumbers: false,
    });
  });

  it('leaves the defaults when the fields are absent', () => {
    hydrateTextSettings({});

    expect(useAnnotationStore.getState()).toMatchObject({
      fontSize: 'base',
      scriptureFont: 'crimson-pro',
      theme: 'auto',
      highContrast: false,
      showVerseNumbers: true,
    });
  });
});
