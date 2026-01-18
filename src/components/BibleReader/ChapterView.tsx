/**
 * Chapter View Component
 * 
 * Displays a chapter of Bible text with verse numbers and support for
 * annotations, highlights, and custom section headings.
 */

import { useEffect, useCallback, useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useAnnotations } from '@/hooks/useAnnotations';
import { VerseText } from './VerseText';
import { SectionHeadingEditor } from './SectionHeadingEditor';
import { SectionHeadingCreator } from './SectionHeadingCreator';
import { ChapterTitleEditor } from './ChapterTitleEditor';
import { ChapterTitleCreator } from './ChapterTitleCreator';
import { NoteEditor } from './NoteEditor';
import { NoteCreator } from './NoteCreator';
import { VerseNumberMenu } from './VerseNumberMenu';
import { getBookById } from '@/types/bible';
import type { Verse } from '@/types/bible';
import type { Annotation, SectionHeading, Note } from '@/types/annotation';
import { ESV_COPYRIGHT } from '@/lib/bible-api';

// Map fontSize to Tailwind class
function getFontSizeClass(fontSize: 'sm' | 'base' | 'lg' | 'xl'): string {
  const sizeMap = {
    sm: 'text-scripture-sm',
    base: 'text-scripture-base',
    lg: 'text-scripture-lg',
    xl: 'text-scripture-xl',
  };
  return sizeMap[fontSize];
}

export function ChapterView() {
  const { 
    chapter, 
    currentBook, 
    currentChapter, 
    currentModuleId,
    isLoading, 
    error,
    setLocation,
  } = useBibleStore();
  
  const { 
    annotations, 
    sectionHeadings,
    chapterTitle,
    notes,
    selection,
    setSelection,
    setIsSelecting,
    fontSize,
  } = useAnnotationStore();

  const { 
    loadAnnotations, 
    loadSectionHeadings,
    loadChapterTitle,
    loadNotes,
    removeAnnotation,
    createSectionHeading,
    updateSectionHeading,
    removeSectionHeading,
    createChapterTitle,
    updateChapterTitle,
    removeChapterTitle,
    createNote,
    updateNote,
    removeNote,
  } = useAnnotations();
  const bookInfo = getBookById(currentBook);
  
  const [creatingHeadingAt, setCreatingHeadingAt] = useState<number | null>(null);
  const [creatingChapterTitle, setCreatingChapterTitle] = useState(false);
  const [creatingNoteAt, setCreatingNoteAt] = useState<number | null>(null);
  const [verseMenuAt, setVerseMenuAt] = useState<number | null>(null);

  // Load annotations, section headings, chapter title, and notes when chapter changes
  useEffect(() => {
    if (currentModuleId) {
      loadAnnotations();
      loadSectionHeadings();
      loadChapterTitle();
      loadNotes();
    }
  }, [currentModuleId, currentBook, currentChapter, loadAnnotations, loadSectionHeadings, loadChapterTitle, loadNotes]);

  // When a marking overlay (Color/Symbol/Key Words) opens with a selection, scroll the
  // selected verse into view in the middle of the viewable area (below nav, above the overlay).
  useEffect(() => {
    const handler = () => {
      const sel = useAnnotationStore.getState().selection;
      if (!sel) return;
      const el = document.querySelector(`[data-verse="${sel.startVerse}"]`);
      if (!el) return;
      // Nav is sticky; get its height so we don't position the verse under it
      const nav = document.querySelector('nav, header[class*="nav"]');
      const navHeight = (nav?.getBoundingClientRect().height ?? 0) || 64;
      // Viewable band: from (navHeight) to 50vh (overlay takes bottom 50%). Center of that band:
      const viewableTop = navHeight;
      const viewableBottom = window.innerHeight * 0.5;
      const targetY =
        viewableBottom > viewableTop
          ? viewableTop + (viewableBottom - viewableTop) / 2
          : viewableTop + 40;
      // Use scroll-margin so the initial scroll doesn't put the verse under the nav
      const prevMargin = (el as HTMLElement).style.scrollMarginTop;
      (el as HTMLElement).style.scrollMarginTop = `${navHeight + 16}px`;
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
      (el as HTMLElement).style.scrollMarginTop = prevMargin;
      // Nudge so the verse center lands in the middle of the viewable band
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const rect = el.getBoundingClientRect();
          const centerY = rect.top + rect.height / 2;
          const main = (el as HTMLElement).closest('main') ?? document.querySelector('main');
          if (main && Math.abs(centerY - targetY) > 10) {
            (main as HTMLElement).scrollBy({ top: centerY - targetY, behavior: 'smooth' });
          }
        });
      });
    };
    window.addEventListener('markingOverlayOpened', handler);
    return () => window.removeEventListener('markingOverlayOpened', handler);
  }, []);

  // Split text into words (preserves whitespace/punctuation position info)
  function splitIntoWords(text: string): Array<{ word: string; startIndex: number; endIndex: number }> {
    const words: Array<{ word: string; startIndex: number; endIndex: number }> = [];
    const wordRegex = /\S+/g; // Matches one or more non-whitespace characters
    let match;
    
    while ((match = wordRegex.exec(text)) !== null) {
      words.push({
        word: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
    
    return words;
  }
  
  // Normalize a word by removing punctuation for comparison
  function normalizeWord(word: string): string {
    // Remove punctuation from start and end, but keep the word itself
    return word.replace(/^[^\w]*|[^\w]*$/g, '').toLowerCase();
  }

  // Find word indices for a selection within a verse text
  function findWordIndices(
    plainText: string, 
    selectedText: string, 
    textBeforeSelection: string,
    verseNum: number
  ): { startWordIndex: number; endWordIndex: number } | null {
    const words = splitIntoWords(plainText);
    if (words.length === 0) return null;
    
    // Get the words from the selected text
    const selectedWords = splitIntoWords(selectedText);
    if (selectedWords.length === 0) return null;
    
    // Count words before the selection (from DOM text, which might have HTML)
    const wordsBeforeSelection = splitIntoWords(textBeforeSelection);
    const approximateWordIndex = wordsBeforeSelection.length;
    
    // Normalize selected words (remove punctuation for comparison)
    const normalizedSelectedWords = selectedWords.map(w => normalizeWord(w.word));
    const firstSelectedWord = normalizedSelectedWords[0];
    
    console.log('findWordIndices - searching for:', {
      selectedText,
      selectedWords: selectedWords.map(w => w.word),
      normalizedSelectedWords,
      wordsInVerse: words.map(w => w.word),
      normalizedWordsInVerse: words.map(w => normalizeWord(w.word)),
      approximateWordIndex
    });
    
    const candidates: number[] = [];
    for (let i = 0; i < words.length; i++) {
      const normalizedWord = normalizeWord(words[i].word);
      if (normalizedWord === firstSelectedWord) {
        // Check if this sequence matches (using normalized words)
        let matches = true;
        for (let j = 0; j < normalizedSelectedWords.length; j++) {
          if (i + j >= words.length || 
              normalizeWord(words[i + j].word) !== normalizedSelectedWords[j]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          candidates.push(i);
        }
      }
    }
    
    console.log('findWordIndices - candidates found:', candidates);
    
    if (candidates.length === 0) {
      console.warn('No word sequence match found for:', selectedText);
      return null;
    }
    
    if (candidates.length === 1) {
      return {
        startWordIndex: candidates[0],
        endWordIndex: candidates[0] + selectedWords.length - 1
      };
    }
    
    // Multiple candidates - pick the one closest to approximateWordIndex
    // Prefer candidates that don't overlap with existing annotations
    const existingAnnotations = annotations.filter(a => {
      if (a.type === 'symbol') return false;
      const textAnn = a as any;
      return textAnn.startRef.verse === verseNum && 
             textAnn.endRef.verse === verseNum &&
             textAnn.startWordIndex !== undefined &&
             textAnn.endWordIndex !== undefined;
    });
    
    console.log('findWordIndices - existing annotations:', existingAnnotations.map(a => ({
      id: a.id,
      type: a.type,
      startWordIndex: (a as any).startWordIndex,
      endWordIndex: (a as any).endWordIndex,
      verse: (a as any).startRef.verse
    })));
    
    // Build set of annotated word indices
    const annotatedWordIndices = new Set<number>();
    for (const ann of existingAnnotations) {
      const textAnn = ann as any;
      for (let i = textAnn.startWordIndex; i <= textAnn.endWordIndex; i++) {
        annotatedWordIndices.add(i);
      }
    }
    
    console.log('findWordIndices - annotated word indices:', Array.from(annotatedWordIndices).sort((a, b) => a - b));
    
    // Score candidates: prefer non-overlapping, closest to approximate
    let bestCandidate: number | null = null;
    let bestScore = -Infinity;
    
    for (const candidate of candidates) {
      const endCandidate = candidate + selectedWords.length - 1;
      
      // Check if overlaps with existing annotations
      let overlaps = false;
      for (let i = candidate; i <= endCandidate; i++) {
        if (annotatedWordIndices.has(i)) {
          overlaps = true;
          break;
        }
      }
      
      // Score: prefer non-overlapping, prefer closer to approximate
      const distance = Math.abs(candidate - approximateWordIndex);
      const overlapPenalty = overlaps ? -1000 : 1000;
      const distanceBonus = 100 / (1 + distance);
      const score = overlapPenalty + distanceBonus;
      
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
      
      console.log(`Word candidate at index ${candidate}:`, {
        overlaps,
        distance,
        score
      });
    }
    
    if (bestCandidate === null) {
      // Fallback: just use the first candidate
      bestCandidate = candidates[0];
    }
    
    return {
      startWordIndex: bestCandidate,
      endWordIndex: bestCandidate + selectedWords.length - 1
    };
  }

  // Expand selection to word boundaries, excluding trailing punctuation
  function expandToWordBoundaries(range: Range): Range {
    const expandedRange = range.cloneRange();
    
    // Helper to check if a character is a word character (letter, digit, underscore, apostrophe)
    function isWordChar(char: string): boolean {
      return /\w/.test(char) || char === "'";
    }
    
    // Helper to check if a character is trailing punctuation (to exclude)
    function isTrailingPunctuation(char: string): boolean {
      // Exclude common punctuation but keep apostrophes
      return /[.,;:!?)\]}]/.test(char);
    }
    
    // Expand start to beginning of word
    const startContainer = expandedRange.startContainer;
    if (startContainer.nodeType === Node.TEXT_NODE) {
      const text = startContainer.textContent || '';
      const offset = expandedRange.startOffset;
      
      // If we're in the middle of a word, expand backwards
      if (offset > 0 && isWordChar(text[offset - 1])) {
        let wordStart = offset - 1;
        while (wordStart > 0 && isWordChar(text[wordStart - 1])) {
          wordStart--;
        }
        expandedRange.setStart(startContainer, wordStart);
      }
    }
    
    // Expand end to end of word, but exclude trailing punctuation
    const endContainer = expandedRange.endContainer;
    if (endContainer.nodeType === Node.TEXT_NODE) {
      const text = endContainer.textContent || '';
      const offset = expandedRange.endOffset;
      
      // If we're in the middle of a word, expand forwards
      if (offset < text.length && isWordChar(text[offset])) {
        let wordEnd = offset + 1;
        while (wordEnd < text.length && isWordChar(text[wordEnd])) {
          wordEnd++;
        }
        
        // Skip trailing punctuation
        while (wordEnd < text.length && isTrailingPunctuation(text[wordEnd])) {
          wordEnd++;
        }
        
        expandedRange.setEnd(endContainer, wordEnd);
      } else if (offset < text.length && isTrailingPunctuation(text[offset])) {
        // If we're at punctuation, don't include it - find the word before it
        let wordEnd = offset;
        // Skip backwards over punctuation
        while (wordEnd > 0 && isTrailingPunctuation(text[wordEnd - 1])) {
          wordEnd--;
        }
        // Now find the end of the word
        while (wordEnd > 0 && isWordChar(text[wordEnd - 1])) {
          wordEnd--;
        }
        // Find the actual end of the word
        let actualWordEnd = wordEnd;
        while (actualWordEnd < text.length && isWordChar(text[actualWordEnd])) {
          actualWordEnd++;
        }
        expandedRange.setEnd(endContainer, actualWordEnd);
      }
    }
    
    return expandedRange;
  }

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      return;
    }

    // Get the original range
    const originalRange = sel.getRangeAt(0);
    
    // Expand to word boundaries
    const expandedRange = expandToWordBoundaries(originalRange);
    
    // Trim trailing punctuation from the range (but keep apostrophes)
    function isTrailingPunctuation(char: string): boolean {
      return /[.,;:!?)\]}]/.test(char);
    }
    
    // Adjust the range end to exclude trailing punctuation
    const rangeEndContainer = expandedRange.endContainer;
    if (rangeEndContainer.nodeType === Node.TEXT_NODE) {
      const endText = rangeEndContainer.textContent || '';
      let endOffset = expandedRange.endOffset;
      
      // Move end backwards to skip trailing punctuation
      while (endOffset > expandedRange.startOffset && 
             endOffset > 0 &&
             isTrailingPunctuation(endText[endOffset - 1])) {
        endOffset--;
      }
      
      if (endOffset !== expandedRange.endOffset) {
        expandedRange.setEnd(rangeEndContainer, endOffset);
      }
    }
    
    // Update the selection to the expanded range
    sel.removeAllRanges();
    sel.addRange(expandedRange);
    
    const text = expandedRange.toString().trim();
    if (!text) return;

    // Try to find the verse range from selection
    const range = expandedRange;
    const startContainer = range.startContainer.parentElement;
    const endContainer = range.endContainer.parentElement;
    
    const startVerse = findVerseNumber(startContainer);
    const endVerse = findVerseNumber(endContainer);

    // Get the verse text elements to calculate word indices
    const startVerseElement = startContainer?.closest('[data-verse]');
    const endVerseElement = endContainer?.closest('[data-verse]');
    
    let startWordIndex: number | undefined;
    let endWordIndex: number | undefined;
    let startVerseText: string | undefined;
    let endVerseText: string | undefined;

    // Calculate word indices within the verse text
    if (startVerseElement && endVerseElement) {
      const startVerseContent = startVerseElement.querySelector('.verse-content');
      const endVerseContent = endVerseElement.querySelector('.verse-content');
      
      if (startVerseContent && endVerseContent) {
        // Get the selected text from the DOM (this is what the user actually selected)
        const selectedText = range.toString().trim();
        
        // Get the original verse text from data attribute (plain text, no annotations)
        const originalStartText = startVerseContent.getAttribute('data-original-text');
        const originalEndText = endVerseContent.getAttribute('data-original-text');
        
        if (originalStartText && originalEndText) {
          startVerseText = originalStartText;
          endVerseText = originalEndText;
          
          if (startVerse !== null && startVerse === endVerse && originalStartText) {
            // Single verse selection - use word-based indexing
            try {
              // Word-based indexing approach:
              // 1. Get text before selection from DOM
              // 2. Use word indices instead of character offsets
              // 3. Find the word sequence that matches the selection
              
              const startRange = document.createRange();
              startRange.selectNodeContents(startVerseContent);
              startRange.setEnd(range.startContainer, range.startOffset);
              const textBeforeSelection = startRange.toString();
              
              const wordIndices = findWordIndices(originalStartText, selectedText, textBeforeSelection, startVerse);
              if (wordIndices) {
                startWordIndex = wordIndices.startWordIndex;
                endWordIndex = wordIndices.endWordIndex;
                
                console.log('Word indices calculated:', {
                  selectedText,
                  startWordIndex,
                  endWordIndex,
                  verseText: originalStartText.substring(0, 50) + '...'
                });
              } else {
                console.warn('Could not find word indices for selection:', selectedText);
              }
            } catch (e) {
              console.warn('Error calculating word indices:', e);
            }
          } else {
            // Multi-verse selection - TODO: Handle word indices for multi-verse
            console.warn('Multi-verse selections not yet supported with word indexing');
          }
        } else {
          console.error('Original text not found in data-original-text attribute.');
        }
      }
    }

    console.log('Selection detected (expanded to words):', { 
      text, 
      startVerse, 
      endVerse, 
      startWordIndex, 
      endWordIndex, 
      currentModuleId 
    });

    if (startVerse && endVerse && currentModuleId) {
      if (startWordIndex !== undefined && endWordIndex !== undefined) {
                setSelection({
                  moduleId: currentModuleId,
                  book: currentBook,
                  chapter: currentChapter,
                  startVerse,
                  endVerse,
                  text,
                  startWordIndex,
                  endWordIndex,
                  startVerseText,
                  endVerseText,
                });
                setIsSelecting(true);
              } else {
                console.warn('Could not determine word indices for selection');
              }
            }
  }, [currentBook, currentChapter, currentModuleId, setSelection, setIsSelecting, annotations]);

  // Find verse number from an element
  function findVerseNumber(element: Element | null): number | null {
    while (element) {
      const verseAttr = element.getAttribute('data-verse');
      if (verseAttr) {
        return parseInt(verseAttr, 10);
      }
      element = element.parentElement;
    }
    return null;
  }

  // Get annotations for a specific verse
  function getVerseAnnotations(verseNum: number): Annotation[] {
    return annotations.filter(a => {
      if (a.type === 'symbol') {
        return a.ref.verse === verseNum;
      }
      return a.startRef.verse <= verseNum && a.endRef.verse >= verseNum;
    });
  }

  // Get section heading before a verse
  function getHeadingBefore(verseNum: number): SectionHeading | undefined {
    return sectionHeadings.find(h => h.beforeRef.verse === verseNum);
  }

  // Get notes for a specific verse
  function getVerseNotes(verseNum: number): Note[] {
    return notes.filter(note => {
      if (note.range) {
        return verseNum >= note.range.start.verse && verseNum <= note.range.end.verse;
      }
      return note.ref.verse === verseNum;
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-scripture-muted">
          Loading...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-highlight-red">
          {error}
        </div>
      </div>
    );
  }

  if (!chapter || chapter.verses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-scripture-muted">
        <p className="text-lg mb-2">No text loaded</p>
        <p className="text-sm">Select a module to begin reading</p>
      </div>
    );
  }

  return (
    <div 
      className="chapter-view px-4 md:px-8 py-6 md:py-8 max-w-3xl mx-auto"
      onMouseUp={handleMouseUp}
    >
      {/* Chapter header */}
      <header className="mb-6 md:mb-8 text-center">
        <h1 className="font-scripture text-3xl md:text-4xl text-scripture-text font-medium tracking-tight mb-4">
          {bookInfo?.name || currentBook} {currentChapter}
        </h1>
        
        {/* Chapter title */}
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
        ) : (
          <button
            onClick={() => setCreatingChapterTitle(true)}
            className="text-sm text-scripture-muted hover:text-scripture-accent 
                     transition-all duration-200 flex items-center gap-1.5 mx-auto
                     px-3 py-1.5 rounded-lg hover:bg-scripture-surface/50"
          >
            <span className="text-base leading-none">+</span>
            <span>Add chapter title</span>
          </button>
        )}
      </header>

      {/* Verses */}
      {chapter.verses.length > 0 && !chapter.verses.some(v => v.text.trim()) ? (
        <div className="flex flex-col items-center justify-center py-12 text-scripture-muted">
          <p className="text-lg mb-2">Chapter not available</p>
          <p className="text-sm text-center max-w-md">
            This chapter is not loaded. You may need to download the full module from the Module Manager.
          </p>
        </div>
      ) : (
        <div className={`scripture-text ${getFontSizeClass(fontSize)} space-y-2 md:space-y-2.5`}>
          {chapter.verses.map((verse: Verse) => (
          <div key={verse.ref.verse}>
            {/* Section heading if exists */}
            {getHeadingBefore(verse.ref.verse) && (
              <SectionHeadingEditor
                heading={getHeadingBefore(verse.ref.verse)!}
                verseNum={verse.ref.verse}
                onSave={updateSectionHeading}
                onDelete={removeSectionHeading}
              />
            )}
            
            {/* Section heading creator (shown when selected from menu) */}
            {creatingHeadingAt === verse.ref.verse && (
              <SectionHeadingCreator
                verseNum={verse.ref.verse}
                onSave={async (title) => {
                  await createSectionHeading(verse.ref.verse, title);
                  setCreatingHeadingAt(null);
                }}
                onCancel={() => setCreatingHeadingAt(null)}
              />
            )}

            {/* Verse */}
            <VerseText
              verse={verse}
              annotations={getVerseAnnotations(verse.ref.verse)}
              isSelected={
                selection !== null &&
                verse.ref.verse >= selection.startVerse &&
                verse.ref.verse <= selection.endVerse
              }
              onRemoveAnnotation={removeAnnotation}
              onVerseNumberClick={(verseNum) => {
                // Show menu with options: section heading or note
                // Only show menu if no heading exists already
                if (!getHeadingBefore(verseNum)) {
                  setVerseMenuAt(verseNum);
                } else {
                  // If heading exists, just allow adding note
                  setCreatingNoteAt(verseNum);
                }
              }}
              verseMenu={
                verseMenuAt === verse.ref.verse && !getHeadingBefore(verse.ref.verse) ? (
                  <VerseNumberMenu
                    verseNum={verse.ref.verse}
                    onAddHeading={() => {
                      setCreatingHeadingAt(verse.ref.verse);
                      setVerseMenuAt(null);
                    }}
                    onAddNote={() => {
                      setCreatingNoteAt(verse.ref.verse);
                      setVerseMenuAt(null);
                    }}
                    onClose={() => setVerseMenuAt(null)}
                  />
                ) : undefined
              }
              onNavigate={(ref) => {
                setLocation(ref.book, ref.chapter);
                // Scroll to the verse if possible (in the same chapter)
                if (ref.book === currentBook && ref.chapter === currentChapter) {
                  setTimeout(() => {
                    const verseElement = document.querySelector(`[data-verse="${ref.verse}"]`);
                    if (verseElement) {
                      verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }, 100);
                }
              }}
              onShowVerse={() => {
                // VerseText will handle showing the overlay internally
                // This prop allows parent to control it if needed
              }}
            />

            {/* Notes for this verse */}
            {getVerseNotes(verse.ref.verse).map((note) => (
              <NoteEditor
                key={note.id}
                note={note}
                verseNum={verse.ref.verse}
                book={currentBook}
                chapter={currentChapter}
                onSave={updateNote}
                onDelete={removeNote}
              />
            ))}

            {/* Note creator (shown when creating note) */}
            {creatingNoteAt === verse.ref.verse && (
              <NoteCreator
                verseNum={verse.ref.verse}
                range={
                  selection && 
                  selection.startVerse === verse.ref.verse && 
                  selection.endVerse !== verse.ref.verse
                    ? { startVerse: selection.startVerse, endVerse: selection.endVerse }
                    : undefined
                }
                onSave={async (content) => {
                  const range = selection && 
                    selection.startVerse === verse.ref.verse && 
                    selection.endVerse !== verse.ref.verse
                      ? { startVerse: selection.startVerse, endVerse: selection.endVerse }
                      : undefined;
                  await createNote(verse.ref.verse, content, range);
                  setCreatingNoteAt(null);
                }}
                onCancel={() => {
                  setCreatingNoteAt(null);
                }}
              />
            )}
          </div>
        ))}
        </div>
      )}

      {/* ESV copyright (ESV API compliance) */}
      {currentModuleId && (currentModuleId.toUpperCase() === 'ESV' || currentModuleId.toLowerCase().startsWith('esv-')) && (
        <p className="mt-8 pt-6 border-t border-scripture-muted/30 text-xs text-scripture-muted text-center">
          {ESV_COPYRIGHT}
        </p>
      )}

      {/* Bottom padding for toolbar */}
      <div className="h-24" />
    </div>
  );
}
