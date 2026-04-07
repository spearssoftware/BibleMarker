/**
 * Bottom Tab Bar + Selection Menu
 *
 * Fixed bottom bar with Mark | Observe | Analyze | Settings tabs.
 * Panels render in the SplitLayout via PanelContainer — not here.
 */

import { useState, useEffect } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useAnnotations } from '@/hooks/useAnnotations';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { SelectionMenu } from './SelectionMenu';
import { useListStore } from '@/stores/listStore';
import { SettingsPanel } from '@/components/Settings';
import { Modal } from '@/components/shared';
import { useBibleStore } from '@/stores/bibleStore';
import { useStudyStore } from '@/stores/studyStore';
import { usePanelStore } from '@/stores/panelStore';
import type { MarkingPreset } from '@/types';
import { createMarkingPreset, getRandomHighlightColor } from '@/types';
import { filterPresetsByStudy } from '@/lib/studyFilter';
import { stripSymbols } from '@/lib/textUtils';
import { usePeopleStore } from '@/stores/peopleStore';
import { usePlaceStore } from '@/stores/placeStore';
import type { ObservationTab } from '@/components/Observation';
import type { AnalyzeTab } from '@/components/Analyze';

const TOOLS: { type: 'keywords' | 'observe' | 'analyze' | 'reference'; icon: string; label: string }[] = [
  { type: 'keywords', icon: '✏️', label: 'Mark' },
  { type: 'observe', icon: '🔍', label: 'Observe' },
  { type: 'analyze', icon: '📊', label: 'Analyze' },
  { type: 'reference', icon: '📖', label: 'Reference' },
];

export function Toolbar() {
  const {
    setActiveTool,
    setActiveColor,
    selection,
    clearSelection,
    toolbarVisible,
  } = useAnnotationStore();

  useBibleStore();
  const { createTextAnnotation, createSymbolAnnotation } = useAnnotations();
  const { presets, loadPresets, addPreset, markPresetUsed, updatePreset } = useMarkingPresetStore();
  const { activeStudyId } = useStudyStore();
  const { getOrCreateListForKeyword } = useListStore();
  const { activePanel, togglePanel, openPanel, isCollapsed } = usePanelStore();

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Load marking presets on mount
  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // Listen for custom events to open panels
  useEffect(() => {
    const handleOpenObservationTools = (e: CustomEvent<{ tab?: ObservationTab; listId?: string; verseRef?: { book: string; chapter: number; verse: number }; autoCreate?: boolean }>) => {
      const { tab = 'lists', listId, verseRef: eventVerseRef, autoCreate } = e.detail || {};
      openPanel('observe', {
        observeInitialTab: tab,
        observeInitialListId: listId,
        observeVerseRef: eventVerseRef,
        observeAutoCreate: autoCreate,
      });
      setActiveTool(null);
    };

    const handleOpenAnalyzeTools = (e: CustomEvent<{ tab?: AnalyzeTab; themeSearchTerm?: string }>) => {
      const { tab = 'chapter', themeSearchTerm } = e.detail || {};
      openPanel('analyze', {
        analyzeInitialTab: tab,
        analyzeThemeSearchTerm: themeSearchTerm,
      });
      setActiveTool(null);
    };

    const handleOpenSettings = () => {
      setShowSettingsModal(true);
    };

    window.addEventListener('openObservationTools', handleOpenObservationTools as EventListener);
    window.addEventListener('openAnalyzeTools', handleOpenAnalyzeTools as EventListener);
    window.addEventListener('openSettings', handleOpenSettings as EventListener);
    return () => {
      window.removeEventListener('openObservationTools', handleOpenObservationTools as EventListener);
      window.removeEventListener('openAnalyzeTools', handleOpenAnalyzeTools as EventListener);
      window.removeEventListener('openSettings', handleOpenSettings as EventListener);
    };
  }, [openPanel, setActiveTool]);

  // When the user clicks in the verse window with an empty selection, clear state
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-marking-toolbar]')) return;

      const verseWindow = target.closest('.chapter-view, main, [data-verse]');
      if (!verseWindow) return;

      const sel = window.getSelection();
      const empty = !sel || sel.rangeCount === 0 || sel.isCollapsed;
      const hasStoreSelection = !!useAnnotationStore.getState().selection;

      if (empty && hasStoreSelection) {
        clearSelection();
        setActiveTool(null);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [clearSelection, setActiveTool]);

  // Apply a key word (preset) to the current selection
  const applyPresetToSelection = async (preset: MarkingPreset) => {
    if (!selection) return;

    await markPresetUsed(preset.id);
    const pid = preset.id;
    if (preset.symbol && preset.highlight) {
      setActiveTool('symbol');
      setActiveColor(preset.highlight.color);
      await createSymbolAnnotation(preset.symbol, 'before', preset.highlight.color, 'above', pid, { clearSelection: false });
      setActiveTool(preset.highlight.style === 'textColor' ? 'textColor' : preset.highlight.style === 'underline' ? 'underline' : 'highlight');
      await createTextAnnotation(preset.highlight.style, preset.highlight.color, pid);
    } else if (preset.symbol) {
      setActiveTool('symbol');
      await createSymbolAnnotation(preset.symbol, 'before', preset.highlight?.color, 'above', pid);
    } else if (preset.highlight) {
      setActiveTool(preset.highlight.style === 'textColor' ? 'textColor' : preset.highlight.style === 'underline' ? 'underline' : 'highlight');
      setActiveColor(preset.highlight.color);
      await createTextAnnotation(preset.highlight.style, preset.highlight.color, pid);
    }
    setActiveTool(null);
  };

  // Add the selection as a variant to a key word and apply
  const addToVariantsAndApply = async (preset: MarkingPreset) => {
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
    const newVariants = [...(preset.variants || []), { text: trimmed }];
    await updatePreset({ ...preset, variants: newVariants });
    await applyPresetToSelection(preset);
  };

  const quickAddKeyword = async (type: 'person' | 'place') => {
    if (!selection) return;
    const word = selection.text.trim();
    if (!word) return;

    const config = type === 'person'
      ? { symbol: 'person' as const, category: 'people' as const }
      : { symbol: 'mapPin' as const, category: 'places' as const };

    const color = getRandomHighlightColor();
    const preset = createMarkingPreset({
      word,
      symbol: config.symbol,
      highlight: { style: 'highlight', color },
      category: config.category,
      studyId: activeStudyId || undefined,
      bookScope: selection.book,
    });

    await addPreset(preset);
    await applyPresetToSelection(preset);

    const verseRef = { book: selection.book, chapter: selection.chapter, verse: selection.startVerse };
    if (type === 'person') {
      await usePeopleStore.getState().createPerson(word, verseRef, undefined, preset.id, undefined, activeStudyId || undefined);
    } else {
      await usePlaceStore.getState().createPlace(word, verseRef, undefined, preset.id, undefined, activeStudyId || undefined);
    }
  };

  const handleToolClick = (toolType: 'keywords' | 'observe' | 'analyze' | 'reference') => {
    togglePanel(toolType);
    setActiveTool(null);
  };

  // Keyboard shortcuts for toolbar tools (number keys 1-3)
  useKeyboardShortcuts({
    onToolbarTool: (toolIndex: number) => {
      if (toolIndex >= 0 && toolIndex < TOOLS.length) {
        handleToolClick(TOOLS[toolIndex].type);
      }
    },
    enabled: toolbarVisible,
  });

  if (!toolbarVisible) return null;

  return (
    <>
      {/* Settings Modal */}
      <Modal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        size="full"
        title="Settings"
        showCloseButton={true}
        contentClassName="flex-1 min-h-0 flex flex-col"
      >
        <SettingsPanel onClose={() => setShowSettingsModal(false)} />
      </Modal>

      <div className="fixed left-0 right-0 z-30"
           style={{
             bottom: 'var(--keyboard-height, 0px)',
             paddingLeft: 'env(safe-area-inset-left, 0px)',
             paddingRight: 'env(safe-area-inset-right, 0px)',
           }}
          data-marking-toolbar
          onWheel={(e) => e.stopPropagation()}>

        {/* Selection Menu */}
        {selection && (
          <SelectionMenu
            selection={selection}
            presets={filterPresetsByStudy(presets, activeStudyId)}
            strongsNumbers={selection.strongsNumbers}
            onApplyPreset={applyPresetToSelection}
            onAddAsVariant={addToVariantsAndApply}
            onOpenKeyWordManager={() => {
              openPanel('keywords', {
                keywordInitialWord: selection?.text?.trim() || undefined,
              });
              setActiveTool(null);
            }}
            onQuickAddKeyword={quickAddKeyword}
            onAddToList={async () => {
              if (!selection) return;
              const strippedText = stripSymbols(selection.text).toLowerCase().trim();
              const matchingPreset = presets.find(p => {
                if (p.word?.toLowerCase().trim() === strippedText) return true;
                if (p.variants?.some(v => {
                  const variantText = typeof v === 'string' ? v : v.text;
                  return variantText.toLowerCase().trim() === strippedText;
                })) return true;
                return false;
              });

              const selectionVerseRef = {
                book: selection.book,
                chapter: selection.chapter,
                verse: selection.startVerse,
              };

              if (matchingPreset) {
                try {
                  const list = await getOrCreateListForKeyword(matchingPreset.id, activeStudyId ?? undefined, selection.book);
                  openPanel('observe', {
                    observeInitialTab: 'lists',
                    observeInitialListId: list.id,
                    observeVerseRef: selectionVerseRef,
                    observeAutoCreate: true,
                  });
                } catch (err) {
                  console.error('[Toolbar] Failed to get/create list for keyword:', err);
                  openPanel('observe', {
                    observeInitialTab: 'lists',
                  });
                }
              } else {
                openPanel('observe', {
                  observeInitialTab: 'lists',
                });
              }
              setActiveTool(null);
            }}
            onReferenceLookup={() => {
              openPanel('reference', {
                referenceInitialTab: 'search',
                referenceSearchQuery: selection?.text?.trim() || undefined,
              });
              setActiveTool(null);
            }}
            onStrongsLookup={selection.strongsNumbers ? () => {
              openPanel('reference', {
                referenceInitialTab: 'strongs',
                referenceStrongsNumber: selection.strongsNumbers![0],
              });
              setActiveTool(null);
            } : undefined}
            onCancel={() => {
              window.getSelection()?.removeAllRanges();
              clearSelection();
            }}
            onClose={() => {
              clearSelection();
            }}
          />
        )}

        {/* Tab Bar: Mark | Observe | Analyze | Settings */}
        <div className="bg-scripture-surface/80 backdrop-blur-md border-t border-scripture-border/30"
             style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="max-w-lg mx-auto px-2 py-1.5 flex items-center justify-around">
            {TOOLS.map((tool) => {
              const isActive = activePanel === tool.type && !isCollapsed;
              const dataAttr = tool.type === 'keywords' ? 'data-toolbar-keywords'
                : tool.type === 'observe' ? 'data-toolbar-observe'
                : tool.type === 'analyze' ? 'data-toolbar-analyze'
                : undefined;
              return (
                <button
                  key={tool.type}
                  {...(dataAttr ? { [dataAttr]: true } : {})}
                  onClick={() => handleToolClick(tool.type)}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg
                             transition-all duration-200 touch-target
                             border border-scripture-border/30 hover:border-scripture-border/50
                             ${isActive
                               ? 'bg-scripture-accent text-scripture-bg shadow-md'
                               : 'hover:bg-scripture-elevated'}`}
                  aria-label={tool.label}
                >
                  <span className="text-lg">{tool.icon}</span>
                  <span className="text-[10px] font-ui font-medium leading-tight">{tool.label}</span>
                </button>
              );
            })}
            <button
              data-toolbar-settings
              onClick={() => {
                setShowSettingsModal(v => !v);
                // Close any open panel when opening settings
                if (!showSettingsModal) {
                  usePanelStore.getState().closePanel();
                }
              }}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg
                         transition-all duration-200 touch-target
                         border border-scripture-border/30 hover:border-scripture-border/50
                         ${showSettingsModal
                           ? 'bg-scripture-accent text-scripture-bg shadow-md'
                           : 'hover:bg-scripture-elevated'}`}
              aria-label="Settings"
            >
              <span className="text-lg">⚙️</span>
              <span className="text-[10px] font-ui font-medium leading-tight">Settings</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
