/**
 * Error Display Component
 * 
 * Global error display UI that shows errors from the Bible store.
 * Displays at the top of the app with dismiss functionality.
 */

import { useBibleStore } from '@/stores/bibleStore';

export function ErrorDisplay() {
  const { error, setError } = useBibleStore();

  if (!error) return null;

  return (
    <div className="fixed top-16 left-0 right-0 z-50 p-4 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto">
        <div className="bg-scripture-errorBg border border-scripture-error/30 rounded-lg shadow-lg backdrop-blur-sm p-4 flex items-start gap-3 animate-fade-in">
          <div className="flex-shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-scripture-error"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-scripture-error mb-1">Error</div>
            <div className="text-sm text-scripture-errorText break-words">{error}</div>
          </div>
          <button
            onClick={() => setError(null)}
            className="flex-shrink-0 text-scripture-errorText hover:text-scripture-error transition-colors p-1 rounded hover:bg-scripture-error/20"
            aria-label="Dismiss error"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
