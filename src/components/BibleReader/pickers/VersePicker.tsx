/**
 * Verse Picker Component
 * 
 * Dropdown picker for selecting a verse number.
 */

import { useRef, useEffect } from 'react';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';
import { useModal } from '@/hooks/useModal';
import { ModalBackdrop } from '@/components/shared';
import { Z_INDEX } from '@/lib/modalConstants';

interface VersePickerProps {
  verseCount: number;
  currentVerse: number;
  onSelect: (verse: number) => void;
  onClose: () => void;
  /** Ref to the trigger button element */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function VersePicker({ 
  verseCount, 
  currentVerse, 
  onSelect, 
  onClose,
  triggerRef 
}: VersePickerProps) {
  const verseNumbers = Array.from({ length: verseCount }, (_, i) => i + 1);
  const pickerRef = useRef<HTMLDivElement>(null);
  
  // Fallback: find trigger button if ref not provided
  const fallbackTriggerRef = useRef<HTMLElement | null>(null);
  
  useEffect(() => {
    if (!triggerRef?.current && pickerRef.current) {
      const button = pickerRef.current.closest('.relative')?.querySelector('button') as HTMLElement;
      if (button) {
        fallbackTriggerRef.current = button;
      }
    }
  }, [triggerRef]);

  const effectiveTriggerRef = (triggerRef as React.RefObject<HTMLElement>) ?? fallbackTriggerRef;

  const { top, left, width, isReady } = useDropdownPosition({
    triggerRef: effectiveTriggerRef,
    width: 320,
    alignment: 'center',
    offset: 8,
  });

  const { handleBackdropClick } = useModal({
    isOpen: true,
    onClose,
    lockScroll: false,
    handleEscape: true,
  });

  return (
    <>
      {/* Backdrop */}
      <ModalBackdrop onClick={handleBackdropClick} zIndex={Z_INDEX.BACKDROP} />
      
      {/* Picker */}
      <div 
        ref={pickerRef}
        className="fixed bg-scripture-surface rounded-2xl shadow-2xl
                    max-h-[50vh] overflow-hidden transition-opacity duration-150"
        style={{ 
          top: `${top}px`,
          left: `${left}px`,
          width: `${width}px`,
          maxWidth: 'min(320px, calc(100vw - 2rem))',
          zIndex: Z_INDEX.MODAL,
          opacity: isReady ? 1 : 0,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Select verse"
      >
        <div className="overflow-y-auto max-h-[50vh] custom-scrollbar p-4">
          <div className="grid grid-cols-8 gap-1.5">
            {verseNumbers.map((num) => (
              <button
                key={num}
                onClick={() => {
                  onSelect(num);
                  onClose();
                }}
                className={`w-9 h-9 text-xs font-ui rounded-lg transition-all duration-200
                          ${num === currentVerse 
                            ? 'bg-scripture-accent text-scripture-bg shadow-sm scale-105' 
                            : 'hover:bg-scripture-elevated hover:shadow-sm hover:scale-105'}`}
                aria-label={`Select verse ${num}`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
