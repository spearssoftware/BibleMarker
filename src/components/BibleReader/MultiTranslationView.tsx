/**
 * Multi-Translation View Component
 * 
 * Displays up to 3 translations side-by-side with synchronized scrolling.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import React from 'react';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useAnnotations } from '@/hooks/useAnnotations';
import { getAllTranslations, type ApiTranslation, fetchChapter } from '@/lib/bible-api';
import { getChapterAnnotations, getChapterHeadings, getChapterTitle, getChapterNotes, saveSectionHeading, deleteSectionHeading, saveChapterTitle, deleteChapterTitle, saveNote, deleteNote } from '@/lib/database';
import { filterAnnotationsByStudy } from '@/lib/studyFilter';
import { VerseText } from './VerseText';
import { SectionHeadingEditor } from './SectionHeadingEditor';
import { SectionHeadingCreator } from './SectionHeadingCreator';
import { ChapterTitleEditor } from './ChapterTitleEditor';
import { ChapterTitleCreator } from './ChapterTitleCreator';
import { NoteEditor } from './NoteEditor';
import { NoteCreator } from './NoteCreator';
import { VerseNumberMenu } from './VerseNumberMenu';
import { usePlaceStore } from '@/stores/placeStore';
import { useTimeStore } from '@/stores/timeStore';
import { usePeopleStore } from '@/stores/peopleStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { getBookById } from '@/types/bible';
import type { Chapter } from '@/types/bible';
import type { Annotation, SectionHeading, Note, ChapterTitle } from '@/types/annotation';

interface TranslationChapter {
  translation: ApiTranslation;
  chapter: Chapter | null;
  isLoading: boolean;
  error: string | null;
}

export function MultiTranslationView() {
  const { activeView, loadActiveView, addTranslation } = useMultiTranslationStore();
  const { currentBook, currentChapter, currentModuleId, navSelectedVerse } = useBibleStore();
  const { setSelection, setIsSelecting, fontSize, selection } = useAnnotationStore();
  const [translations, setTranslations] = useState<ApiTranslation[]>([]);
  const [translationChapters, setTranslationChapters] = useState<Map<string, TranslationChapter>>(new Map());
  const [annotationsByTranslation, setAnnotationsByTranslation] = useState<Map<string, Annotation[]>>(new Map());
  
  // Get the primary translation ID (first valid one) for section headings, chapter titles, and notes
  // Fall back to currentModuleId if no active view or if active view has no translations
  // Memoize to prevent unnecessary re-renders - use stringified array to compare by value, not reference
  const translationIdsJoin = activeView?.translationIds?.join(',');
  const primaryTranslationId = useMemo(() => {
    const translationIds = activeView?.translationIds;
    if (!translationIds || translationIds.length === 0) {
      return currentModuleId || null;
    }
    return translationIds[0] || currentModuleId || null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- translationIdsJoin captures activeView?.translationIds
  }, [translationIdsJoin, currentModuleId]);
  
  const { removeAnnotation } = useAnnotations();
  const { presets } = useMarkingPresetStore();
  const { activeStudyId } = useStudyStore();

  // Build preset map for annotation filtering
  const presetMap = useMemo(
    () => new Map(presets.map((p) => [p.id, p])),
    [presets]
  );

  // Filter annotations by active study (passed to VerseText)
  const filteredAnnotationsByTranslation = useMemo(() => {
    const result = new Map<string, Annotation[]>();
    annotationsByTranslation.forEach((anns, translationId) => {
      result.set(
        translationId,
        filterAnnotationsByStudy(anns, presetMap, activeStudyId)
      );
    });
    return result;
  }, [annotationsByTranslation, presetMap, activeStudyId]);
  const { autoPopulateFromChapter: autoPopulatePlacesFromChapter } = usePlaceStore();
  const { autoPopulateFromChapter: autoPopulateTimeFromChapter } = useTimeStore();
  const { autoPopulateFromChapter: autoPopulatePeopleFromChapter } = usePeopleStore();
  
  const [sectionHeadings, setSectionHeadings] = useState<SectionHeading[]>([]);
  const [chapterTitle, setChapterTitle] = useState<ChapterTitle | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [creatingHeadingAt, setCreatingHeadingAt] = useState<number | null>(null);
  const [creatingChapterTitle, setCreatingChapterTitle] = useState(false);
  const [creatingNoteAt, setCreatingNoteAt] = useState<number | null>(null);
  const [verseMenuAt, setVerseMenuAt] = useState<{ verseNum: number; translationId: string } | null>(null);
  // Bumped when API configs change (e.g. after sync) to retry failed chapters
  const [configGeneration, setConfigGeneration] = useState(0);
  
  const verseContainerRef = useRef<HTMLDivElement>(null);

  // Force WebKit to recalculate layout on resize (works around emoji line-box bug)
  useEffect(() => {
    const el = verseContainerRef.current;
    if (!el) return;
    let rafId: number;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        el.style.display = 'none';
        void el.offsetHeight;
        el.style.display = '';
      });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Track the last book/chapter we loaded to prevent duplicate calls
  const lastLoadedRef = useRef<{ book: string; chapter: number } | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const pendingLoadRef = useRef<string | null>(null);
  // Track which chapters have been auto-populated to avoid doing it multiple times
  const autoPopulatedRef = useRef<Set<string>>(new Set());

  // Load section headings, chapter title, and notes for primary translation
  const loadSectionHeadings = useCallback(async () => {
    const headings = await getChapterHeadings(null, currentBook, currentChapter, activeStudyId);
    setSectionHeadings(headings);
  }, [currentBook, currentChapter, activeStudyId]);
  
  const loadChapterTitle = useCallback(async () => {
    // Prevent duplicate calls for the same book/chapter
    const key = `${currentBook}-${currentChapter}`;
    
    // Skip if there's already a pending load for this exact book/chapter
    if (pendingLoadRef.current === key) {
      return;
    }
    
    // Mark as pending immediately (synchronously) to prevent duplicate calls
    pendingLoadRef.current = key;
    isLoadingRef.current = true;
    lastLoadedRef.current = { book: currentBook, chapter: currentChapter };
    
    try {
      const title = await getChapterTitle(null, currentBook, currentChapter, activeStudyId);
      setChapterTitle(title || null);
    } finally {
      isLoadingRef.current = false;
      // Clear pending ref after a brief delay to allow the state update to propagate
      setTimeout(() => {
        if (pendingLoadRef.current === key) {
          pendingLoadRef.current = null;
        }
      }, 50);
    }
  }, [currentBook, currentChapter, activeStudyId]);
  
  const loadNotes = useCallback(async () => {
    if (!primaryTranslationId) return;
    const notesData = await getChapterNotes(primaryTranslationId, currentBook, currentChapter);
    setNotes(notesData);
  }, [primaryTranslationId, currentBook, currentChapter]);

  const loadAnnotations = useCallback(async () => {
    if (!activeView) return;
    const newAnnotations = new Map<string, Annotation[]>();
    for (const translationId of activeView.translationIds) {
      try {
        const annotations = await getChapterAnnotations(translationId, currentBook, currentChapter);
        newAnnotations.set(translationId, annotations);
      } catch (error) {
        console.error(`Failed to load annotations for ${translationId}:`, error);
        newAnnotations.set(translationId, []);
      }
    }
    setAnnotationsByTranslation(newAnnotations);
  }, [activeView, currentBook, currentChapter]);

  // Create/update/delete functions (translation-agnostic)
  const createSectionHeading = useCallback(async (verseNum: number, title: string) => {
    if (!title.trim()) return null;
    
    const heading: SectionHeading = {
      id: globalThis.crypto.randomUUID(),
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
  
  const updateSectionHeading = useCallback(async (heading: SectionHeading) => {
    const updated = {
      ...heading,
      updatedAt: new Date(),
    };
    await saveSectionHeading(updated);
    await loadSectionHeadings();
  }, [loadSectionHeadings]);
  
  const removeSectionHeading = useCallback(async (id: string) => {
    await deleteSectionHeading(id);
    await loadSectionHeadings();
  }, [loadSectionHeadings]);
  
  const createChapterTitle = useCallback(async (title: string) => {
    if (!title.trim()) return null;
    
    const chapterTitleData = {
      id: globalThis.crypto.randomUUID(),
      book: currentBook,
      chapter: currentChapter,
      title: title.trim(),
      studyId: activeStudyId ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await saveChapterTitle(chapterTitleData);
    await loadChapterTitle();
    return chapterTitleData;
  }, [currentBook, currentChapter, activeStudyId, loadChapterTitle]);
  
  const updateChapterTitle = useCallback(async (title: ChapterTitle) => {
    // Ensure we use the current book and chapter, not the title's (which might be stale)
    const updated = {
      ...title,
      book: currentBook,
      chapter: currentChapter,
      updatedAt: new Date(),
    };
    await saveChapterTitle(updated);
    await loadChapterTitle();
  }, [currentBook, currentChapter, loadChapterTitle]);
  
  const removeChapterTitle = useCallback(async (id: string) => {
    await deleteChapterTitle(id);
    await loadChapterTitle();
  }, [loadChapterTitle]);
  
  const createNote = useCallback(async (verseNum: number, content: string, range?: { startVerse: number; endVerse: number }) => {
    if (!primaryTranslationId || !content.trim()) return null;
    
    const note: Note = {
      id: globalThis.crypto.randomUUID(),
      moduleId: primaryTranslationId,
      ref: {
        book: currentBook,
        chapter: currentChapter,
        verse: verseNum,
      },
      range: range ? {
        start: { book: currentBook, chapter: currentChapter, verse: range.startVerse },
        end: { book: currentBook, chapter: currentChapter, verse: range.endVerse },
      } : undefined,
      content: content.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await saveNote(note);
    await loadNotes();
    return note;
  }, [primaryTranslationId, currentBook, currentChapter, loadNotes]);
  
  const updateNote = useCallback(async (note: Note) => {
    const updated = {
      ...note,
      updatedAt: new Date(),
    };
    await saveNote(updated);
    await loadNotes();
  }, [loadNotes]);
  
  const removeNote = useCallback(async (id: string) => {
    await deleteNote(id);
    await loadNotes();
  }, [loadNotes]);
  
  // Helper functions
  function getHeadingBefore(verseNum: number): SectionHeading | undefined {
    return sectionHeadings.find(h => h.beforeRef.verse === verseNum);
  }
  
  function getVerseNotes(verseNum: number): Note[] {
    return notes.filter(note => {
      if (note.range) {
        return verseNum >= note.range.start.verse && verseNum <= note.range.end.verse;
      }
      return note.ref.verse === verseNum;
    });
  }

  useEffect(() => {
    loadActiveView();
    loadTranslations();
  }, [loadActiveView]);
  
  // If no active view or no translations, default to currentModuleId
  useEffect(() => {
    if (currentModuleId && (!activeView || activeView.translationIds.length === 0)) {
      // Auto-add currentModuleId as the default translation
      addTranslation(currentModuleId);
    }
  }, [activeView, currentModuleId, addTranslation]);

  useEffect(() => {
    // Reset loading refs when book/chapter changes
    const key = `${currentBook}-${currentChapter}`;
    const lastKey = lastLoadedRef.current ? `${lastLoadedRef.current.book}-${lastLoadedRef.current.chapter}` : null;
    if (key !== lastKey) {
      isLoadingRef.current = false;
      lastLoadedRef.current = null;
      pendingLoadRef.current = null;
    }
    
    if (activeView && activeView.translationIds.length > 0 && translations.length > 0) {
      loadChapters();
      loadAnnotations();
      
      // Load section headings, chapter title, and notes for primary translation
      if (primaryTranslationId) {
        loadSectionHeadings();
        loadChapterTitle();
        loadNotes();
      }
    }
    // Only depend on actual values, not the callback functions
    // The callbacks are stable and will be recreated when their dependencies change anyway
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView?.id, activeView?.translationIds?.join(','), currentBook, currentChapter, translations.length, primaryTranslationId, activeStudyId, configGeneration]);

  // Reload annotations when they are updated (e.g., when a new annotation is created)
  useEffect(() => {
    if (!activeView || activeView.translationIds.length === 0) return;
    
    const handleAnnotationsUpdated = () => {
      loadAnnotations();
      loadSectionHeadings();
      loadChapterTitle();
      loadNotes();
    };
    
    // Listen for annotation updates
    window.addEventListener('annotationsUpdated', handleAnnotationsUpdated);
    
    return () => {
      window.removeEventListener('annotationsUpdated', handleAnnotationsUpdated);
    };
  }, [activeView, currentBook, currentChapter, activeStudyId, loadAnnotations, loadSectionHeadings, loadChapterTitle, loadNotes]);

  // When API configs change (e.g. keys synced from iCloud), retry any failed chapters
  useEffect(() => {
    const handleTranslationsUpdated = () => {
      const hasErrors = Array.from(translationChapters.values()).some(tc => tc.error);
      if (hasErrors) {
        setConfigGeneration(g => g + 1);
      }
    };
    window.addEventListener('translationsUpdated', handleTranslationsUpdated);
    return () => window.removeEventListener('translationsUpdated', handleTranslationsUpdated);
  }, [translationChapters]);

  // Helper function to expand selection to word boundaries
  const expandToWordBoundaries = (range: Range): { expandedRange: Range; text: string } => {
    const expandedRange = range.cloneRange();
    
    // Get the common ancestor container
    const commonAncestor = expandedRange.commonAncestorContainer;
    
    // If the common ancestor is a text node, work with it directly
    if (commonAncestor.nodeType === Node.TEXT_NODE) {
      const textContent = commonAncestor.textContent || '';
      let startOffset = expandedRange.startOffset;
      let endOffset = expandedRange.endOffset;
      
      // Expand backward to word boundary
      while (startOffset > 0 && /\w/.test(textContent[startOffset - 1])) {
        startOffset--;
      }
      
      // Expand forward to word boundary
      while (endOffset < textContent.length && /\w/.test(textContent[endOffset])) {
        endOffset++;
      }
      
      expandedRange.setStart(commonAncestor, startOffset);
      expandedRange.setEnd(commonAncestor, endOffset);
    } else {
      // For multi-node selections, try to expand using Range methods
      // First, try to expand to word boundaries
      try {
        // Get the text content of the range
        const selectedText = expandedRange.toString();
        
        // Find the first word character in the selection
        const firstWordMatch = selectedText.match(/\w/);
        const lastWordMatch = selectedText.match(/\w(?=[\s\p{P}]*$)/u);
        
        if (firstWordMatch && lastWordMatch) {
          // Try to adjust the range to start/end at word boundaries
          // This is approximate - we'll refine the text after
          const startContainer = expandedRange.startContainer;
          const endContainer = expandedRange.endContainer;
          
          if (startContainer.nodeType === Node.TEXT_NODE && endContainer.nodeType === Node.TEXT_NODE) {
            let startOffset = expandedRange.startOffset;
            let endOffset = expandedRange.endOffset;
            
            // Expand backward from start
            const startText = startContainer.textContent || '';
            while (startOffset > 0 && /\w/.test(startText[startOffset - 1])) {
              startOffset--;
            }
            
            // Expand forward from end
            const endText = endContainer.textContent || '';
            while (endOffset < endText.length && /\w/.test(endText[endOffset])) {
              endOffset++;
            }
            
            expandedRange.setStart(startContainer, startOffset);
            expandedRange.setEnd(endContainer, endOffset);
          }
        }
      } catch (e) {
        // If expansion fails, use original range
        console.warn('Could not expand selection to word boundaries:', e);
      }
    }
    
    // Get the expanded text - extract only text content, excluding symbols and HTML
    // Clone the range and extract text from text nodes only
    let expandedText = '';
    
    if (!expandedRange.collapsed) {
      // Create a temporary container to extract text content
      const clone = expandedRange.cloneContents();
      // Get textContent which strips HTML but keeps text (excludes symbols in spans)
      expandedText = clone.textContent || '';
      
      // If textContent is empty or includes symbols, try a different approach
      // Extract text by walking text nodes
      if (!expandedText || expandedText.trim().length === 0) {
        const textParts: string[] = [];
        const walker = document.createTreeWalker(
          clone,
          NodeFilter.SHOW_TEXT,
          null
        );
        
        for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
          if (textNode.textContent) {
            textParts.push(textNode.textContent);
          }
        }
        expandedText = textParts.join('');
      }
    }
    
    // Clean up: remove extra whitespace and trim
    expandedText = expandedText.replace(/\s+/g, ' ').trim();
    
    // Trim leading/trailing punctuation, whitespace, but keep internal punctuation
    // Remove common punctuation and whitespace from edges
    expandedText = expandedText.replace(/^[\s.,;:!?'"()[\]+{}—–-]+|[\s.,;:!?'"()[\]+{}—–-]+$/g, '');
    
    return { expandedRange, text: expandedText };
  };

  // Handle text selection - detect which translation and capture selection
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      return;
    }

    const originalRange = sel.getRangeAt(0);
    
    // Expand to word boundaries and get clean text
    const { expandedRange, text } = expandToWordBoundaries(originalRange);
    
    if (!text || text.length === 0) return;
    
    // Update the browser selection to match expanded range
    sel.removeAllRanges();
    sel.addRange(expandedRange);

    // Find which translation column the selection is in by finding the verse element
    const startContainer = expandedRange.startContainer.parentElement;
    const verseElement = startContainer?.closest('[data-verse]');
    if (!verseElement) return;

    // Find the verse row (grid container)
    const verseRow = verseElement.closest('.grid[data-verse]') || verseElement.closest('.grid');
    if (!verseRow || !activeView) return;

    // Find which cell in the grid contains the selection
    const verseCell = verseElement.closest('.verse-cell');
    if (!verseCell) return;

    const cells = Array.from(verseRow.children);
    const cellIndex = cells.indexOf(verseCell);
    
    if (cellIndex === -1 || cellIndex >= activeView.translationIds.length) return;
    
    // Get the translation ID for this column
    const translationId = activeView.translationIds[cellIndex];
    if (!translationId) return;

    // Find verse number from the verse element
    const verseNum = parseInt(verseElement.getAttribute('data-verse') || '0', 10);
    if (!verseNum) return;

    // Try to get verse content element for offset calculation
    const verseContent = verseElement.querySelector('.verse-content');
    const originalText = verseContent?.getAttribute('data-original-text') || '';
    
    // Calculate character offsets within the verse
    let startOffset: number | undefined;
    let endOffset: number | undefined;
    
    if (verseContent && originalText && text.trim()) {
      try {
        const selectedText = text.trim();
        const domTextContent = verseContent.textContent || '';
        
        // Strategy: Use DOM selection position directly, then map to original text
        // This is more accurate than trying to match normalized text positions
        
        // Calculate DOM offsets (textContent strips HTML but preserves text structure)
        const startRange = document.createRange();
        startRange.selectNodeContents(verseContent);
        startRange.setEnd(expandedRange.startContainer, expandedRange.startOffset);
        const domTextBefore = startRange.toString();
        const domStartOffset = domTextBefore.length;
        
        const endRange = document.createRange();
        endRange.selectNodeContents(verseContent);
        endRange.setEnd(expandedRange.endContainer, expandedRange.endOffset);
        const domTextUpToEnd = endRange.toString();
        const domEndOffset = domTextUpToEnd.length;
        
        // If DOM text matches original text exactly, use DOM offsets directly
        if (domTextContent === originalText) {
          startOffset = domStartOffset;
          endOffset = domEndOffset;
        } else {
          // DOM text differs (might have different whitespace or entity encoding)
          // Find the selected text starting from the DOM position
          const lowerOriginal = originalText.toLowerCase();
          const lowerSelected = selectedText.toLowerCase();
          
          // Find all whole-word occurrences first (prevents matching "he" inside "the"/"When")
          const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const occurrences: number[] = [];
          const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(lowerSelected)}\\b`, 'g');
          let regexMatch;
          while ((regexMatch = wordBoundaryRegex.exec(lowerOriginal)) !== null) {
            occurrences.push(regexMatch.index);
          }
          
          // Fall back to substring search if no word-boundary matches
          if (occurrences.length === 0) {
            let searchIdx = 0;
            while ((searchIdx = lowerOriginal.indexOf(lowerSelected, searchIdx)) !== -1) {
              occurrences.push(searchIdx);
              searchIdx++;
            }
          }
          
          if (occurrences.length === 0) {
            console.warn('[MultiTranslationView] Selected text not found:', selectedText.substring(0, 50));
            return;
          }
          
          // If only one occurrence, use it
          if (occurrences.length === 1) {
            startOffset = occurrences[0];
            endOffset = occurrences[0] + selectedText.length;
          } else {
            // Multiple occurrences - use DOM position to pick the right one
            // Map DOM offset to approximate original text position
            // Since DOM textContent might differ, we'll search near the estimated position
            
            // Estimate position in original text based on DOM offset
            // Use a ratio if lengths differ significantly
            let estimatedPos = domStartOffset;
            if (domTextContent.length > 0 && originalText.length > 0 && domTextContent.length !== originalText.length) {
              const ratio = originalText.length / domTextContent.length;
              estimatedPos = Math.floor(domStartOffset * ratio);
            }
            
            // Search window: look within a reasonable range around estimated position
            const searchWindow = Math.max(selectedText.length * 3, 50);
            const searchStart = Math.max(0, estimatedPos - searchWindow);
            const searchEnd = Math.min(originalText.length, estimatedPos + searchWindow);
            
            // Find occurrences within the search window
            const nearbyOccurrences = occurrences.filter(occ => occ >= searchStart && occ <= searchEnd);
            
            if (nearbyOccurrences.length > 0) {
              // Use the occurrence closest to estimated position
              let bestOccurrence = nearbyOccurrences[0];
              let minDist = Math.abs(nearbyOccurrences[0] - estimatedPos);
              
              for (const occ of nearbyOccurrences.slice(1)) {
                const dist = Math.abs(occ - estimatedPos);
                if (dist < minDist) {
                  minDist = dist;
                  bestOccurrence = occ;
                }
              }
              
              startOffset = bestOccurrence;
              endOffset = bestOccurrence + selectedText.length;
            } else {
              // No occurrences in window - use closest overall
              let bestOccurrence = occurrences[0];
              let minDist = Math.abs(occurrences[0] - estimatedPos);
              
              for (const occ of occurrences.slice(1)) {
                const dist = Math.abs(occ - estimatedPos);
                if (dist < minDist) {
                  minDist = dist;
                  bestOccurrence = occ;
                }
              }
              
              startOffset = bestOccurrence;
              endOffset = bestOccurrence + selectedText.length;
            }
          }
        }
        
        // Validate offsets
        if (startOffset !== undefined && endOffset !== undefined) {
          startOffset = Math.max(0, Math.min(startOffset, originalText.length));
          endOffset = Math.max(startOffset, Math.min(endOffset, originalText.length));
          
          // Verify the selected text matches
          const actualSelected = originalText.substring(startOffset, endOffset).trim();
          const normalizeForMatch = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
          if (normalizeForMatch(actualSelected) !== normalizeForMatch(selectedText)) {
            console.warn('[MultiTranslationView] Offset mismatch:', {
              selectedText,
              actualSelected,
              startOffset,
              endOffset,
              originalText: originalText.substring(Math.max(0, startOffset - 30), Math.min(originalText.length, endOffset + 30)),
              domStartOffset,
              domTextContent: domTextContent.substring(Math.max(0, domStartOffset - 30), Math.min(domTextContent.length, domStartOffset + selectedText.length + 30))
            });
          }
        } else {
          console.warn('[MultiTranslationView] Failed to calculate offsets for:', selectedText);
          return;
        }
        
      } catch (e) {
        console.warn('[MultiTranslationView] Error calculating offsets:', e);
        return;
      }
    }

    // Capture menu position from selection rect (viewport coords) so the menu appears next to the selection
    const selRect = expandedRange.getBoundingClientRect();
    const menuAnchor = {
      x: selRect.left + selRect.width / 2,
      y: selRect.top,
    };

    // Set selection with translation ID as moduleId
    setSelection({
      moduleId: translationId,
      book: currentBook,
      chapter: currentChapter,
      startVerse: verseNum,
      endVerse: verseNum,
      text,
      startOffset,
      endOffset,
      startVerseText: originalText || undefined,
      endVerseText: originalText || undefined,
      menuAnchor,
    });
    setIsSelecting(true);
  }, [activeView, currentBook, currentChapter, setSelection, setIsSelecting]);

  const loadTranslations = async () => {
    const all = await getAllTranslations();
    setTranslations(all);
  };

  const loadChapters = async () => {
    if (!activeView || translations.length === 0) return;

    const newChapters = new Map<string, TranslationChapter>();

    // Initialize all translations with loading state
    for (const translationId of activeView.translationIds) {
      const translation = translations.find(t => t.id === translationId);
      if (!translation) continue;

      // Check if we already have this chapter loaded for this book/chapter
      // Re-fetch if there was an error (e.g., fallback was used, API keys weren't ready)
      const existing = translationChapters.get(translationId);
      if (existing?.chapter && !existing.error &&
          existing.chapter.book === currentBook && 
          existing.chapter.chapter === currentChapter) {
        newChapters.set(translationId, existing);
        continue;
      }

      // Set loading state
      newChapters.set(translationId, {
        translation,
        chapter: null,
        isLoading: true,
        error: null,
      });
    }

    setTranslationChapters(new Map(newChapters));

    // Load chapters sequentially to avoid overwhelming browser resources
    // Add a small delay between requests to prevent net::insufficient_resources errors
    for (const translationId of activeView.translationIds) {
      const translation = translations.find(t => t.id === translationId);
      if (!translation) continue;

      // Skip if already loaded
      if (newChapters.get(translationId)?.chapter) continue;

      try {
        const chapter = await fetchChapter(translationId, currentBook, currentChapter);
        newChapters.set(translationId, {
          translation,
          chapter,
          isLoading: false,
          error: null,
        });
        setTranslationChapters(new Map(newChapters));
        
        // Auto-populate places and time expressions for keywords found in this chapter
        // Only do this once per chapter (use primary translation)
        if (translationId === primaryTranslationId) {
          const autoPopulateKey = `${currentBook}:${currentChapter}:${translationId}`;
          if (!autoPopulatedRef.current.has(autoPopulateKey)) {
            autoPopulatedRef.current.add(autoPopulateKey);
            // Run in background - don't block UI
            Promise.all([
              autoPopulatePlacesFromChapter(currentBook, currentChapter, translationId),
              autoPopulateTimeFromChapter(currentBook, currentChapter, translationId),
              autoPopulatePeopleFromChapter(currentBook, currentChapter, translationId),
            ]).catch(error => {
              console.error('[MultiTranslationView] Auto-populate failed:', error);
            });
          }
        }
      } catch (error) {
        // Try KJV as fallback (free, no API key required)
        const FALLBACK_TRANSLATION = 'kjv';
        if (translationId.toLowerCase() !== FALLBACK_TRANSLATION) {
          try {
            const fallbackChapter = await fetchChapter(FALLBACK_TRANSLATION, currentBook, currentChapter);
            console.warn(`[MultiTranslationView] Using KJV fallback for ${translationId}`);
            newChapters.set(translationId, {
              translation,
              chapter: fallbackChapter,
              isLoading: false,
              error: `Showing KJV — ${translation.name || translationId} failed to load`,
            });
            setTranslationChapters(new Map(newChapters));
          } catch {
            newChapters.set(translationId, {
              translation,
              chapter: null,
              isLoading: false,
              error: error instanceof Error ? error.message : 'Failed to load chapter',
            });
            setTranslationChapters(new Map(newChapters));
          }
        } else {
          newChapters.set(translationId, {
            translation,
            chapter: null,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to load chapter',
          });
          setTranslationChapters(new Map(newChapters));
        }
      }

      // Add a small delay between requests to prevent overwhelming browser resources
      // Only delay if there are more translations to load
      const remainingTranslations = activeView.translationIds.slice(
        activeView.translationIds.indexOf(translationId) + 1
      );
      if (remainingTranslations.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      }
    }
  };


  // Show loading state if we're initializing
  if (!activeView || activeView.translationIds.length === 0) {
    if (currentModuleId) {
      // We're initializing - show loading
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-scripture-border border-t-scripture-accent rounded-full animate-spin"></div>
            <div className="text-scripture-muted text-sm">Loading translations...</div>
          </div>
        </div>
      );
    }
    return null;
  }

  const translationList = Array.from(translationChapters.values());
  const bookInfo = getBookById(currentBook);

  // Close pickers when clicking on verse text (but allow text selection)
  const handleClick = (e: React.MouseEvent) => {
    // Don't close if there's an active text selection
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) {
      return;
    }
    
    // Only close if clicking directly on the content (not on buttons or interactive elements)
    const target = e.target as HTMLElement;
    if (target.tagName !== 'BUTTON' && !target.closest('button') && !target.closest('[role="button"]') && !target.closest('input') && !target.closest('.verse-content')) {
      // Small delay to allow selection to be captured first
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('closePickers'));
      }, 100);
    }
  };

  // Get all verse numbers from all loaded chapters to create aligned rows
  // Also check if any translation is loading to show skeleton
  const allVerseNumbers = new Set<number>();
  const isLoadingAny = translationList.some(({ isLoading }) => isLoading);
  
  translationList.forEach(({ chapter }) => {
    if (chapter) {
      chapter.verses.forEach(verse => allVerseNumbers.add(verse.ref.verse));
    }
  });
  
  // If any translation is loading, estimate verse count from book info
  // This allows us to show skeleton loaders even when no chapters are loaded yet
  if (isLoadingAny && allVerseNumbers.size === 0 && bookInfo) {
    // Estimate verses based on typical chapter lengths (most chapters have 20-50 verses)
    // We'll show skeleton for a reasonable number of verses
    const estimatedVerses = Math.max(30, bookInfo.chapters > 0 ? Math.ceil(50 / bookInfo.chapters) : 30);
    for (let i = 1; i <= estimatedVerses; i++) {
      allVerseNumbers.add(i);
    }
  }
  
  const sortedVerseNumbers = Array.from(allVerseNumbers).sort((a, b) => a - b);
  
  return (
    <div className="multi-translation-view h-full flex flex-col" onClick={handleClick} data-bible-reader>
      {/* Chapter title section */}
      {(chapterTitle || creatingChapterTitle) && (
        <div className="px-4 py-3 text-center flex-shrink-0 bg-transparent" data-chapter-title={currentChapter} style={{ scrollMarginTop: '80px' }}>
          {chapterTitle ? (
            <ChapterTitleEditor
              title={chapterTitle}
              onSave={updateChapterTitle}
              onDelete={removeChapterTitle}
            />
          ) : creatingChapterTitle ? (
            <ChapterTitleCreator
              onSave={async (title) => {
                await createChapterTitle(title);
                setCreatingChapterTitle(false);
              }}
              onCancel={() => setCreatingChapterTitle(false)}
            />
          ) : null}
        </div>
      )}
      
      {/* Add chapter title button - show in nav area if no title exists */}
      {!chapterTitle && !creatingChapterTitle && primaryTranslationId && (
        <div className="px-4 py-2 text-center flex-shrink-0">
          <button
            onClick={() => setCreatingChapterTitle(true)}
            className="text-xs text-scripture-muted hover:text-scripture-accent 
                     transition-all duration-200 inline-flex items-center gap-1.5
                     px-2 py-1 rounded hover:bg-scripture-surface/50"
          >
            <span className="text-sm leading-none">+</span>
            <span>Add chapter title</span>
          </button>
        </div>
      )}

      {/* Translation headers - sticky */}
      <div 
        className={`grid gap-4 px-4 py-2 bg-scripture-elevated flex-shrink-0 ${translationList.length === 1 ? 'grid-cols-1' : translationList.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
      >
        {translationList.map(({ translation, isLoading, error }) => (
          <div key={translation.id} className="flex flex-col">
            <div className="font-medium text-scripture-text flex items-center gap-2">
              {translation.name}
              {isLoading && (
                <div className="w-4 h-4 border-2 border-scripture-border border-t-scripture-accent rounded-full animate-spin"></div>
              )}
            </div>
            {error?.startsWith('Showing KJV') && (
              <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{error}</div>
            )}
          </div>
        ))}
      </div>

      {/* Verse rows - scrollable container */}
      <div ref={verseContainerRef} className="flex-1 overflow-y-auto custom-scrollbar min-h-0" onMouseUp={handleMouseUp} onTouchEnd={() => { setTimeout(handleMouseUp, 50); }}>
          <div className={`px-4 py-4 space-y-1.5 border-b border-scripture-border/50 `}>
            {sortedVerseNumbers.map(verseNum => (
              <div key={verseNum}>
                {/* Section heading if exists - show once per verse row, not per translation */}
                {getHeadingBefore(verseNum) && (
                  <div className="mb-2" data-section-heading={getHeadingBefore(verseNum)!.id} style={{ scrollMarginTop: '80px' }}>
                    <SectionHeadingEditor
                      heading={getHeadingBefore(verseNum)!}
                      verseNum={verseNum}
                      onSave={updateSectionHeading}
                      onDelete={removeSectionHeading}
                    />
                  </div>
                )}
                
                {/* Section heading creator */}
                {creatingHeadingAt === verseNum && (
                  <div className="mb-2">
                    <SectionHeadingCreator
                      verseNum={verseNum}
                      onSave={async (title) => {
                        await createSectionHeading(verseNum, title);
                        setCreatingHeadingAt(null);
                      }}
                      onCancel={() => setCreatingHeadingAt(null)}
                    />
                  </div>
                )}

                {/* Verse row */}
                <div
                  className={`grid gap-4 ${translationList.length === 1 ? 'grid-cols-1' : translationList.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} transition-colors duration-200 ${navSelectedVerse === verseNum ? 'bg-scripture-accent/10 dark:bg-scripture-accent/30 rounded-lg px-2 py-1' : ''}`}
                  data-verse={verseNum}
                >
                  {translationList.map(({ translation, chapter, isLoading, error }) => {
                    const verse = chapter?.verses.find(v => v.ref.verse === verseNum);
                    const isColumnLoading = isLoading && !chapter;
                    
                    return (
                      <div
                        key={`${translation.id}-${verseNum}`}
                        className="verse-cell min-h-[1.5rem]"
                      >
                        {isColumnLoading ? (
                          // Elegant skeleton loader - subtle placeholder that doesn't clutter
                          <div className="opacity-50 animate-pulse">
                            <div className="h-4 bg-scripture-elevated rounded w-full mb-1"></div>
                            <div className="h-4 bg-scripture-elevated rounded w-5/6"></div>
                          </div>
                        ) : error && !chapter ? (
                          // Show error only if we don't have any chapter data
                          <div className="text-highlight-red text-sm">
                            <div className="font-medium">Error</div>
                            <div className="text-xs">{error}</div>
                          </div>
                        ) : verse ? (
                          <div className={`scripture-text ${fontSize === 'sm' ? 'text-scripture-sm' : fontSize === 'lg' ? 'text-scripture-lg' : fontSize === 'xl' ? 'text-scripture-xl' : 'text-scripture-base'}`}>
                            <VerseText
                              verse={verse}
                              annotations={filteredAnnotationsByTranslation.get(translation.id) || []}
                              moduleId={translation.id}
                              onVerseNumberClick={
                                primaryTranslationId
                                  ? (verseNum) => {
                                      // Show menu with options: section heading or note
                                      // Only show menu if no heading exists already
                                      if (!getHeadingBefore(verseNum)) {
                                        setVerseMenuAt({ verseNum, translationId: translation.id });
                                      } else {
                                        // If heading exists, just allow adding note
                                        setCreatingNoteAt(verseNum);
                                      }
                                    }
                                  : undefined
                              }
                              verseMenu={
                                verseMenuAt?.verseNum === verseNum && verseMenuAt?.translationId === translation.id && !getHeadingBefore(verseNum) ? (
                                  <VerseNumberMenu
                                    verseNum={verseNum}
                                    onAddHeading={() => {
                                      setCreatingHeadingAt(verseNum);
                                      setVerseMenuAt(null);
                                    }}
                                    onAddNote={() => {
                                      setCreatingNoteAt(verseNum);
                                      setVerseMenuAt(null);
                                    }}
                                    onClose={() => setVerseMenuAt(null)}
                                  />
                                ) : undefined
                              }
                              onRemoveAnnotation={removeAnnotation}
                            />
                          </div>
                        ) : (
                          <div className="text-scripture-muted text-sm">—</div>
                        )}
                      </div>
                    );
                  })}
                </div>

              {/* Notes for this verse - show once per verse row, only for primary translation */}
              {primaryTranslationId && getVerseNotes(verseNum).length > 0 && (
                <div className="mt-2 mb-2">
                  {getVerseNotes(verseNum).map((note) => (
                    <NoteEditor
                      key={note.id}
                      note={note}
                      verseNum={verseNum}
                      book={currentBook}
                      chapter={currentChapter}
                      onSave={updateNote}
                      onDelete={removeNote}
                    />
                  ))}
                </div>
              )}

              {/* Note creator */}
              {creatingNoteAt === verseNum && primaryTranslationId && (
                <div className="mt-2 mb-2">
                  <NoteCreator
                    verseNum={verseNum}
                    range={
                      selection && 
                      selection.startVerse === verseNum && 
                      selection.endVerse !== verseNum
                        ? { startVerse: selection.startVerse, endVerse: selection.endVerse }
                        : undefined
                    }
                    onSave={async (content) => {
                      const range = selection && 
                        selection.startVerse === verseNum && 
                        selection.endVerse !== verseNum
                          ? { startVerse: selection.startVerse, endVerse: selection.endVerse }
                          : undefined;
                      await createNote(verseNum, content, range);
                      setCreatingNoteAt(null);
                    }}
                    onCancel={() => setCreatingNoteAt(null)}
                  />
                </div>
              )}
            </div>
          ))}
          
          {/* Copyright notices */}
          {translationList.some(({ translation }) => translation.copyright) && (
            <div className={`grid gap-4 px-4 py-3 border-t border-scripture-muted/20 bg-scripture-surface/50 flex-shrink-0 ${translationList.length === 1 ? 'grid-cols-1' : translationList.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {translationList.map(({ translation }) => (
                <div key={`copyright-${translation.id}`} className="flex flex-col">
                  {translation.copyright && (
                    <p className="text-[10px] text-scripture-muted leading-tight">
                      {translation.copyright}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
