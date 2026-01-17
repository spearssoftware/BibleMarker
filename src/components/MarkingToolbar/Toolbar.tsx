/**
 * Marking Toolbar Component
 * 
 * Bottom toolbar for Precept-style marking with colors, highlights, and symbols.
 */

import { useState, useMemo } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useAnnotations } from '@/hooks/useAnnotations';
import { ColorPicker } from './ColorPicker';
import { SymbolPicker } from './SymbolPicker';
import { HIGHLIGHT_COLORS, SYMBOLS } from '@/types/annotation';
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
    toolbarExpanded,
    setToolbarExpanded,
    preferences,
    annotations,
  } = useAnnotationStore();

  const { applyCurrentTool, createTextAnnotation, createSymbolAnnotation } = useAnnotations();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);

  // Find previous annotations for the selected word/phrase
  const previousAnnotations = useMemo(() => {
    if (!selection?.text) return [];

    const normalizedSelection = selection.text.trim().toLowerCase();
    const suggestions: Array<{
      type: 'highlight' | 'textColor' | 'underline' | 'symbol';
      color?: string;
      symbol?: string;
      label: string;
      icon: string;
    }> = [];

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
              const colorHex = HIGHLIGHT_COLORS[textAnn.color];
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
  }, [selection?.text, annotations]);

  // Apply suggestion with one click
  const handleApplySuggestion = async (suggestion: typeof previousAnnotations[0]) => {
    if (!selection) return;
    
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
    } else if (suggestion.color) {
      // Update state for consistency
      setActiveTool(suggestion.type);
      setActiveColor(suggestion.color as any);
      // Create text annotation directly
      await createTextAnnotation(suggestion.type, suggestion.color as any);
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
          <div className="bg-scripture-accent/90 text-scripture-bg px-4 py-2 
                          flex items-center justify-between animate-slide-up">
            <span className="text-sm font-ui truncate flex-1">
              Selected: {selection.text.slice(0, 50)}
              {selection.text.length > 50 ? '...' : ''}
            </span>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={clearSelection}
                className="px-3 py-1 text-scripture-bg/80 hover:text-scripture-bg"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Smart suggestions */}
          {previousAnnotations.length > 0 && (
            <div className="bg-scripture-surface border-t border-scripture-border px-4 py-2 animate-slide-up">
              <div className="text-xs text-scripture-muted mb-2 font-ui">
                Previously used for "{selection.text.trim()}":
              </div>
              <div className="flex flex-wrap gap-2">
                {previousAnnotations.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleApplySuggestion(suggestion)}
                    className="px-3 py-1.5 rounded-lg bg-scripture-elevated hover:bg-scripture-border
                             border border-scripture-border/50 transition-colors flex items-center gap-2
                             text-xs font-ui"
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
        <div className="bg-scripture-surface border-t border-scripture-border p-4 animate-slide-up">
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
            favorites={preferences.favoriteColors}
            recents={preferences.recentColors}
          />
        </div>
      )}

      {/* Symbol picker dropdown */}
      {showSymbolPicker && activeTool === 'symbol' && (
        <div className="bg-scripture-surface border-t border-scripture-border p-4 animate-slide-up">
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
            favorites={preferences.favoriteSymbols}
            recents={preferences.recentSymbols}
          />
        </div>
      )}

      {/* Main toolbar */}
      <div className="bg-scripture-surface border-t border-scripture-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-around">
          {TOOLS.map((tool) => (
            <button
              key={tool.type}
              onClick={() => handleToolClick(tool.type)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg 
                         transition-colors touch-target
                         ${activeTool === tool.type 
                           ? 'bg-scripture-accent text-scripture-bg' 
                           : 'hover:bg-scripture-elevated'}`}
              aria-label={tool.label}
            >
              <span className="text-xl">{tool.icon}</span>
              <span className="text-xs font-ui">{tool.label}</span>
            </button>
          ))}

          {/* Expand/collapse button */}
          <button
            onClick={() => setToolbarExpanded(!toolbarExpanded)}
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg 
                       hover:bg-scripture-elevated transition-colors touch-target"
            aria-label={toolbarExpanded ? 'Collapse toolbar' : 'Expand toolbar'}
          >
            <span className="text-xl">{toolbarExpanded ? '▼' : '▲'}</span>
            <span className="text-xs font-ui">More</span>
          </button>
        </div>
      </div>
    </div>
  );
}
