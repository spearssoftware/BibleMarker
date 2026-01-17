/**
 * Navigation Bar Component
 * 
 * Translation, book and chapter selection, with prev/next navigation.
 */

import { useState, useEffect } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { getBookById, getOTBooks, getNTBooks, getVerseCount } from '@/types/bible';
import { getAllTranslations, type ApiTranslation } from '@/lib/bible-api';
import { getPreferences, db } from '@/lib/db';

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
  const [translations, setTranslations] = useState<ApiTranslation[]>([]);
  const [currentVerse, setCurrentVerse] = useState<number | null>(null);

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
  }, [currentBook, currentChapter]);

  useEffect(() => {
    async function loadTranslations() {
      const available = await getAllTranslations();
      setTranslations(available);
    }
    loadTranslations();
  }, []);

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

        {/* Translation, book and chapter selector */}
        <div className="flex items-center gap-2">
          {/* Translation selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowTranslationPicker(!showTranslationPicker);
                setShowBookPicker(false);
                setShowChapterPicker(false);
              }}
              className="px-3 py-2 rounded-xl bg-scripture-elevated hover:bg-scripture-border
                         font-ui font-semibold text-xs transition-all duration-200
                         border border-scripture-border/30 hover:border-scripture-border/50
                         shadow-sm hover:shadow min-w-[60px]"
            >
              {currentTranslation?.abbreviation || currentModuleId || 'KJV'}
            </button>

            {showTranslationPicker && (
              <TranslationPicker
                translations={translations}
                currentTranslationId={currentModuleId}
                onSelect={async (translationId) => {
                  console.log('[NavigationBar] Translation selected:', translationId);
                  if (translationId && !translationId.includes('undefined')) {
                    setCurrentModule(translationId);
                    setShowTranslationPicker(false);
                    
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
                  } else {
                    console.error('[NavigationBar] Invalid translation ID:', translationId);
                  }
                }}
                onClose={() => setShowTranslationPicker(false)}
              />
            )}
          </div>

          {/* Book selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowBookPicker(!showBookPicker);
                setShowChapterPicker(false);
                setShowTranslationPicker(false);
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
                setShowTranslationPicker(false);
                setShowVersePicker(false);
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

          {/* Verse selector */}
          {verseCount > 0 && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowVersePicker(!showVersePicker);
                  setShowBookPicker(false);
                  setShowChapterPicker(false);
                  setShowTranslationPicker(false);
                }}
                className="px-3 py-2 rounded-xl bg-scripture-elevated hover:bg-scripture-border
                           font-ui font-semibold text-xs transition-all duration-200 min-w-[50px]
                           border border-scripture-border/30 hover:border-scripture-border/50
                           shadow-sm hover:shadow"
              >
                {currentVerse || '1'}
              </button>

              {showVersePicker && verseCount > 0 && (
                <VersePicker
                  verseCount={verseCount}
                  currentVerse={currentVerse || 1}
                  onSelect={(verse) => {
                    setCurrentVerse(verse);
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

interface TranslationPickerProps {
  translations: ApiTranslation[];
  currentTranslationId: string | null;
  onSelect: (translationId: string) => void;
  onClose: () => void;
}

function TranslationPicker({ translations, currentTranslationId, onSelect, onClose }: TranslationPickerProps) {
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
                      w-[400px] max-h-[70vh] overflow-hidden animate-scale-in backdrop-blur-sm">
        <div className="overflow-y-auto max-h-[70vh] custom-scrollbar p-4">
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
                        isSelected={translation.id === currentTranslationId}
                        isFavorite={true}
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
                        isSelected={translation.id === currentTranslationId}
                        isFavorite={favorites.has(translation.id)}
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
                          isSelected={translation.id === currentTranslationId}
                          isFavorite={favorites.has(translation.id)}
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
  onSelect: (translationId: string) => void;
  onToggleFavorite: (translationId: string, e: React.MouseEvent) => void;
}

function TranslationButton({ translation, isSelected, isFavorite, onSelect, onToggleFavorite }: TranslationButtonProps) {
  return (
    <button
      onClick={() => onSelect(translation.id)}
      className={`w-full px-3 py-2 text-left text-sm font-ui rounded-lg transition-all duration-200 group
                ${isSelected 
                  ? 'bg-scripture-accent text-scripture-bg shadow-sm' 
                  : 'hover:bg-scripture-elevated hover:shadow-sm'}`}
      title={translation.description || translation.name}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{translation.name}</div>
          {translation.description && translation.description !== translation.name && (
            <div className="text-xs text-scripture-muted truncate mt-0.5">
              {translation.description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-xs font-mono text-scripture-muted">
            {translation.abbreviation}
          </div>
          <button
            onClick={(e) => onToggleFavorite(translation.id, e)}
            className={`p-1 rounded transition-colors ${
              isFavorite 
                ? 'text-yellow-500' 
                : 'text-scripture-muted opacity-0 group-hover:opacity-100'
            }`}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <svg className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
        </div>
      </div>
    </button>
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
                      w-[320px] max-h-[50vh] overflow-hidden animate-scale-in backdrop-blur-sm">
        <div className="overflow-y-auto max-h-[50vh] custom-scrollbar p-3">
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
