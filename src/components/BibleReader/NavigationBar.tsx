/**
 * Navigation Bar Component
 * 
 * Translation, book and chapter selection, with prev/next navigation.
 */

import { useState, useEffect, useRef } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { getBookById, getVerseCount } from '@/types/bible';
import { getAllTranslations, type ApiTranslation } from '@/lib/bible-api';
import { getPreferences, db } from '@/lib/db';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { Search } from '@/components/Search';
import { BookPicker, ChapterPicker, VersePicker, TranslationPicker } from './pickers';
import { useScrollLock } from '@/hooks/useScrollLock';

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

  // Create refs for trigger buttons
  const bookButtonRef = useRef<HTMLButtonElement>(null);
  const chapterButtonRef = useRef<HTMLButtonElement>(null);
  const verseButtonRef = useRef<HTMLButtonElement>(null);
  const translationButtonRef = useRef<HTMLButtonElement>(null);

  // Lock scroll when any picker is open (but not for dropdowns - they use lockScroll: false in useModal)
  const anyPickerOpen = showBookPicker || showChapterPicker || showVersePicker || showTranslationPicker;
  // Note: Individual pickers use useModal with lockScroll: false, so scroll locking here is optional
  // Keeping this commented for now as dropdowns shouldn't lock scroll
  // useScrollLock(anyPickerOpen);
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
    <>
      {/* Hide focus outlines and remove backdrop blur from nav when modals are open */}
      {anyPickerOpen || showSearch ? (
        <style>{`
          [data-nav-bar] button:focus-visible,
          [data-nav-bar] button:focus {
            outline: none !important;
          }
        `}</style>
      ) : null}
      <nav className={`navigation-bar bg-scripture-surface/95 shadow-sm sticky top-0 z-[45] ${anyPickerOpen || showSearch ? '' : 'backdrop-blur-sm'}`} data-nav-bar role="navigation" aria-label="Bible navigation">
        <div className="max-w-4xl mx-auto px-4 py-2.5 grid grid-cols-3 items-center relative">
        {/* Left side: Previous button and Translation selector */}
        <div className="flex items-center gap-2 justify-start">
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
              ref={translationButtonRef}
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
        <div className="flex items-center justify-center gap-2 col-start-2">
          {/* Book selector */}
          <div className="relative">
            <button
              ref={bookButtonRef}
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
                triggerRef={bookButtonRef}
              />
            )}
          </div>

          {/* Chapter selector */}
          <div className="relative">
            <button
              ref={chapterButtonRef}
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
                triggerRef={chapterButtonRef}
              />
            )}
          </div>

          {/* Verse selector */}
          {verseCount > 0 && (
            <div className="relative">
              <button
                ref={verseButtonRef}
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
                  triggerRef={verseButtonRef}
                />
              )}
            </div>
          )}
        </div>

        {/* Right side: Search and Next button */}
        <div className="flex items-center gap-2 justify-end">
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
    </>
  );
}

