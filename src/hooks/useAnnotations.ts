/**
 * Annotations Hook
 * 
 * Handles creating, loading, and managing annotations for the current chapter.
 */

import { useCallback } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useStudyStore } from '@/stores/studyStore';
import { saveAnnotation, deleteAnnotation, getChapterAnnotations, getChapterHeadings, saveSectionHeading, deleteSectionHeading, getChapterTitle, saveChapterTitle, deleteChapterTitle, getChapterNotes, saveNote, deleteNote, getMarkingPreset } from '@/lib/database';
import type { Annotation, TextAnnotation, SymbolAnnotation, HighlightColor, SymbolKey, SectionHeading, ChapterTitle, Note } from '@/types/annotation';
import { autoAddToObservationTracker } from '@/lib/observationAutoAdd';
import { getAnnotationVerseRef } from '@/lib/annotationQueries';

export function useAnnotations() {
  const { currentBook, currentChapter, currentModuleId } = useBibleStore();
  const { activeStudyId } = useStudyStore();
  const { 
    selection, 
    setAnnotations,
    setSectionHeadings,
    setChapterTitle,
    setNotes,
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
   * Load section headings for the current chapter
   */
  const loadSectionHeadings = useCallback(async () => {
    const headings = await getChapterHeadings(null, currentBook, currentChapter, activeStudyId);
    setSectionHeadings(headings);
  }, [currentBook, currentChapter, activeStudyId, setSectionHeadings]);

  /**
   * Load chapter title for the current chapter
   */
  const loadChapterTitle = useCallback(async () => {
    const title = await getChapterTitle(null, currentBook, currentChapter, activeStudyId);
    setChapterTitle(title || null);
  }, [currentBook, currentChapter, activeStudyId, setChapterTitle]);

  /**
   * Load notes for the current chapter
   */
  const loadNotes = useCallback(async () => {
    if (!currentModuleId) return;
    
    const notes = await getChapterNotes(
      currentModuleId,
      currentBook,
      currentChapter
    );
    setNotes(notes);
  }, [currentModuleId, currentBook, currentChapter, setNotes]);

  /**
   * Create a highlight, text color, or underline annotation
   * @param presetId - Optional; links to MarkingPreset for find-by-preset and "marked" in Key Word Finder
   */
  const createTextAnnotation = useCallback(async (
    type: 'highlight' | 'textColor' | 'underline',
    color: HighlightColor,
    presetId?: string
  ): Promise<Annotation | null> => {
    // Use moduleId from selection if available (multi-translation mode), otherwise fall back to currentModuleId
    const moduleId = selection?.moduleId || currentModuleId;
    
    if (!selection || !moduleId) {
      return null;
    }

    const annotation: TextAnnotation = {
      id: crypto.randomUUID(),
      moduleId: moduleId,
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
      ...(presetId != null && { presetId }),
    };

    await saveAnnotation(annotation);
    
    await addRecentColor(color);
    
    // Reload annotations
    await loadAnnotations();
    
    // Dispatch event to notify other components (like MultiTranslationView) to reload
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
    
    // Auto-add to observation trackers if preset has place/time symbols
    if (presetId) {
      try {
        const preset = await getMarkingPreset(presetId);
        if (preset) {
          const verseRef = getAnnotationVerseRef(annotation);
          await autoAddToObservationTracker(preset, annotation, verseRef);
        }
      } catch (error) {
        // Don't block annotation creation if auto-add fails
        console.error('[createTextAnnotation] Auto-add failed:', error);
      }
    }
    
    clearSelection();
    
    return annotation;
  }, [selection, currentModuleId, addRecentColor, loadAnnotations, clearSelection]);

  /**
   * Create a symbol annotation (inline before the word by default so the word can also have highlight/underline/color)
   * @param presetId - Optional; links to MarkingPreset for find-by-preset and "marked" in Key Word Finder
   * @param opts.clearSelection - If false, do not clear selection after (e.g. when also creating a text annotation)
   */
  const createSymbolAnnotation = useCallback(async (
    symbol: SymbolKey,
    position: 'before' | 'after' | 'center' = 'before',
    color?: HighlightColor,
    placement: 'above' | 'overlay' = 'above',
    presetId?: string,
    opts?: { clearSelection?: boolean }
  ): Promise<Annotation | null> => {
    // Use moduleId from selection if available (multi-translation mode), otherwise fall back to currentModuleId
    const moduleId = selection?.moduleId || currentModuleId;
    
    if (!selection || !moduleId) return null;

    const annotation: SymbolAnnotation = {
      id: crypto.randomUUID(),
      moduleId: moduleId,
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
      ...(presetId != null && { presetId }),
    };

    await saveAnnotation(annotation);
    await addRecentSymbol(symbol);

    await loadAnnotations();
    
    // Dispatch event to notify other components (like MultiTranslationView) to reload
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
    
    // Auto-add to observation trackers if preset has place/time symbols
    if (presetId) {
      try {
        const preset = await getMarkingPreset(presetId);
        if (preset) {
          const verseRef = getAnnotationVerseRef(annotation);
          await autoAddToObservationTracker(preset, annotation, verseRef);
        }
      } catch (error) {
        // Don't block annotation creation if auto-add fails
        console.error('[createSymbolAnnotation] Auto-add failed:', error);
      }
    }
    
    if (opts?.clearSelection !== false) clearSelection();

    return annotation;
  }, [selection, currentModuleId, addRecentSymbol, loadAnnotations, clearSelection]);

  // applyCurrentTool removed - all annotations must use keywords/presets (no manual annotations)

  /**
   * Remove an annotation
   */
  const removeAnnotation = useCallback(async (id: string) => {
    await deleteAnnotation(id);
    await loadAnnotations();
    
    // Dispatch event to notify other components (like MultiTranslationView) to reload
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
  }, [loadAnnotations]);

  /**
   * Create a section heading
   */
  const createSectionHeading = useCallback(async (
    verseNum: number,
    title: string
  ): Promise<SectionHeading | null> => {
    if (!title.trim()) return null;

    const heading: SectionHeading = {
      id: crypto.randomUUID(),
      beforeRef: {
        book: currentBook,
        chapter: currentChapter,
        verse: verseNum,
      },
      title: title.trim(),
      studyId: activeStudyId ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await saveSectionHeading(heading);
    await loadSectionHeadings();
    return heading;
  }, [currentBook, currentChapter, activeStudyId, loadSectionHeadings]);

  /**
   * Update a section heading
   */
  const updateSectionHeading = useCallback(async (heading: SectionHeading) => {
    const updated = {
      ...heading,
      updatedAt: new Date(),
    };
    await saveSectionHeading(updated);
    await loadSectionHeadings();
  }, [loadSectionHeadings]);

  /**
   * Delete a section heading
   */
  const removeSectionHeading = useCallback(async (id: string) => {
    await deleteSectionHeading(id);
    await loadSectionHeadings();
  }, [loadSectionHeadings]);

  /**
   * Create a chapter title
   */
  const createChapterTitle = useCallback(async (title: string): Promise<ChapterTitle | null> => {
    if (!title.trim()) return null;

    const chapterTitle: ChapterTitle = {
      id: crypto.randomUUID(),
      book: currentBook,
      chapter: currentChapter,
      title: title.trim(),
      studyId: activeStudyId ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await saveChapterTitle(chapterTitle);
    await loadChapterTitle();
    return chapterTitle;
  }, [currentBook, currentChapter, activeStudyId, loadChapterTitle]);

  /**
   * Update a chapter title
   */
  const updateChapterTitle = useCallback(async (title: ChapterTitle) => {
    const updated = {
      ...title,
      updatedAt: new Date(),
    };
    await saveChapterTitle(updated);
    await loadChapterTitle();
  }, [loadChapterTitle]);

  /**
   * Delete a chapter title
   */
  const removeChapterTitle = useCallback(async (id: string) => {
    await deleteChapterTitle(id);
    await loadChapterTitle();
  }, [loadChapterTitle]);

  /**
   * Quick highlight with a specific color (no tool selection needed)
   */
  const quickHighlight = useCallback(async (color: HighlightColor) => {
    if (!selection) return;
    await createTextAnnotation('highlight', color);
  }, [selection, createTextAnnotation]);

  /**
   * Create a note
   */
  const createNote = useCallback(async (
    verseNum: number,
    content: string,
    range?: { startVerse: number; endVerse: number }
  ): Promise<Note | null> => {
    if (!currentModuleId) return null;

    const note: Note = {
      id: crypto.randomUUID(),
      moduleId: currentModuleId,
      ref: {
        book: currentBook,
        chapter: currentChapter,
        verse: verseNum,
      },
      range: range ? {
        start: {
          book: currentBook,
          chapter: currentChapter,
          verse: range.startVerse,
        },
        end: {
          book: currentBook,
          chapter: currentChapter,
          verse: range.endVerse,
        },
      } : undefined,
      content,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await saveNote(note);
    await loadNotes();
    return note;
  }, [currentModuleId, currentBook, currentChapter, loadNotes]);

  /**
   * Update a note
   */
  const updateNote = useCallback(async (note: Note): Promise<void> => {
    const updated = {
      ...note,
      updatedAt: new Date(),
    };
    await saveNote(updated);
    await loadNotes();
  }, [loadNotes]);

  /**
   * Remove a note
   */
  const removeNote = useCallback(async (id: string): Promise<void> => {
    await deleteNote(id);
    await loadNotes();
  }, [loadNotes]);

  return {
    loadAnnotations,
    loadSectionHeadings,
    loadChapterTitle,
    loadNotes,
    createTextAnnotation,
    createSymbolAnnotation,
    removeAnnotation,
    quickHighlight,
    createSectionHeading,
    updateSectionHeading,
    removeSectionHeading,
    createChapterTitle,
    updateChapterTitle,
    removeChapterTitle,
    createNote,
    updateNote,
    removeNote,
  };
}
