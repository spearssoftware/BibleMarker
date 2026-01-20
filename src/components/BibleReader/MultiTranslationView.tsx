/**
 * Multi-Translation View Component
 * 
 * Displays up to 3 translations side-by-side with synchronized scrolling.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import React from 'react';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { useBibleStore } from '@/stores/bibleStore';
import type { VerseRef } from '@/types/bible';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useAnnotations } from '@/hooks/useAnnotations';
import { getAllTranslations, type ApiTranslation, fetchChapter } from '@/lib/bible-api';
import { getChapterAnnotations, getChapterHeadings, getChapterTitle, getChapterNotes, saveSectionHeading, deleteSectionHeading, saveChapterTitle, deleteChapterTitle, saveNote, deleteNote } from '@/lib/db';
import { VerseText } from './VerseText';
import { SectionHeadingEditor } from './SectionHeadingEditor';
import { SectionHeadingCreator } from './SectionHeadingCreator';
import { ChapterTitleEditor } from './ChapterTitleEditor';
import { ChapterTitleCreator } from './ChapterTitleCreator';
import { NoteEditor } from './NoteEditor';
import { NoteCreator } from './NoteCreator';
import { VerseNumberMenu } from './VerseNumberMenu';
import { getBookById } from '@/types/bible';
import type { Chapter } from '@/types/bible';
import type { Annotation, SectionHeading, Note } from '@/types/annotation';
import type { VerseRange } from '@/types/bible';

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
  const primaryTranslationId = activeView?.translationIds.find(
    id => id !== 'observation-lists'
  ) || null;
  
  const { removeAnnotation } = useAnnotations();
  
  const [sectionHeadings, setSectionHeadings] = useState<SectionHeading[]>([]);
  const [chapterTitle, setChapterTitle] = useState<{ id: string; moduleId: string; book: string; chapter: number; title: string; createdAt: Date; updatedAt: Date } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [creatingHeadingAt, setCreatingHeadingAt] = useState<number | null>(null);
  const [creatingChapterTitle, setCreatingChapterTitle] = useState(false);
  const [creatingNoteAt, setCreatingNoteAt] = useState<number | null>(null);
  const [verseMenuAt, setVerseMenuAt] = useState<{ verseNum: number; translationId: string } | null>(null);
  
  // Load section headings, chapter title, and notes for primary translation
  const loadSectionHeadings = useCallback(async () => {
    if (!primaryTranslationId) return;
    const headings = await getChapterHeadings(primaryTranslationId, currentBook, currentChapter);
    setSectionHeadings(headings);
  }, [primaryTranslationId, currentBook, currentChapter]);
  
  const loadChapterTitle = useCallback(async () => {
    if (!primaryTranslationId) return;
    const title = await getChapterTitle(primaryTranslationId, currentBook, currentChapter);
    setChapterTitle(title || null);
  }, [primaryTranslationId, currentBook, currentChapter]);
  
  const loadNotes = useCallback(async () => {
    if (!primaryTranslationId) return;
    const notesData = await getChapterNotes(primaryTranslationId, currentBook, currentChapter);
    setNotes(notesData);
  }, [primaryTranslationId, currentBook, currentChapter]);
  
  // Create/update/delete functions that use primary translation ID
  const createSectionHeading = useCallback(async (verseNum: number, title: string) => {
    if (!primaryTranslationId || !title.trim()) return null;
    
    const heading: SectionHeading = {
      id: globalThis.crypto.randomUUID(),
      moduleId: primaryTranslationId,
      beforeRef: {
        book: currentBook,
        chapter: currentChapter,
        verse: verseNum,
      },
      title: title.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await saveSectionHeading(heading);
    await loadSectionHeadings();
    return heading;
  }, [primaryTranslationId, currentBook, currentChapter, loadSectionHeadings]);
  
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
    if (!primaryTranslationId || !title.trim()) return null;
    
    const chapterTitleData = {
      id: globalThis.crypto.randomUUID(),
      moduleId: primaryTranslationId,
      book: currentBook,
      chapter: currentChapter,
      title: title.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await saveChapterTitle(chapterTitleData);
    await loadChapterTitle();
    return chapterTitleData;
  }, [primaryTranslationId, currentBook, currentChapter, loadChapterTitle]);
  
  const updateChapterTitle = useCallback(async (title: typeof chapterTitle) => {
    if (!title) return;
    const updated = {
      ...title,
      updatedAt: new Date(),
    };
    await saveChapterTitle(updated);
    await loadChapterTitle();
  }, [loadChapterTitle]);
  
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
    if (activeView && activeView.translationIds.length > 0 && translations.length > 0) {
      // Filter out invalid translation IDs
      const validTranslationIds = activeView.translationIds.filter(
        id => id !== 'observation-lists'
      );
      
      if (validTranslationIds.length > 0) {
        loadChapters();
        loadAnnotations();
        
        // Load section headings, chapter title, and notes for primary translation
        if (primaryTranslationId && primaryTranslationId !== 'observation-lists') {
          loadSectionHeadings();
          loadChapterTitle();
          loadNotes();
        }
      }
    }
  }, [activeView, currentBook, currentChapter, translations, primaryTranslationId, loadSectionHeadings, loadChapterTitle, loadNotes]);

  // Reload annotations when they are updated (e.g., when a new annotation is created)
  useEffect(() => {
    if (!activeView || activeView.translationIds.length === 0) return;
    
    const handleAnnotationsUpdated = () => {
      loadAnnotations();
    };
    
    // Listen for annotation updates
    window.addEventListener('annotationsUpdated', handleAnnotationsUpdated);
    
    return () => {
      window.removeEventListener('annotationsUpdated', handleAnnotationsUpdated);
    };
  }, [activeView, currentBook, currentChapter]);

  const loadAnnotations = async () => {
    if (!activeView) return;
    
    const newAnnotations = new Map<string, Annotation[]>();
    
    // Filter out any invalid translation IDs (like "observation-lists")
    const validTranslationIds = activeView.translationIds.filter(
      id => id !== 'observation-lists'
    );
    
    // Load annotations for each translation
    for (const translationId of validTranslationIds) {
      try {
        const annotations = await getChapterAnnotations(translationId, currentBook, currentChapter);
        newAnnotations.set(translationId, annotations);
      } catch (error) {
        console.error(`Failed to load annotations for ${translationId}:`, error);
        newAnnotations.set(translationId, []);
      }
    }
    
    setAnnotationsByTranslation(newAnnotations);
  };

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
          const firstWordIndex = selectedText.indexOf(firstWordMatch[0]);
          const lastWordIndex = selectedText.lastIndexOf(lastWordMatch[0]);
          
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
    
    // Get the expanded text and clean it
    let expandedText = expandedRange.toString();
    
    // Trim leading/trailing punctuation, whitespace, but keep internal punctuation
    // Remove common punctuation and whitespace from edges
    expandedText = expandedText.replace(/^[\s.,;:!?'"()\[\]{}—–-]+|[\s.,;:!?'"()\[\]{}—–-]+$/g, '');
    
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
    
    if (verseContent && originalText) {
      try {
        // Create a range from start of verse content to selection start
        const startRange = document.createRange();
        startRange.selectNodeContents(verseContent);
        startRange.setEnd(expandedRange.startContainer, expandedRange.startOffset);
        const textBefore = startRange.toString();
        startOffset = textBefore.length;

        // Calculate end offset
        const endRange = document.createRange();
        endRange.selectNodeContents(verseContent);
        endRange.setEnd(expandedRange.endContainer, expandedRange.endOffset);
        const textUpToEnd = endRange.toString();
        endOffset = textUpToEnd.length;
      } catch (e) {
        console.warn('Error calculating offsets:', e);
      }
    }

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

    // Filter out any invalid translation IDs (like "observation-lists")
    const validTranslationIds = activeView.translationIds.filter(
      id => id !== 'observation-lists'
    );

    // Initialize all translations with loading state
    for (const translationId of validTranslationIds) {
      const translation = translations.find(t => t.id === translationId);
      if (!translation) continue;

      // Check if we already have this chapter loaded for this book/chapter
      const existing = translationChapters.get(translationId);
      if (existing?.chapter && 
          existing.chapter.book === currentBook && 
          existing.chapter.chapter === currentChapter) {
        // Keep existing chapter
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
      } catch (error) {
        newChapters.set(translationId, {
          translation,
          chapter: null,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load chapter',
        });
        setTranslationChapters(new Map(newChapters));
      }

      // Add a small delay between requests to prevent overwhelming browser resources
      // Only delay if there are more translations to load
      const remainingTranslations = validTranslationIds.slice(
        validTranslationIds.indexOf(translationId) + 1
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
  
  // Helper to check if a translation column is fully loading (no chapter loaded at all)
  const isTranslationLoading = (translationId: string) => {
    const translationData = translationList.find(t => t.translation.id === translationId);
    return translationData?.isLoading && !translationData?.chapter;
  };

  return (
    <div className="multi-translation-view h-full flex flex-col" onClick={handleClick} data-bible-reader>
      {/* Chapter title section */}
      {(chapterTitle || creatingChapterTitle) && (
        <div className="px-4 py-3 text-center flex-shrink-0" data-chapter-title={currentChapter} style={{ scrollMarginTop: '80px' }}>
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
        className={`grid gap-4 px-4 py-2 border-b border-scripture-muted/20 bg-scripture-surface flex-shrink-0 ${translationList.length === 1 ? 'grid-cols-1' : translationList.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
      >
        {translationList.map(({ translation, isLoading }) => (
          <div key={translation.id} className="flex flex-col">
            <div className="font-medium text-scripture-text flex items-center gap-2">
              {translation.name}
              {isLoading && (
                <div className="w-4 h-4 border-2 border-scripture-border border-t-scripture-accent rounded-full animate-spin"></div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Verse rows - scrollable container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0" onMouseUp={handleMouseUp}>
          <div className="px-4 py-4 space-y-1.5">
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
                  className={`grid gap-4 ${translationList.length === 1 ? 'grid-cols-1' : translationList.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} transition-all duration-1000 ease-out ${navSelectedVerse === verseNum ? 'bg-scripture-accent/10 rounded-lg px-2 py-1' : ''}`}
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
                              annotations={annotationsByTranslation.get(translation.id) || []}
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
