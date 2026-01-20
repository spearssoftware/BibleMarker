/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Warm, neutral color palette - uses CSS variables for theme switching
        scripture: {
          bg: 'var(--scripture-bg)',
          surface: 'var(--scripture-surface)',
          elevated: 'var(--scripture-elevated)',
          border: 'var(--scripture-border)',
          separator: 'var(--scripture-separator)',
          overlayBorder: 'var(--scripture-overlay-border)',
          text: 'var(--scripture-text)',
          muted: 'var(--scripture-muted)',
          accent: 'var(--scripture-accent)',
          accentMuted: 'var(--scripture-accent-muted)',
          error: 'var(--scripture-error)',
          errorBg: 'var(--scripture-error-bg)',
          errorText: 'var(--scripture-error-text)',
          warning: 'var(--scripture-warning)',
          warningBg: 'var(--scripture-warning-bg)',
          warningText: 'var(--scripture-warning-text)',
          success: 'var(--scripture-success)',
          successBg: 'var(--scripture-success-bg)',
          successText: 'var(--scripture-success-text)',
          info: 'var(--scripture-info)',
          infoBg: 'var(--scripture-info-bg)',
          infoText: 'var(--scripture-info-text)',
        },
        // Highlight colors for annotations
        highlight: {
          red: '#ef4444',
          orange: '#f97316',
          amber: '#f59e0b',
          yellow: '#eab308',
          lime: '#84cc16',
          green: '#22c55e',
          teal: '#14b8a6',
          cyan: '#06b6d4',
          blue: '#3b82f6',
          indigo: '#6366f1',
          purple: '#a855f7',
          pink: '#ec4899',
        }
      },
      fontFamily: {
        scripture: ['"Crimson Pro"', 'Georgia', 'serif'],
        ui: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Helvetica Neue"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'scripture-sm': ['1rem', { lineHeight: '1.8' }],
        'scripture-base': ['1.125rem', { lineHeight: '1.9' }],
        'scripture-lg': ['1.25rem', { lineHeight: '2' }],
        'scripture-xl': ['1.375rem', { lineHeight: '2.1' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
