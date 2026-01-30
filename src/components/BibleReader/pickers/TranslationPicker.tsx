/**
 * Translation Picker Component
 * 
 * Dropdown picker for selecting Bible translations.
 */

import { useState, useEffect } from 'react';
import { type ApiTranslation } from '@/lib/bible-api';
import { getPreferences, db } from '@/lib/db';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { useModal } from '@/hooks/useModal';
import { ModalBackdrop } from '@/components/shared';
import { Z_INDEX } from '@/lib/modalConstants';

interface TranslationPickerProps {
  translations: ApiTranslation[];
  activeView?: { translationIds: string[] } | null;
  onSelect: (translationId: string) => void;
  onClose: () => void;
}

export function TranslationPicker({ 
  translations, 
  activeView,
  onSelect, 
  onClose 
}: TranslationPickerProps) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<string[]>([]);
  const [userLanguage, setUserLanguage] = useState<string>('en');
  
  const { handleBackdropClick } = useModal({
    isOpen: true,
    onClose,
    lockScroll: false,
    handleEscape: true,
  });

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
      <ModalBackdrop onClick={handleBackdropClick} zIndex={Z_INDEX.BACKDROP} />
      
      {/* Picker - uses absolute positioning relative to parent */}
      <div 
        className="absolute top-full left-0 mt-2
                    bg-scripture-surface rounded-2xl shadow-2xl
                    w-[400px] max-w-[min(400px,calc(100vw-2rem))] max-h-[70vh] overflow-hidden animate-scale-in-dropdown"
        style={{ zIndex: Z_INDEX.MODAL }}
        role="dialog"
        aria-modal="true"
        aria-label="Select translation"
      >
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
                  aria-label="Clear all selected translations"
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
                          aria-label={`Remove ${translation.name}`}
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
          aria-label={`${isSelected ? 'Deselect' : 'Select'} ${translation.name}`}
        >
          {isMultiMode && (
            <div className="flex-shrink-0 w-4 h-4 border-2 rounded border-current flex items-center justify-center" aria-hidden="true">
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
                ? 'text-scripture-warning' 
                : isSelected
                  ? 'text-scripture-bg/60 opacity-100'
                  : 'text-scripture-muted opacity-0 group-hover:opacity-100'
            }`}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={isFavorite ? `Remove ${translation.name} from favorites` : `Add ${translation.name} to favorites`}
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
