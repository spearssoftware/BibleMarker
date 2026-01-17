/**
 * Annotations Hook
 * 
 * Handles creating, loading, and managing annotations for the current chapter.
 */

import { useCallback } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { db, saveAnnotation, deleteAnnotation, getChapterAnnotations } from '@/lib/db';
import type { Annotation, TextAnnotation, SymbolAnnotation, AnnotationType, HighlightColor, SymbolKey } from '@/types/annotation';

export function useAnnotations() {
  const { currentBook, currentChapter, currentModuleId } = useBibleStore();
  const { 
    selection, 
    activeColor, 
    activeSymbol, 
    activeTool,
    setAnnotations,
    clearSelection,
    addRecentColor,
    addRecentSymbol,
  } = useAnnotationStore();

  /**
   * Load annotations for the current chapter
   */
  const loadAnnotations = useCallback(async () => {
    if (!currentModuleId) return;
    
    const annotations = await getChapterAnnotations(
      currentModuleId,
      currentBook,
      currentChapter
    );
    setAnnotations(annotations);
  }, [currentModuleId, currentBook, currentChapter, setAnnotations]);

  /**
   * Create a highlight, text color, or underline annotation
   */
  const createTextAnnotation = useCallback(async (
    type: 'highlight' | 'textColor' | 'underline',
    color: HighlightColor
  ): Promise<Annotation | null> => {
    console.log('[useAnnotations] createTextAnnotation called:', { type, color, selection, currentModuleId });
    
    if (!selection || !currentModuleId) {
      console.log('[useAnnotations] Missing selection or moduleId');
      return null;
    }

    const annotation: TextAnnotation = {
      id: crypto.randomUUID(),
      moduleId: currentModuleId,
      type,
      startRef: {
        book: selection.book,
        chapter: selection.chapter,
        verse: selection.startVerse,
      },
      endRef: {
        book: selection.book,
        chapter: selection.chapter,
        verse: selection.endVerse,
      },
      startWordIndex: selection.startWordIndex,
      endWordIndex: selection.endWordIndex,
      selectedText: selection.text,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      color,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log('[useAnnotations] Saving annotation:', annotation);
    await saveAnnotation(annotation);
    console.log('[useAnnotations] Annotation saved!');
    
    addRecentColor(color);
    
    // Reload annotations
    console.log('[useAnnotations] Reloading annotations...');
    await loadAnnotations();
    console.log('[useAnnotations] Clearing selection...');
    clearSelection();
    
    return annotation;
  }, [selection, currentModuleId, addRecentColor, loadAnnotations, clearSelection]);

  /**
   * Create a symbol annotation
   */
  const createSymbolAnnotation = useCallback(async (
    symbol: SymbolKey,
    position: 'before' | 'after' | 'center' = 'center',
    color?: HighlightColor,
    placement: 'above' | 'overlay' = 'above'
  ): Promise<Annotation | null> => {
    if (!selection || !currentModuleId) return null;

    const annotation: SymbolAnnotation = {
      id: crypto.randomUUID(),
      moduleId: currentModuleId,
      type: 'symbol',
      ref: {
        book: selection.book,
        chapter: selection.chapter,
        verse: selection.startVerse,
      },
      wordIndex: selection.startWordIndex,
      position: position === 'center' ? 'center' : position,
      placement: position === 'center' ? placement : undefined,
      selectedText: selection.text,
      startWordIndex: selection.startWordIndex,
      endWordIndex: selection.endWordIndex,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      endRef: selection.startVerse !== selection.endVerse ? {
        book: selection.book,
        chapter: selection.chapter,
        verse: selection.endVerse,
      } : undefined,
      symbol,
      color,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await saveAnnotation(annotation);
    addRecentSymbol(symbol);
    
    // Reload annotations
    await loadAnnotations();
    clearSelection();
    
    return annotation;
  }, [selection, currentModuleId, addRecentSymbol, loadAnnotations, clearSelection]);

  /**
   * Apply the current tool with current settings
   * @param overrideColor - Optional color to use instead of activeColor (for immediate application)
   * @param overrideSymbol - Optional symbol to use instead of activeSymbol (for immediate application)
   */
  const applyCurrentTool = useCallback(async (overrideColor?: HighlightColor, overrideSymbol?: SymbolKey) => {
    const colorToUse = overrideColor ?? activeColor;
    const symbolToUse = overrideSymbol ?? activeSymbol;
    
    console.log('[useAnnotations] applyCurrentTool called v2:', { 
      hasSelection: !!selection, 
      activeTool, 
      activeColor,
      overrideColor,
      colorToUse,
      activeSymbol,
      overrideSymbol,
      symbolToUse,
      currentModuleId,
    });
    
    if (!selection || !activeTool) {
      console.log('[useAnnotations] Missing selection or activeTool, returning');
      return;
    }

    try {
      if (activeTool === 'symbol') {
        console.log('[useAnnotations] Creating symbol annotation...');
        // Symbols are positioned at center of selection, overlay on text by default
        const result = await createSymbolAnnotation(symbolToUse, 'center', colorToUse, 'overlay');
        console.log('[useAnnotations] Symbol annotation result:', result);
      } else {
        console.log('[useAnnotations] Creating text annotation...');
        const result = await createTextAnnotation(activeTool as 'highlight' | 'textColor' | 'underline', colorToUse);
        console.log('[useAnnotations] Text annotation result:', result);
      }
    } catch (error) {
      console.error('[useAnnotations] Error applying tool:', error);
    }
  }, [selection, activeTool, activeColor, activeSymbol, currentModuleId, createTextAnnotation, createSymbolAnnotation]);

  /**
   * Remove an annotation
   */
  const removeAnnotation = useCallback(async (id: string) => {
    await deleteAnnotation(id);
    await loadAnnotations();
  }, [loadAnnotations]);

  /**
   * Quick highlight with a specific color (no tool selection needed)
   */
  const quickHighlight = useCallback(async (color: HighlightColor) => {
    if (!selection) return;
    await createTextAnnotation('highlight', color);
  }, [selection, createTextAnnotation]);

  return {
    loadAnnotations,
    createTextAnnotation,
    createSymbolAnnotation,
    applyCurrentTool,
    removeAnnotation,
    quickHighlight,
  };
}
