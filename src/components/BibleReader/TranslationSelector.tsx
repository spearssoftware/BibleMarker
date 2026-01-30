/**
 * Translation Selector Component
 * 
 * UI to select up to 3 translations for multi-translation view.
 */

import { useState, useEffect, useCallback } from 'react';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { getAllTranslations, type ApiTranslation } from '@/lib/bible-api';

export function TranslationSelector() {
  const { activeView, loadActiveView, addTranslation, removeTranslation, clearView } = useMultiTranslationStore();
  const [translations, setTranslations] = useState<ApiTranslation[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const loadTranslations = useCallback(async () => {
    const all = await getAllTranslations();
    setTranslations(all);
  }, []);

  useEffect(() => {
    loadActiveView();
    queueMicrotask(() => loadTranslations());
  }, [loadActiveView, loadTranslations]);

  const handleAdd = async (translationId: string) => {
    await addTranslation(translationId);
  };

  const handleRemove = async (translationId: string) => {
    await removeTranslation(translationId);
  };


  const handleClear = async () => {
    if (confirm('Clear multi-translation view? This will remove all selected translations.')) {
      await clearView();
    }
  };

  if (!isOpen && (!activeView || activeView.translationIds.length === 0)) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 text-sm text-scripture-muted hover:text-scripture-text transition-colors"
      >
        Multi-Translation
      </button>
    );
  }

  const selectedTranslations = activeView?.translationIds.map(id => 
    translations.find(t => t.id === id)
  ).filter(Boolean) as ApiTranslation[] || [];

  return (
    <div className="relative">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="px-3 py-1.5 text-sm text-scripture-muted hover:text-scripture-text transition-colors"
        >
          {activeView?.translationIds.length || 0} Translation{activeView?.translationIds.length !== 1 ? 's' : ''}
        </button>
      ) : (
        <div className="absolute top-full left-0 mt-2 bg-scripture-surface border border-scripture-border/50 rounded-xl shadow-2xl z-50 min-w-[300px] backdrop-blur-sm animate-scale-in-dropdown">
          <div className="p-4 border-b border-scripture-border/50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-ui font-semibold text-scripture-text">Multi-Translation View</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4 custom-scrollbar">
            {/* Selected translations */}
            {selectedTranslations.length > 0 && (
              <div>
                <div className="text-sm font-medium text-scripture-text mb-2">Selected Translations ({selectedTranslations.length}/3)</div>
                <div className="space-y-2">
                  {selectedTranslations.map((translation) => (
                    <div
                      key={translation.id}
                      className="flex items-center justify-between p-2 bg-scripture-background rounded border border-scripture-muted/20"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-sm text-scripture-text">{translation.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRemove(translation.id)}
                          className="text-xs px-2 py-1 text-highlight-red hover:text-highlight-red/80 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available translations */}
            {selectedTranslations.length < 3 && (
              <div>
                <div className="text-sm font-medium text-scripture-text mb-2">Add Translation</div>
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                  {translations
                    .filter(t => !activeView?.translationIds.includes(t.id))
                    .map((translation) => (
                      <button
                        key={translation.id}
                        onClick={() => handleAdd(translation.id)}
                        className="w-full text-left px-3 py-2 text-sm text-scripture-text hover:bg-scripture-background rounded transition-colors"
                      >
                        <div className="font-medium">{translation.name}</div>
                        <div className="text-xs text-scripture-muted">{translation.abbreviation} • {translation.provider}</div>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Clear button */}
            {selectedTranslations.length > 0 && (
              <button
                onClick={handleClear}
                className="w-full px-4 py-2 text-sm text-highlight-red hover:bg-highlight-red/10 rounded transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
