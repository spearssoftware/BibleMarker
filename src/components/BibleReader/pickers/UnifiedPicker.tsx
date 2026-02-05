/**
 * Unified Picker Component
 * 
 * Two-step picker for selecting Bible book and chapter.
 * Step 1: Book selection with search and recent books
 * Step 2: Chapter selection (after book tap)
 * 
 * Designed for mobile-first with bottom sheet presentation.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { getOTBooks, getNTBooks, getBookById, type BookInfo } from '@/types/bible';
import { useModal } from '@/hooks/useModal';
import { ModalBackdrop } from '@/components/shared';
import { Z_INDEX } from '@/lib/modalConstants';
import { getPreferences, updatePreferences } from '@/lib/db';

interface UnifiedPickerProps {
  currentBook: string;
  currentChapter: number;
  onSelect: (bookId: string, chapter: number) => void;
  onClose: () => void;
}

export function UnifiedPicker({ 
  currentBook, 
  currentChapter, 
  onSelect, 
  onClose 
}: UnifiedPickerProps) {
  const [step, setStep] = useState<'book' | 'chapter'>('book');
  const [selectedBook, setSelectedBook] = useState<string>(currentBook);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentBooks, setRecentBooks] = useState<string[]>([]);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const otBooks = getOTBooks();
  const ntBooks = getNTBooks();
  const selectedBookInfo = getBookById(selectedBook);

  // Load recent books on mount
  useEffect(() => {
    async function loadRecentBooks() {
      try {
        const prefs = await getPreferences();
        if (prefs.recentBooks && prefs.recentBooks.length > 0) {
          setRecentBooks(prefs.recentBooks.slice(0, 6));
        }
      } catch (error) {
        console.error('Failed to load recent books:', error);
      }
    }
    loadRecentBooks();
  }, []);

  // Track book selection in recent books
  const trackRecentBook = async (bookId: string) => {
    try {
      const prefs = await getPreferences();
      const recent = prefs.recentBooks || [];
      // Remove if already exists, then add to front
      const updatedRecent = [bookId, ...recent.filter(id => id !== bookId)].slice(0, 10);
      await updatePreferences({ recentBooks: updatedRecent } as Parameters<typeof updatePreferences>[0]);
      setRecentBooks(updatedRecent.slice(0, 6));
    } catch (error) {
      console.error('Failed to update recent books:', error);
    }
  };

  // Filter books based on search query
  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) {
      return { ot: otBooks, nt: ntBooks };
    }
    const query = searchQuery.toLowerCase().trim();
    const filterFn = (book: BookInfo) => 
      book.name.toLowerCase().includes(query) ||
      book.shortName.toLowerCase().includes(query) ||
      book.id.toLowerCase().includes(query);
    
    return {
      ot: otBooks.filter(filterFn),
      nt: ntBooks.filter(filterFn),
    };
  }, [searchQuery, otBooks, ntBooks]);

  const { handleBackdropClick } = useModal({
    isOpen: true,
    onClose,
    lockScroll: true,
    handleEscape: true,
  });

  // Focus search input on mount
  useEffect(() => {
    if (step === 'book' && searchInputRef.current) {
      // Small delay to ensure the component is rendered
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleBookSelect = (bookId: string) => {
    setSelectedBook(bookId);
    trackRecentBook(bookId);
    setStep('chapter');
  };

  const handleChapterSelect = (chapter: number) => {
    onSelect(selectedBook, chapter);
    onClose();
  };

  const handleBack = () => {
    setStep('book');
    setSearchQuery('');
  };

  // Generate chapter numbers for selected book
  const chapterCount = selectedBookInfo?.chapters || 1;
  const chapters = Array.from({ length: chapterCount }, (_, i) => i + 1);

  return (
    <>
      {/* Backdrop */}
      <ModalBackdrop onClick={handleBackdropClick} zIndex={Z_INDEX.BACKDROP} />

      {/* Bottom sheet picker */}
      <div 
        ref={pickerRef}
        className="fixed top-[60px] left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-md
                   bg-scripture-surface rounded-2xl shadow-modal dark:shadow-modal-dark animate-slide-down 
                   max-h-[70vh] flex flex-col mt-safe-top"
        style={{ zIndex: Z_INDEX.MODAL }}
        role="dialog"
        aria-modal="true"
        aria-label={step === 'book' ? 'Select Bible book' : `Select chapter in ${selectedBookInfo?.name}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-scripture-border/30 flex-shrink-0">
          {step === 'chapter' && (
            <button
              onClick={handleBack}
              className="p-1.5 -ml-1.5 rounded-lg hover:bg-scripture-elevated transition-colors"
              aria-label="Back to book selection"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h2 className="text-base font-ui font-semibold text-scripture-text flex-1 text-center">
            {step === 'book' ? 'Select Book' : selectedBookInfo?.name || 'Select Chapter'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg hover:bg-scripture-elevated transition-colors"
            aria-label="Close picker"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {step === 'book' ? (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {/* Search */}
            <div className="p-4 sticky top-0 bg-scripture-surface border-b border-scripture-border/20">
              <div className="relative">
                <svg 
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-scripture-muted" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth={2} 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search books..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-scripture-elevated border border-scripture-border/30 
                           rounded-lg focus:outline-none focus:border-scripture-accent
                           text-scripture-text placeholder-scripture-muted"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-scripture-border/50"
                    aria-label="Clear search"
                  >
                    <svg className="w-4 h-4 text-scripture-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Recent Books */}
            {!searchQuery && recentBooks.length > 0 && (
              <div className="px-4 py-3 border-b border-scripture-border/20">
                <h3 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-2">
                  Recent
                </h3>
                <div className="flex flex-wrap gap-2">
                  {recentBooks.map((bookId) => {
                    const book = getBookById(bookId);
                    if (!book) return null;
                    return (
                      <button
                        key={bookId}
                        onClick={() => handleBookSelect(bookId)}
                        className={`px-3 py-1.5 text-sm font-ui rounded-lg transition-all duration-200
                                  ${bookId === currentBook
                                    ? 'bg-scripture-accent text-scripture-bg shadow-sm'
                                    : 'bg-scripture-elevated hover:bg-scripture-border/50'}`}
                      >
                        {book.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Old Testament */}
            {filteredBooks.ot.length > 0 && (
              <div className="px-4 py-3">
                <h3 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-2">
                  Old Testament
                </h3>
                <div className="grid grid-cols-4 gap-1.5">
                  {filteredBooks.ot.map((book) => (
                    <button
                      key={book.id}
                      onClick={() => handleBookSelect(book.id)}
                      className={`px-2 py-2 text-xs font-ui rounded-lg transition-all duration-200
                                ${book.id === currentBook
                                  ? 'bg-scripture-accent text-scripture-bg shadow-sm'
                                  : 'bg-scripture-elevated hover:bg-scripture-border/50'}`}
                      aria-label={`Select ${book.name}`}
                    >
                      {book.shortName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* New Testament */}
            {filteredBooks.nt.length > 0 && (
              <div className="px-4 py-3">
                <h3 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-2">
                  New Testament
                </h3>
                <div className="grid grid-cols-4 gap-1.5">
                  {filteredBooks.nt.map((book) => (
                    <button
                      key={book.id}
                      onClick={() => handleBookSelect(book.id)}
                      className={`px-2 py-2 text-xs font-ui rounded-lg transition-all duration-200
                                ${book.id === currentBook
                                  ? 'bg-scripture-accent text-scripture-bg shadow-sm'
                                  : 'bg-scripture-elevated hover:bg-scripture-border/50'}`}
                      aria-label={`Select ${book.name}`}
                    >
                      {book.shortName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* No results */}
            {searchQuery && filteredBooks.ot.length === 0 && filteredBooks.nt.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-scripture-muted text-sm">No books found matching "{searchQuery}"</p>
              </div>
            )}
          </div>
        ) : (
          /* Chapter Selection */
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
            <div className="grid grid-cols-6 gap-2">
              {chapters.map((chapter) => (
                <button
                  key={chapter}
                  onClick={() => handleChapterSelect(chapter)}
                  className={`px-2 py-3 text-sm font-ui font-medium rounded-lg transition-all duration-200
                            ${chapter === currentChapter && selectedBook === currentBook
                              ? 'bg-scripture-accent text-scripture-bg shadow-sm'
                              : 'bg-scripture-elevated hover:bg-scripture-border/50'}`}
                  aria-label={`Chapter ${chapter}`}
                >
                  {chapter}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
