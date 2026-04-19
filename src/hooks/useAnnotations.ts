/**
 * Annotations Hook
 * 
 * Handles creating, loading, and managing annotations for the current chapter.
 */

import { useCallback } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useStudyStore } from '@/stores/studyStore';
import { saveAnnotation, deleteAnnotation, findSisterAnnotations, getAnnotationById, getChapterAnnotations, getChapterHeadings, saveSectionHeading, deleteSectionHeading, getChapterTitle, saveChapterTitle, deleteChapterTitle, getChapterNotes, saveNote, deleteNote, getMarkingPreset } from '@/lib/database';
import type { Annotation, TextAnnotation, SymbolAnnotation, HighlightColor, SymbolKey, SectionHeading, ChapterTitle, Note, MarkingPreset, Verse } from '@/types';
import { autoAddToObservationTracker } from '@/lib/observationAutoAdd';
import { getAnnotationVerseRef } from '@/lib/annotationQueries';
import { fetchChapter } from '@/lib/bible-api';
import { findAlignedMatch } from '@/lib/translationAlignment';

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

  /**
   * Propagate an annotation created in one translation to every other
   * installed translation.
   *
   * For each target translation (ids excluding the source module), locate
   * the equivalent word via Strong's (if both sides have tagging) or a
   * case-insensitive word-boundary text search, and persist a new
   * annotation there with that translation's moduleId.
   *
   * Target chapter data is taken from `loadedVerses` if present; any
   * target translation not already loaded is fetched via `fetchChapter`
   * (uses the existing cache for non-SWORD modules). Fetch failures are
   * recorded as misses, not thrown, so one offline translation can't
   * break propagation to the others.
   *
   * Returns the list of annotation IDs created (including paired text +
   * symbol annotations) so the caller can offer an undo.
   */
  const createAnnotationsAcrossTranslations = useCallback(async (
    preset: MarkingPreset,
    source: {
      moduleId: string;
      book: string;
      chapter: number;
      verse: number;
      selectedText: string;
      strongsNumbers?: string[];
    },
    targetTranslationIds: string[],
    loadedVerses: Map<string, Verse>,
  ): Promise<{ createdIds: string[]; successes: string[]; misses: string[] }> => {
    const createdIds: string[] = [];
    const successes: string[] = [];
    const misses: string[] = [];

    const { moduleId: sourceModuleId, book: sourceBook, chapter: sourceChapter, verse: sourceVerseNum, selectedText: sourceSelectedText, strongsNumbers: sourceStrongsNumbers } = source;

    // Resolve a target verse, fetching the chapter if it isn't already
    // loaded. Returns null on any error.
    async function resolveTargetVerse(targetId: string): Promise<Verse | null> {
      const preloaded = loadedVerses.get(targetId);
      if (preloaded) return preloaded;
      try {
        const chapter = await fetchChapter(targetId, sourceBook, sourceChapter);
        return chapter.verses.find(v => v.ref.verse === sourceVerseNum) || null;
      } catch (err) {
        console.warn(`[propagate] failed to fetch ${targetId} ${sourceBook} ${sourceChapter}:`, err);
        return null;
      }
    }

    // Resolve all target verses in parallel so slow translations (e.g.
    // ESV network) don't serialize the local SWORD lookups.
    const resolvedTargets = await Promise.all(
      targetTranslationIds
        .filter(id => id !== sourceModuleId)
        .map(async id => ({ id, verse: await resolveTargetVerse(id) })),
    );

    for (const { id: targetId, verse: targetVerse } of resolvedTargets) {
      if (!targetVerse) {
        misses.push(targetId);
        continue;
      }

      const match = findAlignedMatch({
        targetVerse,
        sourceSelectedText,
        sourceStrongsNumbers,
      });
      if (!match.found) {
        misses.push(targetId);
        continue;
      }

      const now = new Date();
      const verseRef = {
        book: sourceBook,
        chapter: sourceChapter,
        verse: targetVerse.ref.verse,
      };

      if (preset.symbol) {
        const symAnnotation: SymbolAnnotation = {
          id: crypto.randomUUID(),
          moduleId: targetId,
          type: 'symbol',
          ref: verseRef,
          wordIndex: match.startWordIndex,
          position: 'before',
          selectedText: match.matchedText,
          startWordIndex: match.startWordIndex,
          endWordIndex: match.endWordIndex,
          startOffset: match.startOffset,
          endOffset: match.endOffset,
          symbol: preset.symbol,
          color: preset.highlight?.color,
          createdAt: now,
          updatedAt: now,
          presetId: preset.id,
        };
        await saveAnnotation(symAnnotation);
        createdIds.push(symAnnotation.id);
      }

      if (preset.highlight) {
        const textAnnotation: TextAnnotation = {
          id: crypto.randomUUID(),
          moduleId: targetId,
          type: preset.highlight.style,
          startRef: verseRef,
          endRef: verseRef,
          startWordIndex: match.startWordIndex,
          endWordIndex: match.endWordIndex,
          selectedText: match.matchedText,
          startOffset: match.startOffset,
          endOffset: match.endOffset,
          color: preset.highlight.color,
          createdAt: now,
          updatedAt: now,
          presetId: preset.id,
        };
        await saveAnnotation(textAnnotation);
        createdIds.push(textAnnotation.id);
      }

      // Only count as success if we actually created an annotation (preset
      // with neither symbol nor highlight would otherwise count as a
      // silent success).
      if (preset.symbol || preset.highlight) {
        successes.push(targetId);
      } else {
        misses.push(targetId);
      }
    }

    if (createdIds.length > 0) {
      await loadAnnotations();
      window.dispatchEvent(new CustomEvent('annotationsUpdated'));
    }

    return { createdIds, successes, misses };
  }, [loadAnnotations]);

  // applyCurrentTool removed - all annotations must use keywords/presets (no manual annotations)

  /**
   * Remove an annotation, cascading to sister annotations (same presetId,
   * same verse, same selectedText) in other translations so a single delete
   * cleans up a propagated mark everywhere it landed.
   */
  const removeAnnotation = useCallback(async (id: string) => {
    const ann = await getAnnotationById(id);
    const sisterIds = ann ? await findSisterAnnotations(ann) : [];
    await deleteAnnotation(id);
    await Promise.all(sisterIds.map(sid => deleteAnnotation(sid)));
    await loadAnnotations();

    // Dispatch event to notify other components (like MultiTranslationView) to reload
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
  }, [loadAnnotations]);

  const removeAnnotations = useCallback(async (ids: string[]) => {
    const sisterIdSet = new Set<string>();
    for (const id of ids) {
      const ann = await getAnnotationById(id);
      if (!ann) continue;
      for (const sid of await findSisterAnnotations(ann)) sisterIdSet.add(sid);
    }
    const allIds = [...new Set([...ids, ...sisterIdSet])];
    await Promise.all(allIds.map(id => deleteAnnotation(id)));
    await loadAnnotations();
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
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
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
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
  }, [loadSectionHeadings]);

  /**
   * Delete a section heading
   */
  const removeSectionHeading = useCallback(async (id: string) => {
    await deleteSectionHeading(id);
    await loadSectionHeadings();
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
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
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
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
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
  }, [loadChapterTitle]);

  /**
   * Delete a chapter title
   */
  const removeChapterTitle = useCallback(async (id: string) => {
    await deleteChapterTitle(id);
    await loadChapterTitle();
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
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
    if (!content.trim()) return null;

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
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
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
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
  }, [loadNotes]);

  /**
   * Remove a note
   */
  const removeNote = useCallback(async (id: string): Promise<void> => {
    await deleteNote(id);
    await loadNotes();
    window.dispatchEvent(new CustomEvent('annotationsUpdated'));
  }, [loadNotes]);

  return {
    loadAnnotations,
    loadSectionHeadings,
    loadChapterTitle,
    loadNotes,
    createTextAnnotation,
    createSymbolAnnotation,
    createAnnotationsAcrossTranslations,
    removeAnnotation,
    removeAnnotations,
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
