/**
 * Navigation Bar Component
 * 
 * Translation, book and chapter selection, with prev/next navigation.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { getBookById } from '@/types';
import { getAllTranslations, type ApiTranslation } from '@/lib/bible-api';
import { getPreferences } from '@/lib/database';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { Search } from '@/components/Search';
import { TranslationPicker, UnifiedPicker } from './pickers';
import { ExportPopover } from './ExportPopover';
import {
  ToolbarPopover,
  SyncDetailsPanel,
  useSyncStatus,
  syncNeedsAttention,
  getStatusColorClass,
} from '@/components/shared';
export function NavigationBar() {
  const {
    currentBook,
    currentChapter,
    setLocation,
    setNavSelectedVerse,
    setCurrentModule,
    nextChapter,
    previousChapter,
    goBack,
    canGoNext,
    canGoPrevious,
    canGoBack,
  } = useBibleStore();

  const [showBookPicker, setShowBookPicker] = useState(false);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const [showTranslationPicker, setShowTranslationPicker] = useState(false);
  const [showVersePicker, setShowVersePicker] = useState(false);
  const [showUnifiedPicker, setShowUnifiedPicker] = useState(false);
  const [showExportPopover, setShowExportPopover] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showSyncDetails, setShowSyncDetails] = useState(false);

  // Create refs for trigger buttons
  const translationButtonRef = useRef<HTMLButtonElement>(null);
  const referenceButtonRef = useRef<HTMLButtonElement>(null);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);

  // Sync state drives the overflow-menu attention dot + details panel.
  const { status: syncStatus, isSyncing: syncIsSyncing, handleSync: syncHandleSync } = useSyncStatus();
  const syncAvailable = !!syncStatus && syncStatus.state !== 'disabled';
  const showSyncDot = syncAvailable && syncNeedsAttention(syncStatus.state);

  // Lock scroll when any picker is open (but not for dropdowns - they use lockScroll: false in useModal)
  const anyPickerOpen = showBookPicker || showChapterPicker || showVersePicker || showTranslationPicker || showUnifiedPicker || showExportPopover || showOverflowMenu || showSyncDetails;
  // Note: Individual pickers use useModal with lockScroll: false, so scroll locking here is optional
  // Keeping this commented for now as dropdowns shouldn't lock scroll
  // useScrollLock(anyPickerOpen);
  const [showSearch, setShowSearch] = useState(false);

  const [translations, setTranslations] = useState<ApiTranslation[]>([]);
  const [currentVerse, setCurrentVerse] = useState<number | null>(null);
  
  const { activeView, loadActiveView, addTranslation, removeTranslation } = useMultiTranslationStore();
  const chaptersByTranslation = useMultiTranslationStore((s) => s.chaptersByTranslation);
  const fallbackChapter = useBibleStore((s) => s.chapter);

  const primaryTranslationId = useMemo(() => {
    const ids = activeView?.translationIds;
    if (!ids || ids.length === 0) return useBibleStore.getState().currentModuleId;
    return ids[0];
  }, [activeView?.translationIds]);

  const exportTranslation = useMemo(
    () => translations.find((t) => t.id === primaryTranslationId) ?? null,
    [translations, primaryTranslationId],
  );

  const exportChapter = useMemo(() => {
    if (!primaryTranslationId) return null;
    const fromMulti = chaptersByTranslation[primaryTranslationId];
    if (fromMulti && fromMulti.book === currentBook && fromMulti.chapter === currentChapter) {
      return fromMulti;
    }
    if (fallbackChapter && fallbackChapter.book === currentBook && fallbackChapter.chapter === currentChapter) {
      return fallbackChapter;
    }
    return null;
  }, [chaptersByTranslation, primaryTranslationId, fallbackChapter, currentBook, currentChapter]);

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
  
  // Seed the displayed verse from loaded chapter data — but only when the
  // loaded chapter actually matches the current location. On chapter change
  // the new chapter is fetched async, so the store may still hold the previous
  // chapter; using it here would show a stray (often out-of-range) verse like
  // "John 15:43". Hold at verse 1 until the matching chapter is loaded.
  const locationKey = `${currentBook}:${currentChapter}`;
  const [prevLocationKey, setPrevLocationKey] = useState(locationKey);
  if (locationKey !== prevLocationKey) {
    setPrevLocationKey(locationKey);
    const { chapter } = useBibleStore.getState();
    if (
      chapter &&
      chapter.book === currentBook &&
      chapter.chapter === currentChapter &&
      chapter.verses.length > 0
    ) {
      setCurrentVerse(chapter.verses[0]?.ref.verse ?? 1);
    } else {
      setCurrentVerse(1);
    }
  }

  // Track scroll position to update current verse
  useEffect(() => {
    const handleScroll = () => {
      // Don't update verse when pickers are open to prevent text jumping
      if (showBookPicker || showChapterPicker || showVersePicker || showTranslationPicker) {
        return;
      }

      // Ignore the DOM while it still shows a stale chapter (async fetch in
      // flight) — its verse elements can exceed the new chapter's range.
      const { chapter } = useBibleStore.getState();
      if (!chapter || chapter.book !== currentBook || chapter.chapter !== currentChapter) {
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
        // Clamp to the loaded chapter's actual verse range as a final guard
        // against any stray out-of-range verse element.
        const maxVerse = chapter.verses.reduce((m, v) => Math.max(m, v.ref.verse), 0);
        setCurrentVerse(maxVerse > 0 ? Math.min(closestVerse, maxVerse) : closestVerse);
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
      const prefs = await getPreferences();
      const langFilter = prefs.translationLanguageFilter;
      if (langFilter && langFilter.length > 0) {
        setTranslations(available.filter(t => langFilter.includes(t.language ?? 'en')));
      } else {
        setTranslations(available);
      }
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
      setShowOverflowMenu(false);
      setShowSyncDetails(false);
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

  const closeAllPanels = () => {
    setShowTranslationPicker(false);
    setShowBookPicker(false);
    setShowChapterPicker(false);
    setShowVersePicker(false);
    setShowUnifiedPicker(false);
    setShowOverflowMenu(false);
    setShowExportPopover(false);
    setShowSyncDetails(false);
    setShowSearch(false);
  };

  const openSearch = () => { closeAllPanels(); setShowSearch(true); };
  const openExport = () => { closeAllPanels(); setShowExportPopover(true); };
  const openSync = () => { closeAllPanels(); setShowSyncDetails(true); };

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
          {/* Back button (visible when there's navigation history) */}
          {canGoBack() && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                goBack();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="p-2 rounded-lg hover:bg-scripture-elevated transition-all duration-200 touch-target
                         select-none text-scripture-accent"
              aria-label="Go back"
              title="Go back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
            </button>
          )}
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
                const next = !showTranslationPicker;
                closeAllPanels();
                setShowTranslationPicker(next);
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
              aria-haspopup="dialog"
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
              const next = !showUnifiedPicker;
              closeAllPanels();
              setShowUnifiedPicker(next);
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

        {/* Right side: Search (desktop), overflow menu, and Next */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {/* Search — visible on desktop; folded into the ⋯ menu on phone */}
          <button
            data-nav-search
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openSearch();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={`hidden sm:inline-flex p-2 rounded-lg transition-all duration-200 touch-target select-none
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

          {/* Overflow menu — secondary actions (export, sync, and search on phone) */}
          <button
            ref={overflowButtonRef}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const next = !showOverflowMenu;
              closeAllPanels();
              setShowOverflowMenu(next);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={`relative p-2 rounded-lg transition-all duration-200 touch-target select-none
                       ${showOverflowMenu
                         ? 'bg-scripture-accent text-scripture-bg shadow-md'
                         : 'hover:bg-scripture-elevated'}`}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={showOverflowMenu}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
            {showSyncDot && syncStatus && (
              <span
                className={`absolute top-1 right-1 w-2 h-2 rounded-full bg-current ring-2 ring-scripture-surface
                           ${getStatusColorClass(syncStatus.state)}`}
                aria-hidden="true"
              />
            )}
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
            // Highlight verse and scroll (like UnifiedPicker) - set after setLocation since it clears navSelectedVerse
            if (verse) {
              setNavSelectedVerse(verse);
              setTimeout(() => setNavSelectedVerse(null), 3000);
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
          triggerRef={translationButtonRef}
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
          triggerRef={referenceButtonRef}
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

      {/* Overflow menu — secondary actions, anchored under the ⋯ button */}
      {showOverflowMenu && (
        <ToolbarPopover
          triggerRef={overflowButtonRef}
          alignment="right"
          width={232}
          label="More actions"
          onClose={() => setShowOverflowMenu(false)}
          panelClassName="py-1"
        >
          <div role="menu" aria-label="More actions">
            {/* Search — only here on phone; on desktop it sits on the bar */}
            <button
              role="menuitem"
              onClick={openSearch}
              className="sm:hidden w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                         text-scripture-text hover:bg-scripture-elevated transition-colors min-h-[44px]"
            >
              <svg className="w-5 h-5 flex-shrink-0 text-scripture-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
            </button>

            <button
              role="menuitem"
              onClick={openExport}
              disabled={!exportTranslation || !exportChapter}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                         text-scripture-text hover:bg-scripture-elevated transition-colors min-h-[44px]
                         disabled:opacity-40 disabled:cursor-not-allowed"
              title="Export this page (print, save as PDF, or copy)"
            >
              <svg className="w-5 h-5 flex-shrink-0 text-scripture-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" />
              </svg>
              Export page…
            </button>

            {syncAvailable && (
              <button
                role="menuitem"
                onClick={openSync}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                           text-scripture-text hover:bg-scripture-elevated transition-colors min-h-[44px]"
              >
                <span className={`relative flex-shrink-0 ${getStatusColorClass(syncStatus.state)}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {showSyncDot && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-current ring-2 ring-scripture-surface" aria-hidden="true" />
                  )}
                </span>
                Sync &amp; account
              </button>
            )}
          </div>
        </ToolbarPopover>
      )}

      {/* ExportPopover - chapter/range export to Print, PDF, or clipboard */}
      {showExportPopover && exportTranslation && exportChapter && (
        <ExportPopover
          triggerRef={overflowButtonRef}
          translation={exportTranslation}
          book={exportChapter.book}
          chapter={exportChapter.chapter}
          verses={exportChapter.verses}
          onClose={() => setShowExportPopover(false)}
        />
      )}

      {/* SyncDetailsPanel - opened from the ⋯ menu, anchored under the ⋯ button */}
      {showSyncDetails && syncStatus && (
        <SyncDetailsPanel
          status={syncStatus}
          onClose={() => setShowSyncDetails(false)}
          onSync={syncHandleSync}
          isSyncing={syncIsSyncing}
          triggerRef={overflowButtonRef}
        />
      )}
    </>
  );
}

