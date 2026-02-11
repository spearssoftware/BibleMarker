/**
 * Selection Menu Component
 * 
 * Context menu that appears when text is selected, replacing the bottom toolbar.
 * Provides all marking and observation options in a compact menu.
 */

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import type { TextSelection } from '@/stores/annotationStore';
import type { MarkingPreset } from '@/types/keyWord';
import type { SymbolKey } from '@/types/annotation';
import type { ObservationTab } from '@/components/Observation';
import type { ObservationTrackerType } from '@/lib/observationSymbols';
import { SYMBOLS, getHighlightColorHex } from '@/types/annotation';
import { isCommonPronoun } from '@/types/keyWord';
import { getBookById } from '@/types/bible';
import { getTrackerForSymbol } from '@/lib/observationSymbols';

interface SelectionMenuProps {
  selection: TextSelection;
  position: { x: number; y: number };
  presets: MarkingPreset[];
  activeSymbol?: SymbolKey;
  onApplyPreset: (preset: MarkingPreset) => void;
  onAddAsVariant: (preset: MarkingPreset) => void;
  onOpenKeyWordManager: () => void;
  onOpenObservationTools: (tab?: ObservationTab) => void;
  onAddToList: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export function SelectionMenu({
  selection,
  position,
  presets,
  activeSymbol,
  onApplyPreset,
  onAddAsVariant,
  onOpenKeyWordManager,
  onOpenObservationTools,
  onAddToList,
  onCancel,
  onClose,
}: SelectionMenuProps) {
  const [showApplyKeyWordSubmenu, setShowApplyKeyWordSubmenu] = useState(false);
  const [showAddVariantSubmenu, setShowAddVariantSubmenu] = useState(false);
  const [keywordSearch, setKeywordSearch] = useState('');
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

  const submenuOpen = showApplyKeyWordSubmenu || showAddVariantSubmenu;

  // Check if we're on a small screen (mobile)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate menu position to avoid going off-screen and respect safe areas (desktop only)
  const [menuPosition, setMenuPosition] = useState(position);
  useLayoutEffect(() => {
    if (!menuRef.current || isMobile) return;
    
    const el = menuRef.current;
    if (!el) return;
    
    const rect = el.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Get safe area insets from computed styles
    const computedStyle = getComputedStyle(document.documentElement);
    const safeTop = parseInt(computedStyle.getPropertyValue('env(safe-area-inset-top)') || '0', 10) || 
                    (/iPhone/.test(navigator.userAgent) ? 59 : 0);
    const safeBottom = parseInt(computedStyle.getPropertyValue('env(safe-area-inset-bottom)') || '0', 10) || 
                       (/iPhone/.test(navigator.userAgent) ? 34 : 0);
    const safeLeft = parseInt(computedStyle.getPropertyValue('env(safe-area-inset-left)') || '0', 10) || 0;
    const safeRight = parseInt(computedStyle.getPropertyValue('env(safe-area-inset-right)') || '0', 10) || 0;
    
    // Account for app header (nav bar ~56px) on desktop so menu isn't hidden behind it
    const headerOffset = /iPhone|iPad|Android/.test(navigator.userAgent) ? 0 : 56;
    const minY = Math.max(safeTop + 10, headerOffset);
    const minX = safeLeft + 10;
    const maxX = viewportWidth - safeRight - 10;
    const maxY = viewportHeight - safeBottom - 10;
    
    // Center menu horizontally on selection (position.x is selection center)
    let x = position.x - rect.width / 2;
    if (x + rect.width > maxX) x = maxX - rect.width;
    if (x < minX) x = minX;
    
    // Prefer above selection; if not enough room, show below
    const wouldShowAbove = position.y - rect.height - 5;
    let y = wouldShowAbove < minY ? position.y + 20 : wouldShowAbove;
    if (y + rect.height > maxY) y = maxY - rect.height;
    if (y < minY) y = minY;
    
    requestAnimationFrame(() => setMenuPosition({ x, y }));
  }, [position, isMobile, submenuOpen]);

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
      if (p.chapterScope !== undefined) chapter.push(p);
      else if (p.bookScope) book.push(p);
      else global.push(p);
    }
    return { global, book, chapter };
  }, [filteredPresets]);

  const submenuAction = showApplyKeyWordSubmenu ? 'apply' : 'variant';

  const renderPresetButton = (p: MarkingPreset, action: 'apply' | 'variant') => (
    <button
      key={p.id}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (action === 'apply') onApplyPreset(p);
        else onAddAsVariant(p);
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
        {p.bookScope && (
          <span className="text-scripture-muted text-xs ml-1">
            ({getBookById(p.bookScope)?.name || p.bookScope}
            {p.chapterScope !== undefined ? ` ${p.chapterScope}` : ''})
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

  const getTabForTracker = (tracker: ObservationTrackerType): ObservationTab => {
    switch (tracker) {
      case 'contrast': return 'contrasts';
      case 'time': return 'time';
      case 'place': return 'places';
      case 'conclusion': return 'conclusions';
      default: return 'lists';
    }
  };

  const trackerMapping = activeSymbol ? getTrackerForSymbol(activeSymbol) : null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/20" 
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Menu - bottom sheet on mobile, positioned on desktop; flex row when submenu open */}
      <div 
        ref={menuRef}
        className={`fixed z-50 bg-scripture-surface shadow-2xl overflow-visible
          ${isMobile 
            ? 'bottom-0 left-0 right-0 rounded-t-2xl animate-slide-up pb-safe-bottom' 
            : `rounded-xl border border-scripture-border/50 animate-scale-in-dropdown w-max min-w-[200px] flex
               ${submenuOpen ? 'max-w-none' : ''}`
          }`}
        style={isMobile ? undefined : {
          left: `${menuPosition.x}px`,
          top: `${menuPosition.y}px`,
          ...(submenuOpen && { width: 'auto' }),
        }}
        role="menu"
        aria-label="Text selection options"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle for mobile */}
        {isMobile && (
          <div className="flex justify-center py-2">
            <div className="w-10 h-1 bg-scripture-border/50 rounded-full" />
          </div>
        )}
        <div className={`flex ${isMobile ? 'flex-col' : ''} min-w-0`}>
          {/* Main menu buttons */}
          <div className={`p-2 space-y-1 overflow-y-auto custom-scrollbar flex-shrink-0 ${isMobile ? 'max-h-[70vh] px-4 pb-4' : ''}`}>
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
                {showApplyKeyWordSubmenu && isMobile && (
                  <div className="mt-1">{renderKeywordList('apply', true)}</div>
                )}
              </div>
            )}

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
                {showAddVariantSubmenu && isMobile && (
                  <div className="mt-1">{renderKeywordList('variant', true)}</div>
                )}
              </div>
            )}

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

          {/* Add to List */}
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
            aria-label="Add to observation list"
          >
            <span className="text-lg" aria-hidden="true">📝</span>
            <span>Add to List</span>
          </button>

          {/* Observe */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenObservationTools('lists');
              onClose();
            }}
            className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                     transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                     hover:shadow-sm text-scripture-text"
            role="menuitem"
            aria-label="Open observation tools"
          >
            <span className="text-lg" aria-hidden="true">🔍</span>
            <span>Observe</span>
          </button>

          {/* Quick action for symbol-based observations */}
          {activeSymbol && trackerMapping && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const tab = getTabForTracker(trackerMapping.tracker);
                onOpenObservationTools(tab);
                onClose();
              }}
              className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                       transition-all duration-200 flex items-center gap-3 text-sm font-ui font-medium
                       hover:shadow-sm text-scripture-text border-l-2 border-l-scripture-accent"
              role="menuitem"
              aria-label={`Add to ${trackerMapping.label}`}
            >
              <span className="text-base">{SYMBOLS[activeSymbol]}</span>
              <span>Add to {trackerMapping.label}</span>
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

        {/* Desktop: keyword list flyout to the right */}
        {!isMobile && submenuOpen && (
          <div className="pl-2 pr-2 py-2 border-l border-scripture-border/30 flex-shrink-0">
            <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-2">
              {submenuAction === 'apply' ? 'Apply Key Word' : 'Add as Variant'}
            </div>
            {renderKeywordList(submenuAction)}
          </div>
        )}
        </div>
      </div>
    </>
  );
}
