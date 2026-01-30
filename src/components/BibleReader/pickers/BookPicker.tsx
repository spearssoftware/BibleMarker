/**
 * Book Picker Component
 * 
 * Dropdown picker for selecting a Bible book.
 */

import { useRef, useEffect } from 'react';
import { getOTBooks, getNTBooks } from '@/types/bible';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';
import { useModal } from '@/hooks/useModal';
import { ModalBackdrop } from '@/components/shared';
import { Z_INDEX } from '@/lib/modalConstants';

interface BookPickerProps {
  currentBook: string;
  onSelect: (bookId: string) => void;
  onClose: () => void;
  /** Ref to the trigger button element */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function BookPicker({ currentBook, onSelect, onClose, triggerRef }: BookPickerProps) {
  const otBooks = getOTBooks();
  const ntBooks = getNTBooks();
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

  const effectiveTriggerRef = (triggerRef as React.RefObject<HTMLElement>) || { current: fallbackTriggerRef.current };

  const { top, left, width, isReady } = useDropdownPosition({
    triggerRef: effectiveTriggerRef,
    width: 340,
    alignment: 'center',
    offset: 8,
  });

  const { handleBackdropClick } = useModal({
    isOpen: true,
    onClose,
    lockScroll: false, // Don't lock scroll for dropdowns
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
                    max-h-[70vh] overflow-hidden transition-opacity duration-150"
        style={{ 
          top: `${top}px`,
          left: `${left}px`,
          width: `${width}px`,
          maxWidth: 'min(340px, calc(100vw - 2rem))',
          zIndex: Z_INDEX.MODAL,
          opacity: isReady ? 1 : 0,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Select Bible book"
      >
        <div className="overflow-y-auto max-h-[70vh] custom-scrollbar p-4">
          {/* Old Testament */}
          <h4 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-2">
            Old Testament
          </h4>
          <div className="grid grid-cols-4 gap-1 mb-4">
            {otBooks.map((book) => (
              <button
                key={book.id}
                onClick={() => {
                  onSelect(book.id);
                  onClose();
                }}
                className={`px-2 py-1.5 text-xs font-ui rounded-lg transition-all duration-200
                          ${book.id === currentBook 
                            ? 'bg-scripture-accent text-scripture-bg shadow-sm' 
                            : 'hover:bg-scripture-elevated hover:shadow-sm'}`}
                aria-label={`Select ${book.name}`}
              >
                {book.shortName}
              </button>
            ))}
          </div>

          {/* New Testament */}
          <h4 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-2">
            New Testament
          </h4>
          <div className="grid grid-cols-4 gap-1">
            {ntBooks.map((book) => (
              <button
                key={book.id}
                onClick={() => {
                  onSelect(book.id);
                  onClose();
                }}
                className={`px-2 py-1.5 text-xs font-ui rounded-lg transition-all duration-200
                          ${book.id === currentBook 
                            ? 'bg-scripture-accent text-scripture-bg shadow-sm' 
                            : 'hover:bg-scripture-elevated hover:shadow-sm'}`}
                aria-label={`Select ${book.name}`}
              >
                {book.shortName}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
