/**
 * Navigation Bar Component
 * 
 * Book and chapter selection, with prev/next navigation.
 */

import { useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { BIBLE_BOOKS, getBookById, getOTBooks, getNTBooks } from '@/types/bible';

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

  const bookInfo = getBookById(currentBook);

  return (
    <nav className="navigation-bar bg-scripture-surface/95 backdrop-blur-sm border-b border-scripture-border/50 shadow-sm sticky top-0 z-20">
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between">
        {/* Previous button */}
        <button
          onClick={previousChapter}
          disabled={!canGoPrevious()}
          className="p-2 rounded-xl hover:bg-scripture-elevated disabled:opacity-30
                     disabled:cursor-not-allowed transition-all duration-200 touch-target
                     hover:scale-105 active:scale-95"
          aria-label="Previous chapter"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
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
              className="px-4 py-2 rounded-xl bg-scripture-elevated hover:bg-scripture-border
                         font-ui font-semibold text-sm transition-all duration-200
                         border border-scripture-border/30 hover:border-scripture-border/50
                         shadow-sm hover:shadow"
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
              className="px-4 py-2 rounded-xl bg-scripture-elevated hover:bg-scripture-border
                         font-ui font-semibold text-sm transition-all duration-200 min-w-[60px]
                         border border-scripture-border/30 hover:border-scripture-border/50
                         shadow-sm hover:shadow"
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
          className="p-2 rounded-xl hover:bg-scripture-elevated disabled:opacity-30
                     disabled:cursor-not-allowed transition-all duration-200 touch-target
                     hover:scale-105 active:scale-95"
          aria-label="Next chapter"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
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
      <div className="absolute top-full left-0 mt-2 z-50
                      bg-scripture-surface border border-scripture-border/50 rounded-2xl shadow-2xl
                      w-[340px] max-h-[70vh] overflow-hidden animate-scale-in backdrop-blur-sm">
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
                className={`px-2 py-1.5 text-xs font-ui rounded-lg transition-all duration-200
                          ${book.id === currentBook 
                            ? 'bg-scripture-accent text-scripture-bg shadow-sm' 
                            : 'hover:bg-scripture-elevated hover:shadow-sm'}`}
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
                className={`px-2 py-1.5 text-xs font-ui rounded-lg transition-all duration-200
                          ${book.id === currentBook 
                            ? 'bg-scripture-accent text-scripture-bg shadow-sm' 
                            : 'hover:bg-scripture-elevated hover:shadow-sm'}`}
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
      <div className="absolute top-full left-0 mt-2 z-50
                      bg-scripture-surface border border-scripture-border/50 rounded-2xl shadow-2xl
                      w-[280px] max-h-[50vh] overflow-hidden animate-scale-in backdrop-blur-sm">
        <div className="overflow-y-auto max-h-[50vh] custom-scrollbar p-3">
          <div className="grid grid-cols-6 gap-1.5">
            {chapterNumbers.map((num) => (
              <button
                key={num}
                onClick={() => onSelect(num)}
                className={`w-10 h-10 text-sm font-ui rounded-lg transition-all duration-200
                          ${num === currentChapter 
                            ? 'bg-scripture-accent text-scripture-bg shadow-sm scale-105' 
                            : 'hover:bg-scripture-elevated hover:shadow-sm hover:scale-105'}`}
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
