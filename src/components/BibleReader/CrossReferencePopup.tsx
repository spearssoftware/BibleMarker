/**
 * Cross Reference Popup Component
 * 
 * Displays cross-references when clicking on a cross-ref symbol.
 */

import { useEffect, useRef } from 'react';
import { parseVerseRef } from '@/types/bible';
import { getBookById, formatVerseRef } from '@/types/bible';
import type { VerseRef } from '@/types/bible';

interface CrossReferencePopupProps {
  refs: string[]; // OSIS references (e.g., ["Gen.1.1", "Matt.5.3"])
  onNavigate: (ref: VerseRef) => void;
  onShowVerse?: (ref: VerseRef) => void; // Show verse in overlay instead of navigating
  onClose: () => void;
  position: { x: number; y: number };
}

export function CrossReferencePopup({ 
  refs, 
  onNavigate,
  onShowVerse,
  onClose,
  position 
}: CrossReferencePopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Close on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Close on escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Parse OSIS references to VerseRef objects
  const parsedRefs = refs
    .map(ref => {
      // OSIS refs can be comma-separated, handle ranges too
      // For now, just parse the first ref if there's a range
      const firstRef = ref.split(/[,\s-]/)[0].trim();
      const verseRef = parseVerseRef(firstRef);
      return verseRef ? { osisRef: firstRef, verseRef } : null;
    })
    .filter((ref): ref is { osisRef: string; verseRef: VerseRef } => ref !== null);

  if (parsedRefs.length === 0) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* Popup */}
      <div
        ref={popupRef}
        className="fixed z-50 bg-scripture-surface border border-scripture-border/50 rounded-xl shadow-2xl
                   p-4 min-w-[280px] max-w-[400px] max-h-[60vh] overflow-y-auto
                   animate-scale-in backdrop-blur-sm custom-scrollbar"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: 'translate(-50%, 0)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-ui font-semibold text-scripture-text uppercase tracking-wider">
            Cross-References
          </h4>
          <button
            onClick={onClose}
            className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-1.5">
          {parsedRefs.map(({ osisRef, verseRef }, index) => {
            const bookInfo = getBookById(verseRef.book);
            const displayText = formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse);
            
            return (
              <button
                key={`${osisRef}-${index}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('CrossReferencePopup button clicked:', verseRef);
                  if (onShowVerse) {
                    console.log('Calling onShowVerse');
                    onShowVerse(verseRef);
                    // Delay closing to ensure state is set
                    setTimeout(() => onClose(), 50);
                  } else {
                    console.log('Calling onNavigate (onShowVerse not provided)');
                    onNavigate(verseRef);
                    onClose();
                  }
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-scripture-elevated hover:bg-scripture-border
                           text-scripture-text text-sm font-ui transition-all duration-200
                           hover:shadow-sm border border-transparent hover:border-scripture-border/30"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{displayText}</span>
                  <span className="text-scripture-muted text-xs">{bookInfo?.testament || ''}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
