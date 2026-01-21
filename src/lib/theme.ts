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
export function applyTheme(theme: Theme, highContrast: boolean = false): void {
  const effectiveTheme = getEffectiveTheme(theme);
  const html = document.documentElement;
  
  // Remove dark class for light theme (light theme uses :root, no class needed)
  if (effectiveTheme === 'light') {
    html.classList.remove('dark');
  } else {
    // For dark theme, add the dark class
    html.classList.add('dark');
  }
  
  // Add/remove high contrast class
  if (highContrast) {
    html.classList.add('high-contrast');
  } else {
    html.classList.remove('high-contrast');
  }
  
  // Store theme preference in data attribute for CSS access
  html.setAttribute('data-theme', theme);
  html.setAttribute('data-high-contrast', highContrast ? 'true' : 'false');
  
  // Also store in localStorage for synchronous access on page load (prevents flash)
  try {
    localStorage.setItem('theme', theme);
    localStorage.setItem('highContrast', String(highContrast));
  } catch (e) {
    // localStorage might not be available (e.g., in private mode)
  }
  
  // Always set CSS variables directly on the HTML element to ensure they're applied
  // This works around any CSS cascade or caching issues
  // iOS-inspired color palette for better readability
  // High contrast mode uses stronger colors and higher contrast ratios
  const themeColors = effectiveTheme === 'dark' 
    ? (highContrast ? {
        // High contrast dark theme - maximum contrast
        '--scripture-bg': '#000000',
        '--scripture-surface': '#1a1a1a',
        '--scripture-elevated': '#2a2a2a',
        '--scripture-border': '255 255 255', // #ffffff in RGB format
        '--scripture-separator': '255 255 255',
        '--scripture-overlay-border': '255 255 255',
        '--scripture-text': '#ffffff',
        '--scripture-muted': '#ffffff',
        '--scripture-accent': '#00aaff',
        '--scripture-accent-muted': '#00ccff',
        '--scripture-error': '#ff5555',
        '--scripture-error-bg': '#4d1f1f',
        '--scripture-error-text': '#ffaaaa',
        '--scripture-warning': '#ffaa00',
        '--scripture-warning-bg': '#4d3f1f',
        '--scripture-warning-text': '#ffcc66',
        '--scripture-success': '#55ff55',
        '--scripture-success-bg': '#1f4d2f',
        '--scripture-success-text': '#aaffaa',
        '--scripture-info': '#00aaff',
        '--scripture-info-bg': '#1f2f4d',
        '--scripture-info-text': '#66ccff',
        '--scripture-backdrop-opacity': '0.8',
      } : {
        // Standard dark theme - borders (works well with opacity variants)
        // Using RGB format (space-separated) for opacity modifier support
        '--scripture-bg': '#000000',
        '--scripture-surface': '#1c1c1e',
        '--scripture-elevated': '#2c2c2e',
        '--scripture-border': '100 100 100', // #646464 in RGB format - lighter grey for better visibility
        '--scripture-separator': '100 100 100',
        '--scripture-overlay-border': '100 100 100',
        '--scripture-text': '#ffffff',
        '--scripture-muted': '#98989d',
        '--scripture-accent': '#0a84ff',
        '--scripture-accent-muted': '#409cff',
        '--scripture-error': '#ff453a',
        '--scripture-error-bg': '#3d1f1f',
        '--scripture-error-text': '#ff6961',
        '--scripture-warning': '#ff9f0a',
        '--scripture-warning-bg': '#3d2f1f',
        '--scripture-warning-text': '#ffb340',
        '--scripture-success': '#30d158',
        '--scripture-success-bg': '#1f3d2f',
        '--scripture-success-text': '#66d98f',
        '--scripture-info': '#0a84ff',
        '--scripture-info-bg': '#1f2f3d',
        '--scripture-info-text': '#64b5ff',
        '--scripture-backdrop-opacity': '0.6',
      })
    : (highContrast ? {
        // High contrast light theme - maximum contrast
        '--scripture-bg': '#ffffff',
        '--scripture-surface': '#ffffff',
        '--scripture-elevated': '#f0f0f0',
        '--scripture-border': '0 0 0', // #000000 in RGB format
        '--scripture-separator': '0 0 0',
        '--scripture-overlay-border': '0 0 0',
        '--scripture-text': '#000000',
        '--scripture-muted': '#000000',
        '--scripture-accent': '#0066cc',
        '--scripture-accent-muted': '#004499',
        '--scripture-error': '#cc0000',
        '--scripture-error-bg': '#ffe5e5',
        '--scripture-error-text': '#990000',
        '--scripture-warning': '#cc6600',
        '--scripture-warning-bg': '#fff4e5',
        '--scripture-warning-text': '#994400',
        '--scripture-success': '#009900',
        '--scripture-success-bg': '#e5f9e5',
        '--scripture-success-text': '#006600',
        '--scripture-info': '#0066cc',
        '--scripture-info-bg': '#e5f2ff',
        '--scripture-info-text': '#004499',
        '--scripture-backdrop-opacity': '0.6',
      } : {
        // Standard light theme
        // Using RGB format (space-separated) for opacity modifier support
        '--scripture-bg': '#ffffff',
        '--scripture-surface': '#ffffff',
        '--scripture-elevated': '#f2f2f7',
        '--scripture-border': '198 198 200', // #c6c6c8 in RGB format
        '--scripture-separator': '198 198 200',
        '--scripture-overlay-border': '198 198 200',
        '--scripture-text': '#000000',
        '--scripture-muted': '#8e8e93',
        '--scripture-accent': '#007aff',
        '--scripture-accent-muted': '#0051d5',
        '--scripture-error': '#ff3b30',
        '--scripture-error-bg': '#ffe5e3',
        '--scripture-error-text': '#d70015',
        '--scripture-warning': '#ff9500',
        '--scripture-warning-bg': '#fff4e5',
        '--scripture-warning-text': '#d68910',
        '--scripture-success': '#34c759',
        '--scripture-success-bg': '#e5f9ed',
        '--scripture-success-text': '#248a3d',
        '--scripture-info': '#007aff',
        '--scripture-info-bg': '#e5f2ff',
        '--scripture-info-text': '#0051d5',
        '--scripture-backdrop-opacity': '0.4',
      });
  
  // Apply CSS variables directly to :root (document.documentElement)
  // This ensures they're available for all Tailwind classes
  Object.entries(themeColors).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
  
  // Force a repaint to ensure CSS variables update
  void html.offsetHeight;
  
  // Debug: Log border color for verification
  if (process.env.NODE_ENV === 'development') {
    console.log('[Theme] Applied border color:', themeColors['--scripture-border']);
  }
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
    const highContrast = prefs.highContrast || false;
    currentThemePreference = theme;
    applyTheme(theme, highContrast);
    
    // Set up OS theme watcher (will only apply if in auto mode)
    watchOSTheme();
  } catch (error) {
    console.error('Error initializing theme:', error);
    // Fallback to auto theme (follows OS)
    currentThemePreference = 'auto';
    applyTheme('auto', false);
  }
}
