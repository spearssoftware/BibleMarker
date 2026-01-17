/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm, neutral color palette
        scripture: {
          bg: '#0f0f0f',
          surface: '#1a1a1a',
          elevated: '#252525',
          border: '#3a3a3a',
          text: '#e8e6e3',
          muted: '#9ca3af',
          accent: '#d97706',
          accentMuted: '#92400e',
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
        ui: ['"DM Sans"', 'system-ui', 'sans-serif'],
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
