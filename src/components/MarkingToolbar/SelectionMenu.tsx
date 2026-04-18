/**
 * Selection Menu Component
 * 
 * Context menu that appears when text is selected, replacing the bottom toolbar.
 * Provides all marking and observation options in a compact menu.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { TextSelection } from '@/stores/annotationStore';
import type { MarkingPreset } from '@/types';
import { SYMBOLS, getHighlightColorHex } from '@/types';
import { isCommonPronoun } from '@/types';
import { scopeLabel } from '@/types';

export type ApplyScope = 'here' | 'all';

interface SelectionMenuProps {
  selection: TextSelection;
  presets: MarkingPreset[];
  strongsNumbers?: string[];
  /** Whether cross-translation propagation is available (i.e. at least
   * one other installed translation exists). When false, the scope
   * toggle is hidden since there's nothing to propagate to. */
  canPropagate?: boolean;
  onApplyPreset: (preset: MarkingPreset, scope: ApplyScope) => void;
  onAddAsVariant: (preset: MarkingPreset) => void;
  onOpenKeyWordManager: () => void;
  onQuickAddKeyword: (type: 'person' | 'place') => void;
  onAddToList: () => void;
  onStrongsLookup?: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export function SelectionMenu({
  selection,
  presets,
  strongsNumbers,
  canPropagate = false,
  onApplyPreset,
  onAddAsVariant,
  onOpenKeyWordManager,
  onQuickAddKeyword,
  onAddToList,
  onStrongsLookup,
  onCancel,
  onClose,
}: SelectionMenuProps) {
  const [showApplyKeyWordSubmenu, setShowApplyKeyWordSubmenu] = useState(false);
  const [showAddVariantSubmenu, setShowAddVariantSubmenu] = useState(false);
  const [keywordSearch, setKeywordSearch] = useState('');
  // Apply propagates to every other installed translation by default.
  // User can opt out for a single action via this toggle.
  const [thisTranslationOnly, setThisTranslationOnly] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const applyKeyWordRef = useRef<HTMLButtonElement>(null);
  const addVariantRef = useRef<HTMLButtonElement>(null);

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setKeywordSearch('');
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Close submenus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowApplyKeyWordSubmenu(false);
        setShowAddVariantSubmenu(false);
        setKeywordSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const keywordPresets = presets.filter((p) => p.word);
  const sortedPresets = useMemo(
    () =>
      [...keywordPresets].sort(
        (a, b) => (b.usageCount || 0) - (a.usageCount || 0) || (a.word || '').localeCompare(b.word || '')
      ),
    [keywordPresets]
  );
  const filteredPresets = useMemo(() => {
    if (!keywordSearch.trim()) return sortedPresets;
    const q = keywordSearch.trim().toLowerCase();
    return sortedPresets.filter(
      (p) =>
        p.word?.toLowerCase().includes(q) ||
        (p.variants || []).some((v) => (typeof v === 'string' ? v : v.text).toLowerCase().includes(q))
    );
  }, [sortedPresets, keywordSearch]);

  const presetsByScope = useMemo(() => {
    const global: MarkingPreset[] = [];
    const book: MarkingPreset[] = [];
    const chapter: MarkingPreset[] = [];
    for (const p of filteredPresets) {
      if (p.scopes?.some(s => s.chapter !== undefined)) chapter.push(p);
      else if (p.scopes && p.scopes.length > 0) book.push(p);
      else global.push(p);
    }
    return { global, book, chapter };
  }, [filteredPresets]);



  const renderPresetButton = (p: MarkingPreset, action: 'apply' | 'variant') => (
    <button
      key={p.id}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (action === 'apply') {
          const scope: ApplyScope = canPropagate && !thisTranslationOnly ? 'all' : 'here';
          onApplyPreset(p, scope);
        } else {
          onAddAsVariant(p);
        }
        onClose();
      }}
      className="w-full px-3 py-2 text-left text-sm font-ui text-scripture-text
               hover:bg-scripture-surface hover:border-l-2 hover:border-l-scripture-accent flex items-center gap-2"
    >
      {p.symbol && (
        <span
          className="text-base flex-shrink-0"
          style={{
            color: p.highlight?.color ? getHighlightColorHex(p.highlight.color) : undefined,
          }}
        >
          {SYMBOLS[p.symbol]}
        </span>
      )}
      {p.highlight && (
        <span
          className="w-4 h-4 rounded border border-scripture-border/30 flex-shrink-0"
          style={{ backgroundColor: getHighlightColorHex(p.highlight.color) + '60' }}
        />
      )}
      <span className="truncate flex-1">
        {p.word}
        {p.scopes && p.scopes.length > 0 && (
          <span className="text-scripture-muted text-xs ml-1">
            ({scopeLabel(p.scopes)})
          </span>
        )}
      </span>
    </button>
  );

  const renderScopeSection = (title: string, items: MarkingPreset[], action: 'apply' | 'variant') => {
    if (items.length === 0) return null;
    return (
      <div key={title} className="mb-2">
        <div className="px-3 py-1 text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider">
          {title}
        </div>
        {items.map((p) => renderPresetButton(p, action))}
      </div>
    );
  };

  const renderKeywordList = (action: 'apply' | 'variant', inline = false) => (
    <div
      className={`flex flex-col bg-scripture-elevated border border-scripture-border/30 rounded-lg
                  ${inline ? 'w-full max-h-64' : 'w-[280px]'}`}
      onClick={(e) => e.stopPropagation()}
    >
      {action === 'apply' && canPropagate && (
        <label className="mx-2 mt-2 flex items-center gap-2 px-2 py-1.5 text-xs font-ui text-scripture-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={thisTranslationOnly}
            onChange={(e) => setThisTranslationOnly(e.target.checked)}
            className="accent-scripture-accent"
          />
          <span>This translation only</span>
        </label>
      )}
      <input
        type="search"
        placeholder="Search keywords..."
        value={keywordSearch}
        onChange={(e) => setKeywordSearch(e.target.value)}
        className="mx-2 mt-2 mb-1 px-2 py-1.5 text-sm bg-scripture-surface border border-scripture-border/50 rounded
                   text-scripture-text placeholder:text-scripture-muted focus:outline-none focus:ring-2 focus:ring-scripture-accent"
      />
      <div className="max-h-[60vh] overflow-y-auto py-1.5 custom-scrollbar">
        {renderScopeSection('Global', presetsByScope.global, action)}
        {renderScopeSection('Book', presetsByScope.book, action)}
        {renderScopeSection('Chapter', presetsByScope.chapter, action)}
      </div>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/20" 
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Menu - unified bottom sheet on all devices */}
      <div
        ref={menuRef}
        className="fixed z-50 bottom-0 left-0 right-0 bg-scripture-surface shadow-2xl overflow-visible
                   rounded-t-2xl animate-slide-up-sheet pb-safe-bottom
                   sm:left-1/2 sm:-translate-x-1/2 sm:max-w-[400px]"
        role="menu"
        aria-label="Text selection options"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 bg-scripture-border/50 rounded-full" />
        </div>
        {/* Selected word chip */}
        {selection.text && (
          <div className="px-4 pb-2 flex justify-center">
            <span className="inline-block px-3 py-1 rounded-full bg-scripture-accent/15 text-scripture-accent text-sm font-ui font-semibold truncate max-w-full">
              &ldquo;{selection.text.trim()}&rdquo;
            </span>
          </div>
        )}
        <div className="flex flex-col min-w-0">
          {/* Main menu buttons */}
          <div className="p-2 space-y-1 overflow-y-auto custom-scrollbar flex-shrink-0 max-h-[70vh] px-4 pb-4">
          {/* Key Word */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenKeyWordManager();
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                     transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                     hover:shadow-sm text-scripture-text"
            role="menuitem"
            aria-label="Create key word"
          >
            <span className="text-lg" aria-hidden="true">➕</span>
            <span>Key Word</span>
          </button>

            {/* Add as Variant */}
            {!isCommonPronoun(selection.text) && keywordPresets.length > 0 && (
              <div className="relative">
                <button
                  ref={addVariantRef}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowApplyKeyWordSubmenu(false);
                    setShowAddVariantSubmenu(!showAddVariantSubmenu);
                  }}
                  className={`w-full pl-4 pr-3 py-2.5 text-left rounded-lg transition-all duration-200 flex items-center justify-between text-sm font-ui font-medium
                           hover:shadow-sm text-scripture-text
                           ${showAddVariantSubmenu
                             ? 'bg-scripture-accent/20 dark:bg-scripture-accent/30 border border-scripture-accent'
                             : 'bg-scripture-elevated hover:bg-scripture-border'
                           }`}
                  role="menuitem"
                  aria-label="Add as variant"
                  aria-expanded={showAddVariantSubmenu}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg" aria-hidden="true">➕</span>
                    <span>Add as Variant</span>
                  </div>
                  <span className="text-xs opacity-70 ml-2">▶</span>
                </button>
                {showAddVariantSubmenu && (
                  <div className="mt-1">{renderKeywordList('variant', true)}</div>
                )}
              </div>
            )}

            {/* Apply Key Word */}
            {keywordPresets.length > 0 && (
              <div className="relative">
                <button
                  ref={applyKeyWordRef}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowAddVariantSubmenu(false);
                    setShowApplyKeyWordSubmenu(!showApplyKeyWordSubmenu);
                  }}
                  className={`w-full pl-4 pr-3 py-2.5 text-left rounded-lg transition-all duration-200 flex items-center justify-between text-sm font-ui font-medium
                           hover:shadow-sm text-scripture-text
                           ${showApplyKeyWordSubmenu
                             ? 'bg-scripture-accent/20 dark:bg-scripture-accent/30 border border-scripture-accent'
                             : 'bg-scripture-elevated hover:bg-scripture-border'
                           }`}
                  role="menuitem"
                  aria-label="Apply key word"
                  aria-expanded={showApplyKeyWordSubmenu}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg" aria-hidden="true">🔑</span>
                    <span>Apply Key Word</span>
                  </div>
                  <span className="text-xs opacity-70 ml-2">▶</span>
                </button>
                {showApplyKeyWordSubmenu && (
                  <div className="mt-1">{renderKeywordList('apply', true)}</div>
                )}
              </div>
            )}

          {/* Add Person */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickAddKeyword('person');
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                     transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                     hover:shadow-sm text-scripture-text"
            role="menuitem"
            aria-label="Add person"
          >
            <span className="text-lg" aria-hidden="true">{SYMBOLS.person}</span>
            <span>Add Person</span>
          </button>

          {/* Add Place */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickAddKeyword('place');
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                     transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                     hover:shadow-sm text-scripture-text"
            role="menuitem"
            aria-label="Add place"
          >
            <span className="text-lg" aria-hidden="true">{SYMBOLS.mapPin}</span>
            <span>Add Place</span>
          </button>

          {/* Observe */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddToList();
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                     transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                     hover:shadow-sm text-scripture-text"
            role="menuitem"
            aria-label="Add observation"
          >
            <span className="text-lg" aria-hidden="true">🔍</span>
            <span>Observe</span>
          </button>

          {/* Strong's Lookup */}
          {strongsNumbers && strongsNumbers.length > 0 && onStrongsLookup && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStrongsLookup();
                onClose();
              }}
              className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                       transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                       hover:shadow-sm text-scripture-text"
              role="menuitem"
              aria-label="Strong's lookup"
            >
              <span className="text-lg" aria-hidden="true">&#x1F4D6;</span>
              <span>Strong&apos;s Lookup</span>
            </button>
          )}

          {/* Divider */}
          <div className="border-t border-scripture-border/30 my-1" />

          {/* Cancel */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                     transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                     hover:shadow-sm text-scripture-text"
            role="menuitem"
            aria-label="Cancel selection"
          >
            <span>Cancel</span>
          </button>
        </div>

        </div>
      </div>
    </>
  );
}
