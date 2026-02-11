/**
 * Navigation Bar Component
 * 
 * Translation, book and chapter selection, with prev/next navigation.
 */

import { useState, useEffect, useRef } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { getBookById } from '@/types/bible';
import { getAllTranslations, type ApiTranslation } from '@/lib/bible-api';
import { getPreferences } from '@/lib/database';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { Search } from '@/components/Search';
import { SyncStatusIndicator } from '@/components/shared';
import { TranslationPicker, UnifiedPicker } from './pickers';
export function NavigationBar() {
  const {
    currentBook,
    currentChapter,
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
  const [showUnifiedPicker, setShowUnifiedPicker] = useState(false);

  // Create refs for trigger buttons
  const translationButtonRef = useRef<HTMLButtonElement>(null);
  const referenceButtonRef = useRef<HTMLButtonElement>(null);

  // Lock scroll when any picker is open (but not for dropdowns - they use lockScroll: false in useModal)
  const anyPickerOpen = showBookPicker || showChapterPicker || showVersePicker || showTranslationPicker || showUnifiedPicker;
  // Note: Individual pickers use useModal with lockScroll: false, so scroll locking here is optional
  // Keeping this commented for now as dropdowns shouldn't lock scroll
  // useScrollLock(anyPickerOpen);
  const [showSearch, setShowSearch] = useState(false);

  const [translations, setTranslations] = useState<ApiTranslation[]>([]);
  const [currentVerse, setCurrentVerse] = useState<number | null>(null);
  
  const { activeView, loadActiveView, addTranslation, removeTranslation } = useMultiTranslationStore();

  const bookInfo = getBookById(currentBook);
  
  // Get translation abbreviation for display
  const getTranslationAbbrev = () => {
    if (!activeView || activeView.translationIds.length === 0) return 'Select';
    if (activeView.translationIds.length === 1) {
      const trans = translations.find(t => t.id === activeView.translationIds[0]);
      return trans?.abbreviation || trans?.id?.toUpperCase() || 'Bible';
    }
    return `${activeView.translationIds.length}`;
  };
  
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
      setShowUnifiedPicker(false);
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
      <nav className="navigation-bar bg-scripture-surface/80 backdrop-blur-md shadow-sm sticky top-0 z-[45]
                      pt-safe-top pl-safe-left pr-safe-right" data-nav-bar role="navigation" aria-label="Bible navigation">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-2.5 flex items-center justify-between gap-1 sm:gap-2 relative">
        {/* Left side: Previous button and Translation selector */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
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
            className="p-2 rounded-lg hover:bg-scripture-elevated disabled:opacity-30
                       disabled:cursor-not-allowed transition-all duration-200 touch-target
                       select-none"
            aria-label="Previous chapter"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Translation selector - abbreviation only */}
          <div className="relative">
            <button
              ref={translationButtonRef}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowTranslationPicker(!showTranslationPicker);
                setShowBookPicker(false);
                setShowChapterPicker(false);
                setShowUnifiedPicker(false);
                setShowSearch(false);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className={`px-2.5 sm:px-3 py-2 rounded-lg font-ui font-semibold text-sm transition-all duration-200
                         border border-scripture-border/30 touch-target h-[36px] flex items-center justify-center gap-1.5
                         select-none min-w-[44px]
                         ${showTranslationPicker
                           ? 'bg-scripture-accent text-scripture-bg shadow-md'
                           : 'hover:bg-scripture-elevated hover:border-scripture-border/50'}`}
              aria-label={activeView && activeView.translationIds.length > 0
                ? `${activeView.translationIds.length} translation${activeView.translationIds.length !== 1 ? 's' : ''} selected. Click to change translations.`
                : 'Select translation'}
              aria-expanded={showTranslationPicker}
              aria-haspopup="listbox"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="hidden sm:inline">{getTranslationAbbrev()}</span>
            </button>
          </div>
        </div>

        {/* Center: Combined reference button (Book Chapter:Verse) - absolutely positioned for true centering */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
          <button
            ref={referenceButtonRef}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowUnifiedPicker(!showUnifiedPicker);
              setShowTranslationPicker(false);
              setShowBookPicker(false);
              setShowChapterPicker(false);
              setShowVersePicker(false);
              setShowSearch(false);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={`px-3 sm:px-4 py-2 rounded-lg font-ui font-semibold text-sm transition-all duration-200
                       border border-scripture-border/30 touch-target h-[36px] flex items-center justify-center gap-1.5
                       select-none whitespace-nowrap
                       ${showUnifiedPicker
                         ? 'bg-scripture-accent text-scripture-bg shadow-md'
                         : 'hover:bg-scripture-elevated hover:border-scripture-border/50'}`}
            aria-label={`Current location: ${bookInfo?.name || currentBook} ${currentChapter}:${currentVerse || 1}. Click to navigate.`}
            aria-expanded={showUnifiedPicker}
            aria-haspopup="dialog"
          >
            <span className="truncate">{bookInfo?.name || currentBook} {currentChapter}:{currentVerse || 1}</span>
            <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Right side: Sync status, Search and Next button */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <SyncStatusIndicator compact className="flex-shrink-0" />
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
              setShowUnifiedPicker(false);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={`p-2 rounded-lg transition-all duration-200 touch-target select-none
                       ${showSearch
                         ? 'bg-scripture-accent text-scripture-bg shadow-md'
                         : 'hover:bg-scripture-elevated'}`}
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
            className="p-2 rounded-lg hover:bg-scripture-elevated disabled:opacity-30
                       disabled:cursor-not-allowed transition-all duration-200 touch-target
                       select-none"
            aria-label="Next chapter"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      </nav>

      {/* Search Modal - rendered outside nav to escape backdrop-blur stacking context */}
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

      {/* TranslationPicker - rendered outside nav to escape backdrop-blur stacking context */}
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
                  const { updatePreferences } = await import('@/lib/database');
                  await updatePreferences({ recentTranslations: updatedRecent });
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

      {/* UnifiedPicker - rendered outside nav to escape backdrop-blur stacking context */}
      {showUnifiedPicker && (
        <UnifiedPicker
          currentBook={currentBook}
          currentChapter={currentChapter}
          currentVerse={currentVerse || 1}
          onSelect={(bookId, chapter, verse) => {
            const { setNavSelectedVerse } = useBibleStore.getState();
            setLocation(bookId, chapter);
            setShowUnifiedPicker(false);
            // Scroll to verse and highlight if specified
            if (verse) {
              // Set highlight
              setNavSelectedVerse(verse);
              // Clear highlight after 3 seconds
              setTimeout(() => {
                setNavSelectedVerse(null);
              }, 3000);
              // Scroll to verse
              setTimeout(() => {
                const verseElement = document.querySelector(`[data-verse="${verse}"]`);
                if (verseElement) {
                  verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 100);
            }
          }}
          onClose={() => setShowUnifiedPicker(false)}
        />
      )}
    </>
  );
}

