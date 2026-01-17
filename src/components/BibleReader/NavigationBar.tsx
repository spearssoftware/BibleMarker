/**
 * Navigation Bar Component
 * 
 * Book and chapter selection, with prev/next navigation.
 */

import { useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { BIBLE_BOOKS, getBookById, getOTBooks, getNTBooks } from '@/types/bible';
import { clearDatabase } from '@/lib/db';

export function NavigationBar() {
  const {
    currentBook,
    currentChapter,
    setLocation,
    nextChapter,
    previousChapter,
    canGoNext,
    canGoPrevious,
  } = useBibleStore();

  const [showBookPicker, setShowBookPicker] = useState(false);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const bookInfo = getBookById(currentBook);

  const handleClearDatabase = async () => {
    if (!confirm('Are you sure you want to clear all annotations, notes, and cache? This cannot be undone.')) {
      return;
    }
    
    setIsClearing(true);
    try {
      await clearDatabase();
      alert('Database cleared successfully!');
      // Reload the page to refresh the UI
      window.location.reload();
    } catch (error) {
      console.error('Error clearing database:', error);
      alert('Error clearing database. Check console for details.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <nav className="navigation-bar bg-scripture-surface border-b border-scripture-border">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Previous button */}
        <button
          onClick={previousChapter}
          disabled={!canGoPrevious()}
          className="p-2 rounded-lg hover:bg-scripture-elevated disabled:opacity-30
                     disabled:cursor-not-allowed transition-colors touch-target"
          aria-label="Previous chapter"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Book and chapter selector */}
        <div className="flex items-center gap-2">
          {/* Book selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowBookPicker(!showBookPicker);
                setShowChapterPicker(false);
              }}
              className="px-4 py-2 rounded-lg bg-scripture-elevated hover:bg-scripture-border
                         font-ui font-medium transition-colors"
            >
              {bookInfo?.name || currentBook}
            </button>

            {showBookPicker && (
              <BookPicker
                currentBook={currentBook}
                onSelect={(bookId) => {
                  setLocation(bookId, 1);
                  setShowBookPicker(false);
                }}
                onClose={() => setShowBookPicker(false)}
              />
            )}
          </div>

          {/* Chapter selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowChapterPicker(!showChapterPicker);
                setShowBookPicker(false);
              }}
              className="px-4 py-2 rounded-lg bg-scripture-elevated hover:bg-scripture-border
                         font-ui font-medium transition-colors min-w-[60px]"
            >
              {currentChapter}
            </button>

            {showChapterPicker && bookInfo && (
              <ChapterPicker
                chapters={bookInfo.chapters}
                currentChapter={currentChapter}
                onSelect={(chapter) => {
                  setLocation(currentBook, chapter);
                  setShowChapterPicker(false);
                }}
                onClose={() => setShowChapterPicker(false)}
              />
            )}
          </div>
        </div>

        {/* Next button */}
        <button
          onClick={nextChapter}
          disabled={!canGoNext()}
          className="p-2 rounded-lg hover:bg-scripture-elevated disabled:opacity-30
                     disabled:cursor-not-allowed transition-colors touch-target"
          aria-label="Next chapter"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Clear Database button (testing only) */}
        <button
          onClick={handleClearDatabase}
          disabled={isClearing}
          className="px-3 py-1.5 text-xs font-ui rounded-lg bg-red-600/20 
                     hover:bg-red-600/30 text-red-400 disabled:opacity-50 
                     disabled:cursor-not-allowed transition-colors touch-target
                     border border-red-600/30"
          title="Clear all annotations and cache (for testing)"
          aria-label="Clear database"
        >
          {isClearing ? 'Clearing...' : '🗑️ Clear DB'}
        </button>
      </div>
    </nav>
  );
}

interface BookPickerProps {
  currentBook: string;
  onSelect: (bookId: string) => void;
  onClose: () => void;
}

function BookPicker({ currentBook, onSelect, onClose }: BookPickerProps) {
  const otBooks = getOTBooks();
  const ntBooks = getNTBooks();

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* Picker */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50
                      bg-scripture-surface border border-scripture-border rounded-xl shadow-xl
                      w-[340px] max-h-[70vh] overflow-hidden animate-scale-in">
        <div className="overflow-y-auto max-h-[70vh] custom-scrollbar p-4">
          {/* Old Testament */}
          <h4 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-2">
            Old Testament
          </h4>
          <div className="grid grid-cols-4 gap-1 mb-4">
            {otBooks.map((book) => (
              <button
                key={book.id}
                onClick={() => onSelect(book.id)}
                className={`px-2 py-1.5 text-xs font-ui rounded transition-colors
                          ${book.id === currentBook 
                            ? 'bg-scripture-accent text-scripture-bg' 
                            : 'hover:bg-scripture-elevated'}`}
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
                onClick={() => onSelect(book.id)}
                className={`px-2 py-1.5 text-xs font-ui rounded transition-colors
                          ${book.id === currentBook 
                            ? 'bg-scripture-accent text-scripture-bg' 
                            : 'hover:bg-scripture-elevated'}`}
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

interface ChapterPickerProps {
  chapters: number;
  currentChapter: number;
  onSelect: (chapter: number) => void;
  onClose: () => void;
}

function ChapterPicker({ chapters, currentChapter, onSelect, onClose }: ChapterPickerProps) {
  const chapterNumbers = Array.from({ length: chapters }, (_, i) => i + 1);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* Picker */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50
                      bg-scripture-surface border border-scripture-border rounded-xl shadow-xl
                      w-[280px] max-h-[50vh] overflow-hidden animate-scale-in">
        <div className="overflow-y-auto max-h-[50vh] custom-scrollbar p-3">
          <div className="grid grid-cols-6 gap-1">
            {chapterNumbers.map((num) => (
              <button
                key={num}
                onClick={() => onSelect(num)}
                className={`w-10 h-10 text-sm font-ui rounded-lg transition-colors
                          ${num === currentChapter 
                            ? 'bg-scripture-accent text-scripture-bg' 
                            : 'hover:bg-scripture-elevated'}`}
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
