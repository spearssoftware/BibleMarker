/**
 * Theme Management Utilities
 * 
 * Handles light/dark theme switching with OS preference support.
 */

export type Theme = 'light' | 'dark' | 'auto';

/**
 * Get the effective theme (resolves 'auto' to OS preference)
 */
export function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/**
 * Apply theme to the document
 */
export function applyTheme(theme: Theme): void {
  const effectiveTheme = getEffectiveTheme(theme);
  const html = document.documentElement;
  
  // Remove dark class for light theme (light theme uses :root, no class needed)
  if (effectiveTheme === 'light') {
    html.classList.remove('dark');
  } else {
    // For dark theme, add the dark class
    html.classList.add('dark');
  }
  
  // Store theme preference in data attribute for CSS access
  html.setAttribute('data-theme', theme);
  
  // Always set CSS variables directly on the HTML element to ensure they're applied
  // This works around any CSS cascade or caching issues
  const themeColors = effectiveTheme === 'dark' 
    ? {
        '--scripture-bg': '#0f0f0f',
        '--scripture-surface': '#1a1a1a',
        '--scripture-elevated': '#252525',
        '--scripture-border': '#3a3a3a',
        '--scripture-text': '#e8e6e3',
        '--scripture-muted': '#9ca3af',
        '--scripture-accent': '#d97706',
        '--scripture-accent-muted': '#92400e',
        '--scripture-error': '#ef4444',
        '--scripture-error-bg': '#7f1d1d',
        '--scripture-error-text': '#fecaca',
        '--scripture-warning': '#f59e0b',
        '--scripture-warning-bg': '#78350f',
        '--scripture-warning-text': '#fde68a',
        '--scripture-success': '#22c55e',
        '--scripture-success-bg': '#14532d',
        '--scripture-success-text': '#86efac',
        '--scripture-info': '#3b82f6',
        '--scripture-info-bg': '#1e3a8a',
        '--scripture-info-text': '#93c5fd',
        '--scripture-backdrop-opacity': '0.75',
      }
    : {
        '--scripture-bg': '#faf9f7',
        '--scripture-surface': '#ffffff',
        '--scripture-elevated': '#f5f4f2',
        '--scripture-border': '#e5e3e0',
        '--scripture-text': '#1a1a1a',
        '--scripture-muted': '#6b7280',
        '--scripture-accent': '#d97706',
        '--scripture-accent-muted': '#92400e',
        '--scripture-error': '#dc2626',
        '--scripture-error-bg': '#fee2e2',
        '--scripture-error-text': '#991b1b',
        '--scripture-warning': '#f59e0b',
        '--scripture-warning-bg': '#fef3c7',
        '--scripture-warning-text': '#92400e',
        '--scripture-success': '#22c55e',
        '--scripture-success-bg': '#dcfce7',
        '--scripture-success-text': '#166534',
        '--scripture-info': '#3b82f6',
        '--scripture-info-bg': '#dbeafe',
        '--scripture-info-text': '#1e40af',
        '--scripture-backdrop-opacity': '0.6',
      };
  
  // Apply CSS variables directly to :root (document.documentElement)
  // This ensures they're available for all Tailwind classes
  Object.entries(themeColors).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
  
  // Force a repaint to ensure CSS variables update
  void html.offsetHeight;
}

// Store current theme preference for watcher
let currentThemePreference: Theme = 'dark';

/**
 * Watch OS theme changes and update when in auto mode
 */
export function watchOSTheme(): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  const handleChange = () => {
    // Check if we're still in auto mode by checking the data attribute
    const html = document.documentElement;
    const themeAttr = html.getAttribute('data-theme') as Theme;
    if (themeAttr === 'auto') {
      applyTheme('auto');
    }
  };
  
  // Modern browsers
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  } 
  // Fallback for older browsers
  else if (mediaQuery.addListener) {
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }
  
  return () => {};
}

/**
 * Initialize theme on app load
 */
export async function initTheme(): Promise<void> {
  try {
    const { getPreferences } = await import('@/lib/db');
    const prefs = await getPreferences();
    const theme = prefs.theme || 'auto';
    currentThemePreference = theme;
    applyTheme(theme);
    
    // Set up OS theme watcher (will only apply if in auto mode)
    watchOSTheme();
  } catch (error) {
    console.error('Error initializing theme:', error);
    // Fallback to auto theme (follows OS)
    currentThemePreference = 'auto';
    applyTheme('auto');
  }
}
