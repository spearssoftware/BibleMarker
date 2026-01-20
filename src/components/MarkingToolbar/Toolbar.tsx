/**
 * Marking Toolbar Component
 * 
 * Bottom toolbar for Precept-style marking with colors, highlights, and symbols.
 */

import { useState, useMemo, useEffect } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useAnnotations } from '@/hooks/useAnnotations';
import { ColorPicker } from './ColorPicker';
import { SymbolPicker } from './SymbolPicker';
import { ModuleManager } from './ModuleManager';
import { KeyWordManager } from '@/components/KeyWords';
import { AnnotationLegend } from '@/components/BibleReader';
import { StudyManager } from '@/components/Study';
import { AddToList } from '@/components/Lists';
import { StudyToolsPanel } from '@/components/Summary';
import { SettingsPanel } from '@/components/Settings';
import { HIGHLIGHT_COLORS, SYMBOLS } from '@/types/annotation';
import { clearDatabase, updatePreferences, clearBookAnnotations } from '@/lib/db';
import { useBibleStore } from '@/stores/bibleStore';
import { getBookById } from '@/types/bible';
import { findMatchingPresets, isCommonPronoun, type MarkingPreset } from '@/types/keyWord';
import type { AnnotationType, TextAnnotation, SymbolAnnotation } from '@/types/annotation';

const COLOR_STYLES = ['highlight', 'textColor', 'underline'] as const;
const COLOR_STYLE_LABELS: Record<(typeof COLOR_STYLES)[number], string> = {
  highlight: 'Highlight',
  textColor: 'Text',
  underline: 'Underline',
};

const TOOLS: { type: 'color' | 'symbol' | 'keyWords' | 'legend' | 'studyTools' | 'more'; icon: string; label: string }[] = [
  { type: 'color', icon: '🖍', label: 'Color' },
  { type: 'symbol', icon: '✝', label: 'Symbol' },
  { type: 'legend', icon: '📋', label: 'Legend' },
  { type: 'keyWords', icon: '🔑', label: 'Key Words' },
  { type: 'studyTools', icon: '📚', label: 'Study' },
  { type: 'more', icon: '⚙️', label: 'Settings' },
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

  const { currentBook, currentModuleId } = useBibleStore();
  const { applyCurrentTool, createTextAnnotation, createSymbolAnnotation } = useAnnotations();
  const { presets, loadPresets, markPresetUsed, updatePreset } = useMarkingPresetStore();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showModuleManager, setShowModuleManager] = useState(false);
  const [showKeyWordManager, setShowKeyWordManager] = useState(false);
  const [showKeyWordApplyPicker, setShowKeyWordApplyPicker] = useState(false);
  const [showAddAsVariantPicker, setShowAddAsVariantPicker] = useState(false);
  const [showLegendOverlay, setShowLegendOverlay] = useState(false);
  const [showStudyManager, setShowStudyManager] = useState(false);
  const [showStudyToolsPanel, setShowStudyToolsPanel] = useState(false);
  const [showAddToList, setShowAddToList] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Load marking presets on mount
  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // When the user clicks in the verse window (not in the overlay), and the browser selection 
  // is cleared/collapsed, clear our selection and close the overlays.
  // Skip if clicking inside the toolbar/overlays (e.g. user is typing in Key Words).
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Don't close if clicking inside the toolbar/overlay area
      if (target.closest('[data-marking-toolbar]')) return;
      
      // Only close if clicking in the verse window (main content area)
      const verseWindow = target.closest('.chapter-view, main, [data-verse]');
      if (!verseWindow) return;
      
      // Check if selection is empty/collapsed
      const sel = window.getSelection();
      const empty = !sel || sel.rangeCount === 0 || sel.isCollapsed;
      const hasStoreSelection = !!useAnnotationStore.getState().selection;
      
      if (empty && hasStoreSelection) {
        clearSelection();
        setShowColorPicker(false);
        setShowSymbolPicker(false);
        setShowKeyWordManager(false);
        setShowKeyWordApplyPicker(false);
        setShowAddAsVariantPicker(false);
        setShowLegendOverlay(false);
        setShowStudyToolsPanel(false);
        setActiveTool(null);
      }
    };
    
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [clearSelection, setActiveTool]);

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


  // Find previous annotations and matching presets (key words) for the selected word/phrase
  const previousAnnotations = useMemo(() => {
    if (!selection?.text) return [];

    const normalizedSelection = selection.text.trim().toLowerCase();
    const suggestions: Array<{
      type: 'highlight' | 'textColor' | 'underline' | 'symbol' | 'preset';
      color?: string;
      symbol?: string;
      label: string;
      icon: string;
      presetId?: string;
    }> = [];

    // Check for matching presets (key words) with autoSuggest
    const matching = findMatchingPresets(selection.text.trim(), presets);
    for (const p of matching) {
      if (p.autoSuggest && p.word) {
        const sym = p.symbol ? SYMBOLS[p.symbol] : '🔑';
        const color = p.highlight?.color;
        suggestions.push({
          type: 'preset',
          symbol: p.symbol,
          color,
          label: `Key Word: ${p.word}`,
          icon: sym,
          presetId: p.id,
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
  }, [selection?.text, annotations, presets]);

  // Apply a key word (preset) to the current selection — e.g. mark "He" as Jesus when context shows it
  const applyPresetToSelection = async (preset: MarkingPreset) => {
    if (!selection) return;
    
    // Check if the selected text matches the preset's word or variants
    const trimmed = selection.text.trim();
    const lower = trimmed.toLowerCase();
    const isAlreadyWord = preset.word && lower === preset.word.toLowerCase();
    const isAlreadyVariant = (preset.variants || []).some((v) => {
      const variantText = typeof v === 'string' ? v : v.text;
      return variantText.toLowerCase() === lower;
    });
    
    // If the selected text doesn't match the word or any variant, and it's a common pronoun,
    // we don't add it as a variant (which would cause it to match everywhere).
    // Instead, we just create the manual annotation - it will show up in this translation,
    // but won't trigger cross-translation matching because it's not in the variants list.
    // This way pronouns are only marked once (the instance you mark), not across all translations.
    
    await markPresetUsed(preset.id);
    const pid = preset.id;
    if (preset.symbol && preset.highlight) {
      // Both: symbol inline before + highlight/underline/color on the word
      setActiveTool('symbol');
      setActiveSymbol(preset.symbol);
      setActiveColor(preset.highlight.color);
      await createSymbolAnnotation(preset.symbol, 'before', preset.highlight.color, 'above', pid, { clearSelection: false });
      setActiveTool(preset.highlight.style === 'textColor' ? 'textColor' : preset.highlight.style === 'underline' ? 'underline' : 'highlight');
      await createTextAnnotation(preset.highlight.style, preset.highlight.color, pid);
    } else if (preset.symbol) {
      setActiveTool('symbol');
      setActiveSymbol(preset.symbol);
      setActiveColor(preset.highlight?.color ?? activeColor);
      await createSymbolAnnotation(preset.symbol, 'before', preset.highlight?.color, 'above', pid);
    } else if (preset.highlight) {
      setActiveTool(preset.highlight.style === 'textColor' ? 'textColor' : preset.highlight.style === 'underline' ? 'underline' : 'highlight');
      setActiveColor(preset.highlight.color);
      await createTextAnnotation(preset.highlight.style, preset.highlight.color, pid);
    }
    setShowKeyWordApplyPicker(false);
    setShowAddAsVariantPicker(false);
    setShowColorPicker(false);
    setShowSymbolPicker(false);
    setActiveTool(null);
  };

  // Add the selection as a variant to a key word and apply. If it's already the word or a variant, just apply.
  const addToVariantsAndApply = async (preset: MarkingPreset) => {
    setShowAddAsVariantPicker(false);
    if (!selection) return;
    const trimmed = selection.text.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const isAlreadyWord = preset.word && lower === preset.word.toLowerCase();
    const isAlreadyVariant = (preset.variants || []).some((v) => {
      const variantText = typeof v === 'string' ? v : v.text;
      return variantText.toLowerCase() === lower;
    });
    if (isAlreadyWord || isAlreadyVariant) {
      await applyPresetToSelection(preset);
      return;
    }
    // Add as a new variant (global scope by default - no bookScope/chapterScope)
    const newVariants = [...(preset.variants || []), { text: trimmed }];
    await updatePreset({ ...preset, variants: newVariants });
    await applyPresetToSelection(preset);
  };

  // Apply suggestion with one click
  const handleApplySuggestion = async (suggestion: typeof previousAnnotations[0]) => {
    if (!selection) return;
    
    if (suggestion.type === 'preset' && suggestion.presetId) {
      const preset = presets.find((p) => p.id === suggestion.presetId);
      if (preset) await applyPresetToSelection(preset);
      return;
    }
    
    if (suggestion.type === 'symbol' && suggestion.symbol) {
      setActiveTool('symbol');
      setActiveSymbol(suggestion.symbol as any);
      if (suggestion.color) setActiveColor(suggestion.color as any);
      if (suggestion.color) {
        await createSymbolAnnotation(suggestion.symbol as any, 'before', suggestion.color as any, 'above', undefined, { clearSelection: false });
        await createTextAnnotation('highlight', suggestion.color as any);
      } else {
        await createSymbolAnnotation(suggestion.symbol as any, 'before', undefined, 'above');
      }
    } else if (suggestion.type !== 'preset' && suggestion.color) {
      // Update state for consistency
      setActiveTool(suggestion.type as AnnotationType);
      setActiveColor(suggestion.color as any);
      // Create text annotation directly
      await createTextAnnotation(suggestion.type as 'highlight' | 'textColor' | 'underline', suggestion.color as any);
    }
  };

  if (!toolbarVisible) return null;

  const isColorActive = activeTool === 'highlight' || activeTool === 'textColor' || activeTool === 'underline';

  const handleToolClick = (toolType: (typeof TOOLS)[number]['type']) => {
    if (toolType === 'color') {
      if (isColorActive) {
        setActiveTool(null);
        setShowColorPicker(false);
      } else {
        setActiveTool('highlight');
        setShowColorPicker(true);
        setShowSymbolPicker(false);
        setShowKeyWordManager(false);
        setShowLegendOverlay(false);
        setShowStudyToolsPanel(false);
        if (selection) window.dispatchEvent(new CustomEvent('markingOverlayOpened'));
      }
    } else if (toolType === 'symbol') {
      if (activeTool === 'symbol') {
        setActiveTool(null);
        setShowSymbolPicker(false);
      } else {
        setActiveTool('symbol');
        setShowSymbolPicker(true);
        setShowColorPicker(false);
        setShowKeyWordManager(false);
        setShowLegendOverlay(false);
        setShowStudyToolsPanel(false);
        if (selection) window.dispatchEvent(new CustomEvent('markingOverlayOpened'));
      }
    } else if (toolType === 'keyWords') {
      const willOpen = !showKeyWordManager;
      setShowKeyWordManager((v) => !v);
      setShowColorPicker(false);
      setShowSymbolPicker(false);
      setShowSettingsPanel(false);
      setShowLegendOverlay(false);
      setShowStudyToolsPanel(false);
      if (willOpen) setActiveTool(null);
      if (willOpen && selection) window.dispatchEvent(new CustomEvent('markingOverlayOpened'));
    } else if (toolType === 'legend') {
      setShowLegendOverlay((v) => !v);
      setShowColorPicker(false);
      setShowSymbolPicker(false);
      setShowKeyWordManager(false);
      setShowSettingsPanel(false);
      setShowStudyToolsPanel(false);
      if (!showLegendOverlay) setActiveTool(null);
    } else if (toolType === 'studyTools') {
      const willOpen = !showStudyToolsPanel;
      setShowStudyToolsPanel((v) => !v);
      setShowColorPicker(false);
      setShowSymbolPicker(false);
      setShowKeyWordManager(false);
      setShowSettingsPanel(false);
      setShowLegendOverlay(false);
      if (willOpen) setActiveTool(null);
    } else if (toolType === 'more') {
      const willOpen = !showSettingsPanel;
      setShowSettingsPanel(!showSettingsPanel);
      setShowColorPicker(false);
      setShowSymbolPicker(false);
      setShowKeyWordManager(false);
      setShowLegendOverlay(false);
      setShowStudyToolsPanel(false);
      if (willOpen) setActiveTool(null);
    }
  };


  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 
                    pb-[env(safe-area-inset-bottom)]"
         data-marking-toolbar>
      {/* Selection indicator */}
      {selection && (
        <>
          <div className="bg-scripture-accent/95 backdrop-blur-sm text-scripture-bg px-3 py-2 
                          flex items-center justify-between animate-slide-up shadow-lg border-t border-scripture-accent/30">
            <span className="text-sm font-ui truncate flex-1 font-medium">
              Selected: {selection.text.slice(0, 50)}
              {selection.text.length > 50 ? '...' : ''}
            </span>
            <div className="flex items-center gap-2 ml-2">
              {/* Apply key word: pick Jesus, Nicodemus, etc. to mark He/him the same way */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowAddAsVariantPicker(false);
                    setShowKeyWordApplyPicker((v) => !v);
                  }}
                  className="px-2.5 py-1 text-xs font-ui text-scripture-bg/90 hover:text-scripture-bg
                           transition-colors rounded-lg hover:bg-scripture-bg/20 flex items-center gap-1"
                  title="Apply a key word (e.g. mark He/him as Jesus)"
                >
                  <span>🔑</span>
                  <span>Apply key word</span>
                  <span className="text-[0.7rem] opacity-80">▼</span>
                </button>
                {showKeyWordApplyPicker && (
                  <div
                    className="absolute right-0 bottom-full mb-1 w-56 max-h-64 overflow-y-auto
                               bg-scripture-surface border border-scripture-border/50 rounded-xl shadow-xl
                               py-1.5 z-50 custom-scrollbar"
                  >
                    {presets
                      .filter((p) => p.word)
                      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || (a.word || '').localeCompare(b.word || ''))
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() => applyPresetToSelection(p)}
                          className="w-full px-3 py-2 text-left text-sm font-ui text-scripture-text
                                   hover:bg-scripture-elevated/80 flex items-center gap-2"
                        >
                          {p.symbol && (
                            <span
                              className="text-base"
                              style={{
                                color: p.highlight?.color ? HIGHLIGHT_COLORS[p.highlight.color] : undefined,
                              }}
                            >
                              {SYMBOLS[p.symbol]}
                            </span>
                          )}
                          {p.highlight && (
                            <span
                              className="w-4 h-4 rounded border border-scripture-border/30 flex-shrink-0"
                              style={{ backgroundColor: HIGHLIGHT_COLORS[p.highlight.color] + '60' }}
                            />
                          )}
                          <span className="truncate">{p.word}</span>
                        </button>
                      ))}
                    {presets.filter((p) => p.word).length === 0 && (
                      <div className="px-3 py-3 text-xs text-scripture-muted">
                        No key words yet. Add one in Key Words.
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Add as variant: only when selection is not a pronoun and we have key words */}
              {!isCommonPronoun(selection.text) && presets.filter((p) => p.word).length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowKeyWordApplyPicker(false);
                      setShowAddAsVariantPicker((v) => !v);
                    }}
                className="px-2.5 py-1 text-xs font-ui text-scripture-bg/90 hover:text-scripture-bg
                           transition-colors rounded-lg hover:bg-scripture-bg/20 flex items-center gap-1"
                    title="Add this word as a variant to an existing key word"
                  >
                    <span>➕</span>
                    <span>Add as variant</span>
                    <span className="text-[0.7rem] opacity-80">▼</span>
                  </button>
                  {showAddAsVariantPicker && (
                    <div
                      className="absolute right-0 bottom-full mb-1 w-56 max-h-64 overflow-y-auto
                                 bg-scripture-surface border border-scripture-border/50 rounded-xl shadow-xl
                                 py-1.5 z-50 custom-scrollbar"
                    >
                      {presets
                        .filter((p) => p.word)
                        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || (a.word || '').localeCompare(b.word || ''))
                        .map((p) => (
                          <button
                            key={p.id}
                            onClick={() => addToVariantsAndApply(p)}
                            className="w-full px-3 py-2 text-left text-sm font-ui text-scripture-text
                                     hover:bg-scripture-elevated/80 flex items-center gap-2"
                          >
                            {p.symbol && (
                              <span
                                className="text-base"
                                style={{
                                  color: p.highlight?.color ? HIGHLIGHT_COLORS[p.highlight.color] : undefined,
                                }}
                              >
                                {SYMBOLS[p.symbol]}
                              </span>
                            )}
                            {p.highlight && (
                              <span
                                className="w-4 h-4 rounded border border-scripture-border/30 flex-shrink-0"
                                style={{ backgroundColor: HIGHLIGHT_COLORS[p.highlight.color] + '60' }}
                              />
                            )}
                            <span className="truncate">{p.word}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => {
                  setShowKeyWordApplyPicker(false);
                  setShowAddAsVariantPicker(false);
                  setShowKeyWordManager(true);
                  setShowColorPicker(false);
                  setShowSymbolPicker(false);
                  setShowSystemMenu(false);
                  setActiveTool(null);
                  if (selection) window.dispatchEvent(new CustomEvent('markingOverlayOpened'));
                }}
                className="px-2.5 py-1 text-xs font-ui text-scripture-bg/90 hover:text-scripture-bg
                           transition-colors rounded-lg hover:bg-scripture-bg/20 flex items-center gap-1"
                title="Make this a key word"
              >
                <span>➕</span>
                <span>Key Word</span>
              </button>
              <button
                onClick={() => {
                  setShowKeyWordApplyPicker(false);
                  setShowAddAsVariantPicker(false);
                  setShowAddToList(true);
                }}
                className="px-2.5 py-1 text-xs font-ui text-scripture-bg/90 hover:text-scripture-bg
                           transition-colors rounded-lg hover:bg-scripture-bg/20 flex items-center gap-1"
                title="Add observation to list"
              >
                <span>📝</span>
                <span>Add Observation</span>
              </button>
              <button
                onClick={() => {
                  setShowKeyWordApplyPicker(false);
                  setShowAddAsVariantPicker(false);
                  setShowColorPicker(false);
                  setShowSymbolPicker(false);
                  setShowKeyWordManager(false);
                  setActiveTool(null);
                  window.getSelection()?.removeAllRanges();
                  clearSelection();
                }}
                    className="px-2.5 py-1 text-xs font-ui text-scripture-bg/90 hover:text-scripture-bg
                           transition-colors rounded-lg hover:bg-scripture-bg/20"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Smart suggestions */}
          {previousAnnotations.length > 0 && (
            <div className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 px-3 py-2 animate-slide-up">
              <div className="text-sm text-scripture-muted mb-2 font-ui font-medium">
                Previously used for "{selection.text.trim()}":
              </div>
              <div className="flex flex-wrap gap-2">
                {previousAnnotations.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleApplySuggestion(suggestion)}
                    className="px-2.5 py-1.5 rounded-lg bg-scripture-elevated/80 hover:bg-scripture-border
                             border border-scripture-border/50 transition-all duration-200 flex items-center gap-1.5
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
                    {(suggestion.type === 'symbol' || suggestion.type === 'preset') && suggestion.icon ? (
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
                      {suggestion.type === 'preset' ? suggestion.label : suggestion.type === 'highlight' ? 'Highlight' :
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

      {/* Color picker: style (Highlight / Text / Underline) + color grid */}
      {showColorPicker && isColorActive && (
        <div className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 p-4 animate-slide-up shadow-lg max-h-[50vh] overflow-y-auto custom-scrollbar">
          <div className="mb-3">
            <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-2">
              Style
            </div>
            <div className="flex gap-2">
              {COLOR_STYLES.map((style) => (
                <button
                  key={style}
                  onClick={() => setActiveTool(style)}
                  className={`flex-1 px-3 py-2 rounded-lg font-ui text-sm transition-all duration-200
                            ${activeTool === style
                              ? 'bg-scripture-accent text-scripture-bg shadow-md'
                              : 'bg-scripture-elevated/80 text-scripture-text border border-scripture-border/50 hover:bg-scripture-border/30'}`}
                >
                  {COLOR_STYLE_LABELS[style]}
                </button>
              ))}
            </div>
          </div>
          <ColorPicker
            selectedColor={activeColor}
            onSelect={async (color) => {
              setActiveColor(color);
              if (selection) await applyCurrentTool(color);
            }}
            recents={preferences.recentColors}
          />
        </div>
      )}

      {/* Symbol picker dropdown */}
      {showSymbolPicker && activeTool === 'symbol' && (
        <div className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 p-4 animate-slide-up shadow-lg max-h-[50vh] overflow-y-auto custom-scrollbar">
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

      {/* Settings Panel */}
      {showSettingsPanel && (
        <div 
          className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 
                     animate-slide-up shadow-lg flex flex-col h-[60vh] max-h-[60vh] min-h-[400px] overflow-hidden"
        >
          <SettingsPanel onClose={() => setShowSettingsPanel(false)} />
        </div>
      )}

      {/* Module Manager */}
      {showModuleManager && (
        <ModuleManager 
          onClose={() => setShowModuleManager(false)}
          onTranslationsUpdated={() => {
            // Trigger a page event to notify NavigationBar to reload translations
            window.dispatchEvent(new Event('translationsUpdated'));
          }}
        />
      )}

      {/* Study Manager */}
      {showStudyManager && (
        <StudyManager onClose={() => setShowStudyManager(false)} />
      )}

      {/* Study Tools Panel */}
      {showStudyToolsPanel && (
        <div 
          className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 
                     animate-slide-up shadow-lg flex flex-col h-[50vh] max-h-[50vh] min-h-[200px] overflow-hidden"
        >
          <StudyToolsPanel onClose={() => setShowStudyToolsPanel(false)} />
        </div>
      )}

      {/* Add to List */}
      {showAddToList && selection && (
        <AddToList
          verseRef={{
            book: selection.book,
            chapter: selection.chapter,
            verse: selection.startVerse,
          }}
          selectedText={selection.text}
          onClose={() => {
            setShowAddToList(false);
            clearSelection();
          }}
          onAdded={() => {
            // Optionally reload lists if needed
          }}
        />
      )}


      {/* Key Words - bottom overlay (unified with Color / Symbol) */}
      {showKeyWordManager && (
        <div 
          className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 
                     animate-slide-up shadow-lg flex flex-col h-[50vh] max-h-[50vh] min-h-[200px] overflow-hidden"
        >
          <KeyWordManager 
            onClose={() => setShowKeyWordManager(false)} 
            initialWord={selection?.text?.trim() || undefined}
            initialSymbol={activeSymbol}
            initialColor={activeColor}
            onPresetCreated={async (preset) => {
              await applyPresetToSelection(preset);
              setShowKeyWordManager(false);
            }}
          />
        </div>
      )}

      {/* Annotation Legend overlay */}
      {showLegendOverlay && (
        <div 
          className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 
                     animate-slide-up shadow-lg flex flex-col max-h-[50vh] min-h-[120px] overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-scripture-border/50 flex-shrink-0">
            <h2 className="text-lg font-ui font-semibold text-scripture-text">
              Annotation Legend
            </h2>
            <button
              onClick={() => setShowLegendOverlay(false)}
              className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
              aria-label="Close legend"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <AnnotationLegend annotations={annotations} />
          </div>
        </div>
      )}

      {/* Main toolbar: Color | Symbol | Key Words | Settings */}
      <div className="bg-scripture-surface/95 backdrop-blur-sm border-t border-scripture-border/50 shadow-lg">
        <div className="max-w-lg mx-auto px-2 py-1.5 flex items-center justify-around">
          {TOOLS.map((tool) => {
            const isActive =
              tool.type === 'color' ? isColorActive
              : tool.type === 'symbol' ? activeTool === 'symbol'
              : tool.type === 'keyWords' ? showKeyWordManager
              : tool.type === 'legend' ? showLegendOverlay
              : tool.type === 'studyTools' ? showStudyToolsPanel
              : tool.type === 'more' ? showSettingsPanel
              : false;
            return (
              <button
                key={tool.type}
                onClick={() => handleToolClick(tool.type)}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg 
                           transition-all duration-200 touch-target
                           ${isActive
                             ? 'bg-scripture-accent text-scripture-bg shadow-md scale-105'
                             : 'hover:bg-scripture-elevated hover:scale-105 active:scale-95'}`}
                aria-label={tool.label}
              >
                <span className="text-lg">{tool.icon}</span>
                <span className="text-[10px] font-ui font-medium leading-tight">{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
