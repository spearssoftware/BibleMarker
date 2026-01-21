/**
 * Navigation Bar Component
 * 
 * Translation, book and chapter selection, with prev/next navigation.
 */

import { useState, useEffect, useRef } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { getBookById, getOTBooks, getNTBooks, getVerseCount } from '@/types/bible';
import { getAllTranslations, type ApiTranslation } from '@/lib/bible-api';
import { getPreferences, db } from '@/lib/db';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { Search } from '@/components/Search';

export function NavigationBar() {
  const {
    currentBook,
    currentChapter,
    currentModuleId,
    setLocation,
    setCurrentModule,
    nextChapter,
    previousChapter,
    canGoNext,
    canGoPrevious,
  } = useBibleStore();

  const [showBookPicker, setShowBookPicker] = useState(false);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const [showTranslationPicker, setShowTranslationPicker] = useState(false);
  const [showVersePicker, setShowVersePicker] = useState(false);
  const scrollLockRef = useRef<number | null>(null);

  // Lock scroll position when any picker opens
  useEffect(() => {
    const anyPickerOpen = showBookPicker || showChapterPicker || showVersePicker || showTranslationPicker;
    
    if (anyPickerOpen) {
      // Check if any toolbar overlay is open - if so, don't lock scroll at all
      const toolbarOverlay = document.querySelector('[data-marking-toolbar-overlay]');
      if (toolbarOverlay) {
        return; // Toolbar overlay is open, don't set up scroll lock
      }
      
      // Save scroll position when picker opens
      scrollLockRef.current = window.scrollY;
      
      const restoreScroll = (e?: Event) => {
        // Double-check toolbar overlay is still not open
        const toolbarOverlay = document.querySelector('[data-marking-toolbar-overlay]');
        if (toolbarOverlay) {
          return; // Toolbar overlay is open, allow scrolling
        }
        
        // Don't prevent scrolling if it's happening inside an overlay or toolbar
        if (e) {
          const target = e.target as HTMLElement;
          // Check if scroll is happening inside an overlay, toolbar, or modal
          if (target.closest('[data-marking-toolbar]') || 
              target.closest('[data-marking-toolbar-overlay]') ||
              target.closest('.backdrop-overlay') ||
              target.closest('[role="dialog"]') ||
              target.classList.contains('custom-scrollbar')) {
            return; // Allow scrolling inside overlays
          }
        }
        
        if (scrollLockRef.current !== null && window.scrollY !== scrollLockRef.current) {
          window.scrollTo(0, scrollLockRef.current);
        }
      };
      
      // Restore scroll position on scroll events, but only if not scrolling inside an overlay
      window.addEventListener('scroll', restoreScroll, { passive: true });
      
      // Also check periodically, but be more careful - only restore if scroll changed
      // and we're not currently interacting with an overlay
      const interval = setInterval(() => {
        // Check if any toolbar overlay is open
        const toolbarOverlay = document.querySelector('[data-marking-toolbar-overlay]');
        if (toolbarOverlay) {
          return; // Toolbar overlay is open, don't lock scroll
        }
        
        // Check if user is interacting with an overlay
        const activeElement = document.activeElement;
        const isInOverlay = activeElement?.closest('[data-marking-toolbar]') || 
                           activeElement?.closest('[data-marking-toolbar-overlay]') ||
                           activeElement?.closest('.backdrop-overlay') ||
                           activeElement?.closest('[role="dialog"]');
        
        if (!isInOverlay) {
          restoreScroll();
        }
      }, 100); // Check less frequently
      
      return () => {
        window.removeEventListener('scroll', restoreScroll);
        clearInterval(interval);
        scrollLockRef.current = null;
      };
    }
  }, [showBookPicker, showChapterPicker, showVersePicker, showTranslationPicker]);
  const [showSearch, setShowSearch] = useState(false);
  const [translations, setTranslations] = useState<ApiTranslation[]>([]);
  const [currentVerse, setCurrentVerse] = useState<number | null>(null);
  
  const { activeView, loadActiveView, addTranslation, removeTranslation, clearView } = useMultiTranslationStore();

  const bookInfo = getBookById(currentBook);
  const currentTranslation = translations.find(t => t.id === currentModuleId);
  
  // Get verse count for current chapter
  const verseCount = getVerseCount(currentBook, currentChapter);
  
  // Get current verse from loaded chapter data or use first verse as default
  useEffect(() => {
    const { chapter } = useBibleStore.getState();
    if (chapter && chapter.verses.length > 0) {
      // Use the first verse as default
      const firstVerse = chapter.verses[0]?.ref.verse;
      if (firstVerse) {
        setCurrentVerse(firstVerse);
      }
    } else {
      // Reset to verse 1 when chapter changes
      setCurrentVerse(1);
    }
  }, [currentBook, currentChapter]);

  // Track scroll position to update current verse
  useEffect(() => {
    const handleScroll = () => {
      // Don't update verse when pickers are open to prevent text jumping
      if (showBookPicker || showChapterPicker || showVersePicker || showTranslationPicker) {
        return;
      }

      // Find the verse element that's currently in view
      const verseElements = document.querySelectorAll('[data-verse]');
      const viewportCenter = window.scrollY + window.innerHeight / 2;

      let closestVerse: number | null = null;
      let closestDistance = Infinity;

      verseElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2 + window.scrollY;
        const distance = Math.abs(elementCenter - viewportCenter);
        
        if (distance < closestDistance) {
          const verseNum = parseInt(el.getAttribute('data-verse') || '0', 10);
          if (verseNum > 0) {
            closestVerse = verseNum;
            closestDistance = distance;
          }
        }
      });

      if (closestVerse !== null) {
        setCurrentVerse(closestVerse);
      }
    };

    // Throttle scroll events
    let scrollTimeout: ReturnType<typeof setTimeout>;
    const throttledScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScroll, 100);
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });

    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', throttledScroll);
      clearTimeout(scrollTimeout);
    };
  }, [currentBook, currentChapter, showBookPicker, showChapterPicker, showVersePicker, showTranslationPicker]);

  // Load translations on mount and when translations are updated
  useEffect(() => {
    async function loadTranslations() {
      const available = await getAllTranslations();
      setTranslations(available);
    }
    loadTranslations();
    loadActiveView();
    
    // Reload translations when window regains focus (user might have configured API keys in another tab)
    const handleFocus = () => {
      loadTranslations();
    };
    
    // Reload translations when ModuleManager updates them
    const handleTranslationsUpdated = () => {
      loadTranslations();
    };
    
    // Close pickers when clicking on verse text
    const handleClosePickers = () => {
      setShowTranslationPicker(false);
      setShowBookPicker(false);
      setShowChapterPicker(false);
      setShowVersePicker(false);
    };

    // Keyboard shortcut for search (Cmd/Ctrl+F)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('translationsUpdated', handleTranslationsUpdated);
    window.addEventListener('closePickers', handleClosePickers);
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('translationsUpdated', handleTranslationsUpdated);
      window.removeEventListener('closePickers', handleClosePickers);
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - loadActiveView is stable from zustand

  return (
    <nav className="navigation-bar bg-scripture-surface/95 backdrop-blur-sm shadow-sm sticky top-0 z-20" data-nav-bar role="navigation" aria-label="Bible navigation">
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between relative">
        {/* Left side: Previous button and Translation selector */}
        <div className="flex items-center gap-2">
          {/* Previous button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              previousChapter();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onFocus={(e) => {
              e.preventDefault();
              e.currentTarget.blur();
            }}
            tabIndex={-1}
            disabled={!canGoPrevious()}
            className="p-2 rounded-xl hover:bg-scripture-elevated disabled:opacity-30
                       disabled:cursor-not-allowed transition-all duration-200 touch-target
                       hover:scale-105 active:scale-95 select-none"
            aria-label="Previous chapter"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Translation selector */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowTranslationPicker(!showTranslationPicker);
                setShowBookPicker(false);
                setShowChapterPicker(false);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onFocus={(e) => {
                e.preventDefault();
                e.currentTarget.blur();
              }}
              tabIndex={-1}
              className={`px-4 py-2 rounded-xl font-ui font-semibold text-sm transition-all duration-200
                         border border-scripture-border/30 touch-target min-w-[60px] h-[36px] flex items-center justify-center
                         select-none
                         ${showTranslationPicker
                           ? 'bg-scripture-accent text-scripture-bg shadow-md scale-105'
                           : 'hover:bg-scripture-elevated hover:border-scripture-border/50 hover:scale-105 active:scale-95'}`}
              aria-label={activeView && activeView.translationIds.length > 0
                ? `${activeView.translationIds.length} translation${activeView.translationIds.length !== 1 ? 's' : ''} selected. Click to change translations.`
                : 'Select translation'}
              aria-expanded={showTranslationPicker}
              aria-haspopup="listbox"
            >
              {activeView && activeView.translationIds.length > 0
                ? `${activeView.translationIds.length} Translation${activeView.translationIds.length !== 1 ? 's' : ''}`
                : 'Select Translation'}
            </button>

            {showTranslationPicker && (
              <TranslationPicker
                translations={translations}
                activeView={activeView}
                onSelect={async (translationId) => {
                  if (translationId && !translationId.includes('undefined')) {
                    // Always use multi-translation mode: add/remove from multi-translation view
                    if (activeView && activeView.translationIds.includes(translationId)) {
                      // Already selected - remove it
                      await removeTranslation(translationId);
                    } else {
                      // Check if we've reached the limit
                      if (activeView && activeView.translationIds.length >= 3) {
                        alert('Maximum of 3 translations allowed. Remove one first.');
                        return;
                      }
                      // Add to multi-translation view
                      await addTranslation(translationId);
                      // Also set as current module for backward compatibility
                      setCurrentModule(translationId);
                      
                      // Track as recent translation
                      try {
                        const prefs = await getPreferences();
                        const recent = prefs.recentTranslations || [];
                        // Remove if already exists, then add to front
                        const updatedRecent = [translationId, ...recent.filter(id => id !== translationId)].slice(0, 10);
                        await db.preferences.update('main', { recentTranslations: updatedRecent });
                      } catch (error) {
                        console.error('Failed to update recent translations:', error);
                      }
                    }
                  } else {
                    console.error('[NavigationBar] Invalid translation ID:', translationId);
                  }
                }}
                onClose={() => setShowTranslationPicker(false)}
              />
            )}
          </div>
        </div>

        {/* Center: Book, Chapter, Verse, Study selectors */}
        <div className="flex items-center justify-center gap-2">
          {/* Book selector */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowBookPicker(!showBookPicker);
                setShowChapterPicker(false);
                setShowTranslationPicker(false);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onFocus={(e) => {
                e.preventDefault();
                e.currentTarget.blur();
              }}
              tabIndex={-1}
              className={`px-4 py-2 rounded-xl font-ui font-semibold text-sm transition-all duration-200
                         border border-scripture-border/30 touch-target h-[36px] flex items-center justify-center
                         select-none
                         ${showBookPicker
                           ? 'bg-scripture-accent text-scripture-bg shadow-md scale-105'
                           : 'hover:bg-scripture-elevated hover:border-scripture-border/50 hover:scale-105 active:scale-95'}`}
              aria-label={`Current book: ${bookInfo?.name || currentBook}. Click to select a different book.`}
              aria-expanded={showBookPicker}
              aria-haspopup="listbox"
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowChapterPicker(!showChapterPicker);
                setShowBookPicker(false);
                setShowTranslationPicker(false);
                setShowVersePicker(false);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onFocus={(e) => {
                e.preventDefault();
                e.currentTarget.blur();
              }}
              tabIndex={-1}
              className={`px-4 py-2 rounded-xl font-ui font-semibold text-sm transition-all duration-200 min-w-[60px]
                         border border-scripture-border/30 touch-target h-[36px] flex items-center justify-center select-none
                         ${showChapterPicker
                           ? 'bg-scripture-accent text-scripture-bg shadow-md scale-105'
                           : 'hover:bg-scripture-elevated hover:border-scripture-border/50 hover:scale-105 active:scale-95'}`}
              aria-label={`Current chapter: ${currentChapter}. Click to select a different chapter.`}
              aria-expanded={showChapterPicker}
              aria-haspopup="listbox"
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

          {/* Verse selector */}
          {verseCount > 0 && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowVersePicker(!showVersePicker);
                  setShowBookPicker(false);
                  setShowChapterPicker(false);
                  setShowTranslationPicker(false);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onFocus={(e) => {
                  e.preventDefault();
                  e.currentTarget.blur();
                }}
                tabIndex={-1}
                className={`px-4 py-2 rounded-xl font-ui font-semibold text-sm transition-all duration-200 min-w-[60px]
                           border border-scripture-border/30 touch-target h-[36px] flex items-center justify-center
                           select-none
                           ${showVersePicker
                             ? 'bg-scripture-accent text-scripture-bg shadow-md scale-105'
                             : 'hover:bg-scripture-elevated hover:border-scripture-border/50 hover:scale-105 active:scale-95'}`}
                aria-label={`Current verse: ${currentVerse || 1}. Click to select a different verse.`}
                aria-expanded={showVersePicker}
                aria-haspopup="listbox"
              >
                {currentVerse || '1'}
              </button>

              {showVersePicker && verseCount > 0 && (
                <VersePicker
                  verseCount={verseCount}
                  currentVerse={currentVerse || 1}
                  onSelect={(verse) => {
                    setCurrentVerse(verse);
                    // Set nav-selected verse in store for highlighting
                    const { setNavSelectedVerse } = useBibleStore.getState();
                    setNavSelectedVerse(verse);
                    // Clear highlight after 3 seconds
                    setTimeout(() => {
                      setNavSelectedVerse(null);
                    }, 3000);
                    // Scroll to verse in the chapter view
                    const verseElement = document.querySelector(`[data-verse="${verse}"]`);
                    if (verseElement) {
                      verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    setShowVersePicker(false);
                  }}
                  onClose={() => setShowVersePicker(false)}
                />
              )}
            </div>
          )}
        </div>

        {/* Right side: Search and Next button */}
        <div className="flex items-center gap-2">
          {/* Search button */}
          <button
            data-nav-search
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowSearch(true);
              setShowTranslationPicker(false);
              setShowBookPicker(false);
              setShowChapterPicker(false);
              setShowVersePicker(false);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onFocus={(e) => {
              e.preventDefault();
              e.currentTarget.blur();
            }}
            tabIndex={-1}
            className={`p-2 rounded-xl transition-all duration-200 touch-target select-none
                       ${showSearch
                         ? 'bg-scripture-accent text-scripture-bg shadow-md scale-105'
                         : 'hover:bg-scripture-elevated hover:scale-105 active:scale-95'}`}
            aria-label="Search (Cmd/Ctrl+F)"
            title="Search (Cmd/Ctrl+F)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* Next button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              nextChapter();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onFocus={(e) => {
              e.preventDefault();
              e.currentTarget.blur();
            }}
            tabIndex={-1}
            disabled={!canGoNext()}
            className="p-2 rounded-xl hover:bg-scripture-elevated disabled:opacity-30
                       disabled:cursor-not-allowed transition-all duration-200 touch-target
                       hover:scale-105 active:scale-95 select-none"
            aria-label="Next chapter"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search Modal */}
      {showSearch && (
        <Search
          onClose={() => setShowSearch(false)}
          onNavigate={(book, chapter, verse) => {
            setLocation(book, chapter);
            setShowSearch(false);
            // Scroll to verse if specified
            if (verse) {
              setTimeout(() => {
                const verseElement = document.querySelector(`[data-verse="${verse}"]`);
                if (verseElement) {
                  verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 100);
            }
          }}
        />
      )}
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
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pickerRef.current) {
      // Find the button that opened this picker
      const button = pickerRef.current.closest('.relative')?.querySelector('button') as HTMLElement;
      if (button) {
        const buttonRect = button.getBoundingClientRect();
        const pickerWidth = 340;
        const viewportWidth = window.innerWidth;
        // Center relative to button, but constrain to viewport
        const left = buttonRect.left + (buttonRect.width / 2) - (pickerWidth / 2);
        const constrainedLeft = Math.max(1, Math.min(left, viewportWidth - pickerWidth - 1));
        const top = buttonRect.bottom + 8; // mt-2 = 8px
        
        pickerRef.current.style.position = 'fixed';
        pickerRef.current.style.left = `${constrainedLeft}px`;
        pickerRef.current.style.top = `${top}px`;
        pickerRef.current.style.transform = 'none';
      }
    }
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* Picker */}
      <div 
        ref={pickerRef}
        className="z-50 bg-scripture-surface rounded-2xl shadow-2xl
                    max-h-[70vh] overflow-hidden backdrop-blur-sm"
        style={{ 
          width: '340px',
          maxWidth: 'min(340px, calc(100vw - 2rem))'
        }}
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
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pickerRef.current) {
      const button = pickerRef.current.closest('.relative')?.querySelector('button') as HTMLElement;
      if (button) {
        const buttonRect = button.getBoundingClientRect();
        const pickerWidth = 280;
        const viewportWidth = window.innerWidth;
        const left = buttonRect.left + (buttonRect.width / 2) - (pickerWidth / 2);
        const constrainedLeft = Math.max(1, Math.min(left, viewportWidth - pickerWidth - 1));
        const top = buttonRect.bottom + 8;
        
        pickerRef.current.style.position = 'fixed';
        pickerRef.current.style.left = `${constrainedLeft}px`;
        pickerRef.current.style.top = `${top}px`;
        pickerRef.current.style.transform = 'none';
      }
    }
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      
      {/* Picker */}
      <div 
        ref={pickerRef}
        className="z-50 bg-scripture-surface rounded-2xl shadow-2xl
                    max-h-[50vh] overflow-hidden backdrop-blur-sm"
        style={{ 
          width: '280px',
          maxWidth: 'min(280px, calc(100vw - 2rem))'
        }}
      >
        <div className="overflow-y-auto max-h-[50vh] custom-scrollbar p-4">
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

interface TranslationPickerProps {
  translations: ApiTranslation[];
  activeView?: { translationIds: string[] } | null;
  onSelect: (translationId: string) => void;
  onClose: () => void;
}

function TranslationPicker({ 
  translations, 
  activeView,
  onSelect, 
  onClose 
}: TranslationPickerProps) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<string[]>([]);
  const [userLanguage, setUserLanguage] = useState<string>('en');
  
  // Load favorites, recent, and detect user language
  useEffect(() => {
    async function loadData() {
      try {
        const prefs = await getPreferences();
        setFavorites(new Set(prefs.favoriteTranslations || []));
        setRecent(prefs.recentTranslations || []);
        
        // Detect user's browser language
        const browserLang = navigator.language || navigator.languages?.[0] || 'en';
        const langCode = browserLang.split('-')[0].toLowerCase();
        setUserLanguage(langCode);
      } catch (error) {
        console.error('Failed to load translation preferences:', error);
      }
    }
    loadData();
  }, []);
  
  // Toggle favorite
  const toggleFavorite = async (translationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const prefs = await getPreferences();
      const currentFavorites = prefs.favoriteTranslations || [];
      const isFavorite = currentFavorites.includes(translationId);
      const updatedFavorites = isFavorite
        ? currentFavorites.filter(id => id !== translationId)
        : [...currentFavorites, translationId];
      
      await db.preferences.update('main', { favoriteTranslations: updatedFavorites });
      setFavorites(new Set(updatedFavorites));
    } catch (error) {
      console.error('Failed to update favorites:', error);
    }
  };
  
  // Create translation map for quick lookup
  const translationMap = new Map(translations.map(t => [t.id, t]));
  
  // Get favorite and recent translations
  const favoriteTranslations = Array.from(favorites)
    .map(id => translationMap.get(id))
    .filter((t): t is ApiTranslation => t !== undefined);
  
  const recentTranslations = recent
    .map(id => translationMap.get(id))
    .filter((t): t is ApiTranslation => t !== undefined)
    .filter(t => !favorites.has(t.id)); // Exclude favorites from recent
  
  // Group remaining translations by language
  const remainingTranslations = translations.filter(
    t => !favorites.has(t.id) && !recent.includes(t.id)
  );
  
  const translationsByLanguage = new Map<string, ApiTranslation[]>();
  for (const translation of remainingTranslations) {
    const lang = translation.language || 'Unknown';
    if (!translationsByLanguage.has(lang)) {
      translationsByLanguage.set(lang, []);
    }
    translationsByLanguage.get(lang)!.push(translation);
  }
  
  // Sort languages: user's language first, then alphabetically
  const sortedLanguages = Array.from(translationsByLanguage.keys()).sort((a, b) => {
    if (a.toLowerCase() === userLanguage) return -1;
    if (b.toLowerCase() === userLanguage) return 1;
    return a.localeCompare(b);
  });

  const selectedInMultiView = activeView?.translationIds || [];

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* Picker */}
      <div className="absolute top-full left-0 mt-2 z-50
                      bg-scripture-surface rounded-2xl shadow-2xl
                      w-[400px] max-w-[min(400px,calc(100vw-2rem))] max-h-[70vh] overflow-hidden animate-scale-in-dropdown backdrop-blur-sm">
        <div className="overflow-y-auto max-h-[70vh] custom-scrollbar p-4">
          {/* Selected translations header */}
          {selectedInMultiView.length > 0 && (
            <div className="mb-4 pb-4 border-b border-scripture-border/30">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-scripture-text">
                  Selected Translations ({selectedInMultiView.length}/3)
                </div>
                <button
                  onClick={async () => {
                    if (confirm('Clear all selected translations?')) {
                      await useMultiTranslationStore.getState().clearView();
                    }
                  }}
                  className="text-xs text-highlight-red hover:text-highlight-red/80 transition-colors"
                >
                  Clear All
                </button>
              </div>
              
              {/* Show selected translations */}
              <div className="space-y-1.5">
                {selectedInMultiView.map((id) => {
                  const translation = translationMap.get(id);
                  if (!translation) return null;
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between px-3 py-2 bg-scripture-elevated rounded-lg"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm font-medium text-scripture-text truncate">
                          {translation.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => onSelect(id)}
                          className="text-xs px-2 py-1 text-highlight-red hover:text-highlight-red/80 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {translations.length > 0 ? (
            <>
              {/* Favorites Section */}
              {favoriteTranslations.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Favorites
                  </h4>
                  <div className="space-y-1.5">
                    {favoriteTranslations.map((translation) => (
                      <TranslationButton
                        key={`favorite-${translation.id}`}
                        translation={translation}
                        isSelected={selectedInMultiView.includes(translation.id)}
                        isFavorite={true}
                        isMultiMode={true}
                        selectedCount={selectedInMultiView.length}
                        onSelect={onSelect}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Recent Section */}
              {recentTranslations.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Recent
                  </h4>
                  <div className="space-y-1.5">
                    {recentTranslations.map((translation) => (
                      <TranslationButton
                        key={`recent-${translation.id}`}
                        translation={translation}
                        isSelected={selectedInMultiView.includes(translation.id)}
                        isFavorite={favorites.has(translation.id)}
                        isMultiMode={true}
                        selectedCount={selectedInMultiView.length}
                        onSelect={onSelect}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Languages Section */}
              {sortedLanguages.map((language) => {
                const langTranslations = translationsByLanguage.get(language)!;
                const isUserLanguage = language.toLowerCase() === userLanguage;
                return (
                  <div key={language} className="mb-6 last:mb-0">
                    <h4 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-3">
                      {language}
                      {isUserLanguage && (
                        <span className="ml-2 text-xs normal-case text-scripture-accent">(Your Language)</span>
                      )}
                    </h4>
                    <div className="space-y-1.5">
                      {langTranslations.map((translation) => (
                        <TranslationButton
                          key={`${language}-${translation.id}`}
                          translation={translation}
                          isSelected={selectedInMultiView.includes(translation.id)}
                          isFavorite={favorites.has(translation.id)}
                          isMultiMode={true}
                          selectedCount={selectedInMultiView.length}
                          onSelect={onSelect}
                          onToggleFavorite={toggleFavorite}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="text-center py-4 text-scripture-muted text-xs">
              No translations available. Configure API keys in settings.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

interface TranslationButtonProps {
  translation: ApiTranslation;
  isSelected: boolean;
  isFavorite: boolean;
  isMultiMode?: boolean;
  selectedCount?: number;
  onSelect: (translationId: string) => void;
  onToggleFavorite: (translationId: string, e: React.MouseEvent) => void;
}

function TranslationButton({ 
  translation, 
  isSelected, 
  isFavorite, 
  isMultiMode = true,
  selectedCount = 0,
  onSelect, 
  onToggleFavorite 
}: TranslationButtonProps) {
  // Disable if already have 3 selected and this one isn't selected
  const isDisabled = isMultiMode && !isSelected && selectedCount >= 3;
  
  return (
    <div
      className={`w-full px-3 py-2 rounded-lg transition-all duration-200 group
                ${isSelected 
                  ? 'bg-scripture-accent text-scripture-bg shadow-sm' 
                  : 'hover:bg-scripture-elevated hover:shadow-sm'}
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => onSelect(translation.id)}
          disabled={isDisabled}
          className="flex-1 min-w-0 text-left text-sm font-ui flex items-center gap-2"
          title={translation.description || translation.name}
        >
          {isMultiMode && (
            <div className="flex-shrink-0 w-4 h-4 border-2 rounded border-current flex items-center justify-center">
              {isSelected && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate flex items-center gap-2">
              {translation.name}
            </div>
            {translation.description && translation.description !== translation.name && (
              <div className={`text-xs truncate mt-0.5 ${
                isSelected ? 'text-scripture-bg/80' : 'text-scripture-muted'
              }`}>
                {translation.description}
              </div>
            )}
          </div>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`text-xs font-mono ${
            isSelected ? 'text-scripture-bg/80' : 'text-scripture-muted'
          }`}>
            {translation.abbreviation}
          </div>
          <button
            onClick={(e) => onToggleFavorite(translation.id, e)}
            className={`p-1 rounded transition-colors ${
              isFavorite 
                ? 'text-yellow-500' 
                : isSelected
                  ? 'text-scripture-bg/60 opacity-100'
                  : 'text-scripture-muted opacity-0 group-hover:opacity-100'
            }`}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            type="button"
          >
            <svg className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

interface VersePickerProps {
  verseCount: number;
  currentVerse: number;
  onSelect: (verse: number) => void;
  onClose: () => void;
}

function VersePicker({ verseCount, currentVerse, onSelect, onClose }: VersePickerProps) {
  const verseNumbers = Array.from({ length: verseCount }, (_, i) => i + 1);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pickerRef.current) {
      const button = pickerRef.current.closest('.relative')?.querySelector('button') as HTMLElement;
      if (button) {
        const buttonRect = button.getBoundingClientRect();
        const pickerWidth = 320;
        const viewportWidth = window.innerWidth;
        const left = buttonRect.left + (buttonRect.width / 2) - (pickerWidth / 2);
        const constrainedLeft = Math.max(1, Math.min(left, viewportWidth - pickerWidth - 1));
        const top = buttonRect.bottom + 8;
        
        pickerRef.current.style.position = 'fixed';
        pickerRef.current.style.left = `${constrainedLeft}px`;
        pickerRef.current.style.top = `${top}px`;
        pickerRef.current.style.transform = 'none';
      }
    }
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* Picker */}
      <div 
        ref={pickerRef}
        className="z-50 bg-scripture-surface rounded-2xl shadow-2xl
                    max-h-[50vh] overflow-hidden backdrop-blur-sm"
        style={{ 
          width: '320px',
          maxWidth: 'min(320px, calc(100vw - 2rem))'
        }}
      >
        <div className="overflow-y-auto max-h-[50vh] custom-scrollbar p-4">
          <div className="grid grid-cols-8 gap-1.5">
            {verseNumbers.map((num) => (
              <button
                key={num}
                onClick={() => onSelect(num)}
                className={`w-9 h-9 text-xs font-ui rounded-lg transition-all duration-200
                          ${num === currentVerse 
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

