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
import { Modal } from '@/components/shared';

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
    <Modal
      isOpen={true}
      onClose={onClose}
      title={displayText}
      size="md"
      headerActions={
        onNavigate ? (
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
        ) : undefined
      }
    >
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
    </Modal>
  );
}
