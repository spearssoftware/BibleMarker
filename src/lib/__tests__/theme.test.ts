/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyTheme, watchOSTheme } from '../theme';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = '';
});

describe('watchOSTheme', () => {
  it('keeps High Contrast when the OS switches between light and dark', () => {
    let systemDark = false;
    let onChange: (() => void) | undefined;
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return systemDark;
      },
      addEventListener: (_type: string, listener: () => void) => {
        onChange = listener;
      },
      removeEventListener: () => {},
    }));

    applyTheme('auto', true);
    const stop = watchOSTheme();

    systemDark = true;
    onChange?.();

    const html = document.documentElement;
    expect(html.classList.contains('dark')).toBe(true);
    expect(html.classList.contains('high-contrast')).toBe(true);
    stop();
  });
});
