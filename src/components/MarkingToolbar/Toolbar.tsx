/**
 * Marking Toolbar Component
 * 
 * Bottom toolbar for Precept-style marking with colors, highlights, and symbols.
 */

import { useState, useMemo, useEffect } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useKeyWordStore } from '@/stores/keyWordStore';
import { useAnnotations } from '@/hooks/useAnnotations';
import { ColorPicker } from './ColorPicker';
import { SymbolPicker } from './SymbolPicker';
import { ModuleManager } from './ModuleManager';
import { KeyWordManager } from '@/components/KeyWords';
import { HIGHLIGHT_COLORS, SYMBOLS } from '@/types/annotation';
import { clearDatabase, updatePreferences } from '@/lib/db';
import { findMatchingKeyWords } from '@/types/keyWord';
import type { AnnotationType, TextAnnotation, SymbolAnnotation } from '@/types/annotation';

const TOOLS: { type: AnnotationType | 'symbol'; icon: string; label: string }[] = [
  { type: 'highlight', icon: '🖍', label: 'Highlight' },
  { type: 'textColor', icon: 'A', label: 'Text Color' },
  { type: 'underline', icon: 'U̲', label: 'Underline' },
  { type: 'symbol', icon: '✝', label: 'Symbol' },
];

export function Toolbar() {
  const {
    activeTool,
    setActiveTool,
    activeColor,
    setActiveColor,
    activeSymbol,
    setActiveSymbol,
    selection,
    clearSelection,
    toolbarVisible,
    preferences,
    annotations,
    fontSize,
    setFontSize,
  } = useAnnotationStore();

  const { applyCurrentTool, createTextAnnotation, createSymbolAnnotation } = useAnnotations();
  const { keyWords, loadKeyWords, markKeyWordUsed } = useKeyWordStore();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showSystemMenu, setShowSystemMenu] = useState(false);
  const [showModuleManager, setShowModuleManager] = useState(false);
  const [showKeyWordManager, setShowKeyWordManager] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Load key words on mount
  useEffect(() => {
    loadKeyWords();
  }, [loadKeyWords]);

  const handleClearDatabase = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Clear database button clicked');
    
    if (!confirm('Are you sure you want to clear all annotations, notes, and cache? This cannot be undone.')) {
      return;
    }
    
    setIsClearing(true);
    try {
      console.log('Clearing database...');
      await clearDatabase();
      console.log('Database cleared successfully');
      alert('Database cleared successfully!');
      // Reload the page to refresh the UI
      window.location.reload();
    } catch (error) {
      console.error('Error clearing database:', error);
      alert('Error clearing database. Check console for details.');
      setIsClearing(false);
      setShowSystemMenu(false);
    }
  };

  const handleFontSizeChange = async (newSize: 'sm' | 'base' | 'lg' | 'xl') => {
    setFontSize(newSize);
    try {
      await updatePreferences({ fontSize: newSize });
    } catch (error) {
      console.error('Error updating font size:', error);
    }
  };

  const fontSizes: Array<{ size: 'sm' | 'base' | 'lg' | 'xl'; label: string }> = [
    { size: 'sm', label: 'Small' },
    { size: 'base', label: 'Medium' },
    { size: 'lg', label: 'Large' },
    { size: 'xl', label: 'Extra Large' },
  ];

  // Find previous annotations and key words for the selected word/phrase
  const previousAnnotations = useMemo(() => {
    if (!selection?.text) return [];

    const normalizedSelection = selection.text.trim().toLowerCase();
    const suggestions: Array<{
      type: 'highlight' | 'textColor' | 'underline' | 'symbol' | 'keyWord';
      color?: string;
      symbol?: string;
      label: string;
      icon: string;
      keyWordId?: string;
    }> = [];

    // Check for matching key words
    const matchingKeyWords = findMatchingKeyWords(selection.text.trim(), keyWords);
    for (const kw of matchingKeyWords) {
      if (kw.autoSuggest) {
        const symbol = kw.symbol ? SYMBOLS[kw.symbol] : '🔑';
        suggestions.push({
          type: 'keyWord',
          symbol: kw.symbol,
          color: kw.color,
          label: `Key Word: ${kw.word}`,
          icon: symbol,
          keyWordId: kw.id,
        });
      }
    }

    for (const ann of annotations) {
      if (ann.type === 'symbol') {
        const symAnn = ann as SymbolAnnotation;
        if (symAnn.selectedText && symAnn.position === 'center') {
          const normalizedText = symAnn.selectedText.trim().toLowerCase();
          if (normalizedText === normalizedSelection) {
            // Avoid duplicates
            const exists = suggestions.some(s => s.type === 'symbol' && s.symbol === symAnn.symbol);
            if (!exists) {
              suggestions.push({
                type: 'symbol',
                symbol: symAnn.symbol,
                color: symAnn.color,
                label: `Symbol: ${SYMBOLS[symAnn.symbol]}`,
                icon: SYMBOLS[symAnn.symbol],
              });
            }
          }
        }
      } else {
        const textAnn = ann as TextAnnotation;
        if (textAnn.selectedText) {
          const normalizedText = textAnn.selectedText.trim().toLowerCase();
          if (normalizedText === normalizedSelection) {
            // Avoid duplicates - check if same type and color already exists
            const exists = suggestions.some(
              s => s.type === textAnn.type && s.color === textAnn.color
            );
            if (!exists) {
              const icon = textAnn.type === 'highlight' ? '🖍' : textAnn.type === 'textColor' ? 'A' : 'U̲';
              const label = textAnn.type === 'highlight' ? 'Highlight' : 
                          textAnn.type === 'textColor' ? 'Text Color' : 'Underline';
              
              suggestions.push({
                type: textAnn.type,
                color: textAnn.color,
                label: `${label}: ${textAnn.color}`,
                icon,
              });
            }
          }
        }
      }
    }

    return suggestions;
  }, [selection?.text, annotations, keyWords]);

  // Apply suggestion with one click
  const handleApplySuggestion = async (suggestion: typeof previousAnnotations[0]) => {
    if (!selection) return;
    
    if (suggestion.type === 'keyWord' && suggestion.keyWordId) {
      // Apply key word style
      const keyWord = keyWords.find(kw => kw.id === suggestion.keyWordId);
      if (keyWord) {
        // Mark as used
        await markKeyWordUsed(keyWord.id);
        
        // Apply the key word's style
        if (keyWord.symbol) {
          setActiveTool('symbol');
          setActiveSymbol(keyWord.symbol);
          if (keyWord.color) {
            setActiveColor(keyWord.color);
          }
          await createSymbolAnnotation(keyWord.symbol, 'center', keyWord.color, 'overlay');
        } else if (keyWord.color) {
          setActiveTool('highlight');
          setActiveColor(keyWord.color);
          await createTextAnnotation('highlight', keyWord.color);
        }
      }
      return;
    }
    
    if (suggestion.type === 'symbol' && suggestion.symbol) {
      // suggestion.symbol is already the SymbolKey (e.g., 'cross')
      // Update state for consistency
      setActiveTool('symbol');
      setActiveSymbol(suggestion.symbol as any);
      if (suggestion.color) {
        setActiveColor(suggestion.color as any);
      }
      // Create symbol annotation directly
      await createSymbolAnnotation(suggestion.symbol as any, 'center', suggestion.color as any, 'overlay');
    } else if (suggestion.type !== 'keyWord' && suggestion.color) {
      // Update state for consistency
      setActiveTool(suggestion.type as AnnotationType);
      setActiveColor(suggestion.color as any);
      // Create text annotation directly
      await createTextAnnotation(suggestion.type as 'highlight' | 'textColor' | 'underline', suggestion.color as any);
    }
  };

  if (!toolbarVisible) return null;

  const handleToolClick = (toolType: AnnotationType | 'symbol') => {
    if (activeTool === toolType) {
      // Toggle off
      setActiveTool(null);
      setShowColorPicker(false);
      setShowSymbolPicker(false);
    } else {
      setActiveTool(toolType);
      if (toolType === 'symbol') {
        setShowSymbolPicker(true);
        setShowColorPicker(false);
      } else {
        setShowColorPicker(true);
        setShowSymbolPicker(false);
      }
    }
  };


  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 
                    pb-[env(safe-area-inset-bottom)]">
      {/* Selection indicator */}
      {selection && (
        <>
          <div className="bg-scripture-accent/95 backdrop-blur-sm text-scripture-bg px-4 py-2.5 
                          flex items-center justify-between animate-slide-up shadow-lg border-t border-scripture-accent/30">
            <span className="text-sm font-ui truncate flex-1 font-medium">
              Selected: {selection.text.slice(0, 50)}
              {selection.text.length > 50 ? '...' : ''}
            </span>
            <div className="flex items-center gap-2 ml-3">
              <button
                onClick={clearSelection}
                className="px-3 py-1 text-xs font-ui text-scripture-bg/90 hover:text-scripture-bg
                         transition-colors rounded-lg hover:bg-scripture-bg/20"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Smart suggestions */}
          {previousAnnotations.length > 0 && (
            <div className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 px-4 py-2.5 animate-slide-up">
              <div className="text-xs text-scripture-muted mb-2 font-ui font-medium">
                Previously used for "{selection.text.trim()}":
              </div>
              <div className="flex flex-wrap gap-2">
                {previousAnnotations.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleApplySuggestion(suggestion)}
                    className="px-3 py-1.5 rounded-xl bg-scripture-elevated/80 hover:bg-scripture-border
                             border border-scripture-border/50 transition-all duration-200 flex items-center gap-2
                             text-xs font-ui shadow-sm hover:shadow"
                    title={`Apply ${suggestion.label}`}
                  >
                    {suggestion.type !== 'symbol' && suggestion.color && (
                      <span
                        className={`rounded border border-scripture-border/30 ${
                          suggestion.type === 'highlight' ? 'w-4 h-4' : 'w-3 h-3'
                        }`}
                        style={{
                          backgroundColor: suggestion.type === 'highlight'
                            ? HIGHLIGHT_COLORS[suggestion.color as keyof typeof HIGHLIGHT_COLORS] + '40'
                            : HIGHLIGHT_COLORS[suggestion.color as keyof typeof HIGHLIGHT_COLORS]
                        }}
                        title={suggestion.color}
                      />
                    )}
                    {suggestion.type === 'symbol' ? (
                      <span
                        className="text-base"
                        style={{
                          color: suggestion.color ? HIGHLIGHT_COLORS[suggestion.color as keyof typeof HIGHLIGHT_COLORS] : undefined,
                          opacity: 0.8,
                        }}
                      >
                        {suggestion.icon}
                      </span>
                    ) : (
                      <span className="text-base">{suggestion.icon}</span>
                    )}
                    <span 
                      className={suggestion.type === 'textColor' ? '' : 'text-scripture-text'}
                      style={suggestion.type === 'textColor' && suggestion.color 
                        ? { color: HIGHLIGHT_COLORS[suggestion.color as keyof typeof HIGHLIGHT_COLORS] }
                        : undefined}
                    >
                      {suggestion.type === 'highlight' ? 'Highlight' :
                       suggestion.type === 'textColor' ? 'Color' :
                       suggestion.type === 'underline' ? 'Underline' : 'Symbol'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Color picker dropdown */}
      {showColorPicker && activeTool && activeTool !== 'symbol' && (
        <div className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 p-4 animate-slide-up shadow-lg">
          <ColorPicker
            selectedColor={activeColor}
            onSelect={async (color) => {
              setActiveColor(color);
              // Auto-apply when color is selected - pass the new color directly
              // to avoid race condition with state update
              if (selection) {
                await applyCurrentTool(color);
              }
            }}
            recents={preferences.recentColors}
          />
        </div>
      )}

      {/* Symbol picker dropdown */}
      {showSymbolPicker && activeTool === 'symbol' && (
        <div className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 p-4 animate-slide-up shadow-lg">
          <SymbolPicker
            selectedSymbol={activeSymbol}
            onSelect={async (symbol) => {
              setActiveSymbol(symbol);
              // Auto-apply when symbol is selected - pass the new symbol directly
              // to avoid race condition with state update
              if (selection) {
                await applyCurrentTool(undefined, symbol);
              }
            }}
            recents={preferences.recentSymbols}
          />
        </div>
      )}

      {/* System menu */}
      {showSystemMenu && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowSystemMenu(false)}
          />
          <div 
            className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 p-4 animate-slide-up relative z-50 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-lg mx-auto space-y-2">
              {/* Font Size Control */}
              <div className="px-4 py-3 rounded-xl bg-scripture-elevated/50 border border-scripture-border/30">
                <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-3">
                  Font Size
                </div>
                <div className="flex items-center gap-2">
                  {fontSizes.map((fs) => (
                    <button
                      key={fs.size}
                      onClick={() => handleFontSizeChange(fs.size)}
                      className={`flex-1 px-3 py-2 rounded-lg font-ui text-sm transition-all duration-200
                                ${fontSize === fs.size
                                  ? 'bg-scripture-accent text-scripture-bg shadow-md scale-105'
                                  : 'bg-scripture-surface hover:bg-scripture-elevated border border-scripture-border/50 hover:shadow-sm'}`}
                    >
                      {fs.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bible Translations */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowModuleManager(true);
                  setShowSystemMenu(false);
                }}
                className="w-full px-4 py-2.5 text-left rounded-xl bg-scripture-elevated/50 
                         hover:bg-scripture-elevated text-scripture-text transition-all 
                         duration-200 flex items-center gap-2 text-sm font-ui font-medium 
                         border border-scripture-border/30 hover:border-scripture-border/50 
                         shadow-sm hover:shadow"
                title="Manage Bible translations"
              >
                <span>📖</span>
                <span>Bible Translations</span>
              </button>

              {/* Key Words */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowKeyWordManager(true);
                  setShowSystemMenu(false);
                }}
                className="w-full px-4 py-2.5 text-left rounded-xl bg-scripture-elevated/50 
                         hover:bg-scripture-elevated text-scripture-text transition-all 
                         duration-200 flex items-center gap-2 text-sm font-ui font-medium 
                         border border-scripture-border/30 hover:border-scripture-border/50 
                         shadow-sm hover:shadow"
                title="Manage key words"
              >
                <span>🔑</span>
                <span>Key Words</span>
              </button>

              {/* Clear Database Button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleClearDatabase(e);
                }}
                disabled={isClearing}
                className="w-full px-4 py-2.5 text-left rounded-xl bg-red-600/20 
                         hover:bg-red-600/30 text-red-400 disabled:opacity-50 
                         disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2
                         text-sm font-ui font-medium border border-red-600/30 shadow-sm hover:shadow"
                title="Clear all annotations and cache (for testing)"
              >
                <span>🗑️</span>
                <span>{isClearing ? 'Clearing...' : 'Clear Database'}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Module Manager */}
      {showModuleManager && (
        <ModuleManager onClose={() => setShowModuleManager(false)} />
      )}

      {/* Key Word Manager */}
      {showKeyWordManager && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowKeyWordManager(false)}
          />
          <div 
            className="fixed inset-x-4 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
                       bg-scripture-surface border border-scripture-border/50 rounded-2xl shadow-2xl
                       max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <KeyWordManager onClose={() => setShowKeyWordManager(false)} />
          </div>
        </>
      )}

      {/* Main toolbar */}
      <div className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 shadow-lg">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center justify-around">
          {TOOLS.map((tool) => (
            <button
              key={tool.type}
              onClick={() => handleToolClick(tool.type)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl 
                         transition-all duration-200 touch-target
                         ${activeTool === tool.type 
                           ? 'bg-scripture-accent text-scripture-bg shadow-md scale-105' 
                           : 'hover:bg-scripture-elevated hover:scale-105 active:scale-95'}`}
              aria-label={tool.label}
            >
              <span className="text-xl">{tool.icon}</span>
              <span className="text-xs font-ui font-medium">{tool.label}</span>
            </button>
          ))}

          {/* System menu button */}
          <button
            onClick={() => {
              setShowSystemMenu(!showSystemMenu);
              setShowColorPicker(false);
              setShowSymbolPicker(false);
            }}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl 
                       transition-all duration-200 touch-target
                       ${showSystemMenu 
                         ? 'bg-scripture-elevated shadow-md scale-105' 
                         : 'hover:bg-scripture-elevated hover:scale-105 active:scale-95'}`}
            aria-label="System menu"
          >
            <span className="text-xl">⚙️</span>
            <span className="text-xs font-ui font-medium">More</span>
          </button>
        </div>
      </div>
    </div>
  );
}
