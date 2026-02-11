/**
 * Selection Menu Component
 * 
 * Context menu that appears when text is selected, replacing the bottom toolbar.
 * Provides all marking and observation options in a compact menu.
 */

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import type { TextSelection } from '@/stores/annotationStore';
import type { MarkingPreset } from '@/types/keyWord';
import type { SymbolKey } from '@/types/annotation';
import type { ObservationTab } from '@/components/Observation';
import type { ObservationTrackerType } from '@/lib/observationSymbols';
import { SYMBOLS, getHighlightColorHex } from '@/types/annotation';
import { isCommonPronoun } from '@/types/keyWord';
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
  const menuRef = useRef<HTMLDivElement>(null);
  const applyKeyWordRef = useRef<HTMLButtonElement>(null);
  const addVariantRef = useRef<HTMLButtonElement>(null);

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    
    setMenuPosition({ x, y });
  }, [position, isMobile]);

  const keywordPresets = presets.filter((p) => p.word);
  const sortedPresets = [...keywordPresets].sort(
    (a, b) => (b.usageCount || 0) - (a.usageCount || 0) || (a.word || '').localeCompare(b.word || '')
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
      
      {/* Menu - bottom sheet on mobile, positioned on desktop */}
      <div 
        ref={menuRef}
        className={`fixed z-50 bg-scripture-surface shadow-2xl overflow-hidden
          ${isMobile 
            ? 'bottom-0 left-0 right-0 rounded-t-2xl animate-slide-up pb-safe-bottom' 
            : 'rounded-xl border border-scripture-border/50 animate-scale-in-dropdown min-w-[240px] max-w-[320px]'
          }`}
        style={isMobile ? undefined : {
          left: `${menuPosition.x}px`,
          top: `${menuPosition.y}px`,
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
        <div className={`p-2 space-y-1 max-h-[70vh] overflow-y-auto custom-scrollbar ${isMobile ? 'px-4 pb-4' : ''}`}>
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
                className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                         transition-all duration-200 flex items-center justify-between text-sm font-ui font-medium
                         hover:shadow-sm text-scripture-text"
                role="menuitem"
                aria-label="Apply key word"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg" aria-hidden="true">🔑</span>
                  <span>Apply Key Word</span>
                </div>
                <span className="text-xs opacity-70">▶</span>
              </button>
              {showApplyKeyWordSubmenu && (
                <div
                  className="mt-1 w-full max-h-64 overflow-y-auto
                             bg-scripture-elevated border border-scripture-border/30 rounded-lg
                             py-1.5 custom-scrollbar"
                  onClick={(e) => e.stopPropagation()}
                >
                  {sortedPresets.map((p) => (
                    <button
                      key={p.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onApplyPreset(p);
                        onClose();
                      }}
                      className="w-full px-3 py-2 text-left text-sm font-ui text-scripture-text
                               hover:bg-scripture-surface hover:border-l-2 hover:border-l-scripture-accent flex items-center gap-2"
                    >
                      {p.symbol && (
                        <span
                          className="text-base"
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
                      <span className="truncate">{p.word}</span>
                    </button>
                  ))}
                </div>
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
                className="w-full px-4 py-2.5 text-left rounded-lg bg-scripture-elevated hover:bg-scripture-border
                         transition-all duration-200 flex items-center justify-between text-sm font-ui font-medium
                         hover:shadow-sm text-scripture-text"
                role="menuitem"
                aria-label="Add as variant"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg" aria-hidden="true">➕</span>
                  <span>Add as Variant</span>
                </div>
                <span className="text-xs opacity-70">▶</span>
              </button>
              {showAddVariantSubmenu && (
                <div
                  className="mt-1 w-full max-h-64 overflow-y-auto
                             bg-scripture-elevated border border-scripture-border/30 rounded-lg
                             py-1.5 custom-scrollbar"
                  onClick={(e) => e.stopPropagation()}
                >
                  {sortedPresets.map((p) => (
                    <button
                      key={p.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onAddAsVariant(p);
                        onClose();
                      }}
                      className="w-full px-3 py-2 text-left text-sm font-ui text-scripture-text
                               hover:bg-scripture-surface hover:border-l-2 hover:border-l-scripture-accent flex items-center gap-2"
                    >
                      {p.symbol && (
                        <span
                          className="text-base"
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
                      <span className="truncate">{p.word}</span>
                    </button>
                  ))}
                </div>
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
      </div>
    </>
  );
}
