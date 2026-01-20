/**
 * Verse Overlay Component
 * 
 * Displays a verse in an overlay/popup, allowing quick reference without navigation.
 */

import { useEffect, useState, useRef } from 'react';
import { formatVerseRef } from '@/types/bible';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { fetchChapter } from '@/lib/bible-api';
import type { VerseRef } from '@/types/bible';

interface VerseOverlayProps {
  verseRef: VerseRef;
  onClose: () => void;
  onNavigate?: (ref: VerseRef) => void;
}

export function VerseOverlay({ verseRef, onClose, onNavigate }: VerseOverlayProps) {
  const [verseText, setVerseText] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { currentModuleId } = useBibleStore();
  const { fontSize } = useAnnotationStore();

  useEffect(() => {
    async function loadVerse() {
      if (!currentModuleId) {
        setError('No module loaded');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        // Fetch the chapter and find the specific verse
        const chapter = await fetchChapter(currentModuleId, verseRef.book, verseRef.chapter);
        const verse = chapter.verses.find(v => v.ref.verse === verseRef.verse);
        if (verse) {
          // Use HTML if available, otherwise use plain text
          setVerseText(verse.html || verse.text);
        } else {
          setError('Verse not found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load verse');
      } finally {
        setIsLoading(false);
      }
    }

    loadVerse();
  }, [verseRef, currentModuleId]);

  useEffect(() => {
    // Close on escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const displayText = formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-50 backdrop-overlay backdrop-blur-sm" 
        onClick={onClose}
      />
      
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-x-4 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
                   bg-scripture-surface border border-scripture-border/50 rounded-2xl shadow-2xl
                   max-w-2xl max-h-[80vh] overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-scripture-border/50">
          <h3 className="text-lg font-ui font-semibold text-scripture-text">
            {displayText}
          </h3>
          <div className="flex items-center gap-2">
            {onNavigate && (
              <button
                onClick={() => {
                  onNavigate(verseRef);
                  onClose();
                }}
                className="px-3 py-1.5 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                         hover:bg-scripture-accent/90 transition-colors"
              >
                Go to Verse
              </button>
            )}
            <button
              onClick={onClose}
              className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {isLoading && (
            <div className="text-center py-8 text-scripture-muted">
              Loading...
            </div>
          )}
          
          {error && (
            <div className="text-center py-8 text-scripture-errorText">
              {error}
            </div>
          )}
          
          {!isLoading && !error && verseText && (
            <div 
              className={`scripture-text ${fontSize === 'sm' ? 'text-scripture-sm' : fontSize === 'lg' ? 'text-scripture-lg' : fontSize === 'xl' ? 'text-scripture-xl' : 'text-scripture-base'} leading-relaxed`}
              dangerouslySetInnerHTML={{ __html: verseText }}
            />
          )}
        </div>
      </div>
    </>
  );
}
