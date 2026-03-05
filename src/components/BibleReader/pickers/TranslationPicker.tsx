/**
 * Translation Picker Component
 *
 * Simple picker for selecting from installed SWORD modules + ESV.
 */

import { useState, useEffect } from 'react';
import { type ApiTranslation } from '@/lib/bible-api';
import { getPreferences } from '@/lib/database';
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
  onClose,
}: TranslationPickerProps) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const { handleBackdropClick } = useModal({
    isOpen: true,
    onClose,
    lockScroll: false,
    handleEscape: true,
  });

  useEffect(() => {
    async function loadData() {
      try {
        const prefs = await getPreferences();
        setFavorites(new Set(prefs.favoriteTranslations || []));
      } catch (error) {
        console.error('Failed to load translation preferences:', error);
      }
    }
    loadData();
  }, []);

  const toggleFavorite = async (translationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const prefs = await getPreferences();
      const current = prefs.favoriteTranslations || [];
      const isFav = current.includes(translationId);
      const updated = isFav
        ? current.filter((id: string) => id !== translationId)
        : [...current, translationId];

      const { updatePreferences } = await import('@/lib/database');
      await updatePreferences({ favoriteTranslations: updated });
      setFavorites(new Set(updated));
    } catch (error) {
      console.error('Failed to update favorites:', error);
    }
  };

  const selectedInMultiView = activeView?.translationIds || [];

  // Split into favorites first, then the rest
  const favoriteTranslations = translations.filter((t) => favorites.has(t.id));
  const otherTranslations = translations.filter((t) => !favorites.has(t.id));

  return (
    <>
      <ModalBackdrop onClick={handleBackdropClick} zIndex={Z_INDEX.BACKDROP} />

      <div
        className="fixed top-[60px] left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-sm
                   bg-scripture-surface rounded-2xl shadow-modal dark:shadow-modal-dark animate-slide-down
                   max-h-[70vh] flex flex-col mt-safe-top"
        style={{ zIndex: Z_INDEX.MODAL }}
        role="dialog"
        aria-modal="true"
        aria-label="Select translation"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-scripture-border/30 flex-shrink-0">
          <h2 className="text-lg font-semibold text-scripture-text">Select Translation</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full hover:bg-scripture-elevated transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-scripture-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 custom-scrollbar p-4">
          {/* Selected translations */}
          {selectedInMultiView.length > 0 && (
            <div className="mb-4 pb-4 border-b border-scripture-border/30">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-scripture-text">
                  Selected ({selectedInMultiView.length}/3)
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
              <div className="space-y-1.5">
                {selectedInMultiView.map((id) => {
                  const translation = translations.find((t) => t.id === id);
                  if (!translation) return null;
                  return (
                    <div key={id} className="flex items-center justify-between px-3 py-2 bg-scripture-elevated rounded-lg">
                      <span className="text-sm font-medium text-scripture-text truncate">{translation.name}</span>
                      <button
                        onClick={() => onSelect(id)}
                        className="text-xs px-2 py-1 text-highlight-red hover:text-highlight-red/80 transition-colors flex-shrink-0"
                        aria-label={`Remove ${translation.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {translations.length > 0 ? (
            <>
              {/* Favorites */}
              {favoriteTranslations.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Favorites
                  </h4>
                  <div className="space-y-1.5">
                    {favoriteTranslations.map((t) => (
                      <TranslationButton
                        key={t.id}
                        translation={t}
                        isSelected={selectedInMultiView.includes(t.id)}
                        isFavorite={true}
                        selectedCount={selectedInMultiView.length}
                        onSelect={onSelect}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* All translations */}
              {otherTranslations.length > 0 && (
                <div>
                  {favoriteTranslations.length > 0 && (
                    <h4 className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-3">
                      All Translations
                    </h4>
                  )}
                  <div className="space-y-1.5">
                    {otherTranslations.map((t) => (
                      <TranslationButton
                        key={t.id}
                        translation={t}
                        isSelected={selectedInMultiView.includes(t.id)}
                        isFavorite={false}
                        selectedCount={selectedInMultiView.length}
                        onSelect={onSelect}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4 text-scripture-muted text-xs">
              No translations available. Download a Bible module in Settings.
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
  selectedCount: number;
  onSelect: (translationId: string) => void;
  onToggleFavorite: (translationId: string, e: React.MouseEvent) => void;
}

function TranslationButton({
  translation,
  isSelected,
  isFavorite,
  selectedCount,
  onSelect,
  onToggleFavorite,
}: TranslationButtonProps) {
  const isDisabled = !isSelected && selectedCount >= 3;

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
          title={translation.name}
          aria-label={`${isSelected ? 'Deselect' : 'Select'} ${translation.name}`}
        >
          <div className="flex-shrink-0 w-4 h-4 border-2 rounded border-current flex items-center justify-center" aria-hidden="true">
            {isSelected && (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{translation.name}</div>
          </div>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`text-xs font-mono ${isSelected ? 'text-scripture-bg/80' : 'text-scripture-muted'}`}>
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
