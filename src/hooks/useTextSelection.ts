/**
 * useTextSelection Hook
 *
 * Handles text selection in the multi-translation Bible reader:
 * - Expands browser selection to word boundaries
 * - Detects which translation column contains the selection
 * - Calculates character offsets within the verse
 * - Looks up Strong's numbers
 * - Updates the annotation store with selection data
 */

import { useCallback } from 'react';
import { useAnnotationStore } from '@/stores/annotationStore';
import type { Chapter } from '@/types';
import type { ApiTranslation } from '@/lib/bible-api';

export interface TranslationChapter {
  translation: ApiTranslation;
  chapter: Chapter | null;
  isLoading: boolean;
  error: string | null;
}

interface UseTextSelectionOptions {
  activeView: { translationIds: string[] } | null;
  currentBook: string;
  currentChapter: number;
  translationChapters: Map<string, TranslationChapter>;
  verseContainerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Expand a browser Range to word boundaries and extract clean text.
 */
function expandToWordBoundaries(range: Range): { expandedRange: Range; text: string } {
  const expandedRange = range.cloneRange();

  const commonAncestor = expandedRange.commonAncestorContainer;

  if (commonAncestor.nodeType === Node.TEXT_NODE) {
    const textContent = commonAncestor.textContent || '';
    let startOffset = expandedRange.startOffset;
    let endOffset = expandedRange.endOffset;

    while (startOffset > 0 && /\w/.test(textContent[startOffset - 1])) {
      startOffset--;
    }
    while (endOffset < textContent.length && /\w/.test(textContent[endOffset])) {
      endOffset++;
    }

    expandedRange.setStart(commonAncestor, startOffset);
    expandedRange.setEnd(commonAncestor, endOffset);
  } else {
    try {
      const selectedText = expandedRange.toString();
      const firstWordMatch = selectedText.match(/\w/);
      const lastWordMatch = selectedText.match(/\w(?=[\s\p{P}]*$)/u);

      if (firstWordMatch && lastWordMatch) {
        const startContainer = expandedRange.startContainer;
        const endContainer = expandedRange.endContainer;

        if (startContainer.nodeType === Node.TEXT_NODE && endContainer.nodeType === Node.TEXT_NODE) {
          let startOffset = expandedRange.startOffset;
          let endOffset = expandedRange.endOffset;

          const startText = startContainer.textContent || '';
          while (startOffset > 0 && /\w/.test(startText[startOffset - 1])) {
            startOffset--;
          }

          const endText = endContainer.textContent || '';
          while (endOffset < endText.length && /\w/.test(endText[endOffset])) {
            endOffset++;
          }

          expandedRange.setStart(startContainer, startOffset);
          expandedRange.setEnd(endContainer, endOffset);
        }
      }
    } catch (e) {
      console.warn('Could not expand selection to word boundaries:', e);
    }
  }

  let expandedText = '';

  if (!expandedRange.collapsed) {
    const clone = expandedRange.cloneContents();
    expandedText = clone.textContent || '';

    if (!expandedText || expandedText.trim().length === 0) {
      const textParts: string[] = [];
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null);
      for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
        if (textNode.textContent) {
          textParts.push(textNode.textContent);
        }
      }
      expandedText = textParts.join('');
    }
  }

  expandedText = expandedText.replace(/\s+/g, ' ').trim();
  expandedText = expandedText.replace(/^[\s.,;:!?'"()[\]+{}—–-]+|[\s.,;:!?'"()[\]+{}—–-]+$/g, '');

  return { expandedRange, text: expandedText };
}

export function useTextSelection({
  activeView,
  currentBook,
  currentChapter,
  translationChapters,
  verseContainerRef,
}: UseTextSelectionOptions) {
  const { setSelection, setIsSelecting } = useAnnotationStore();

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const originalRange = sel.getRangeAt(0);
    const { expandedRange, text } = expandToWordBoundaries(originalRange);

    if (!text || text.length === 0) return;

    sel.removeAllRanges();
    sel.addRange(expandedRange);

    // Find which translation column the selection is in
    const startContainer = expandedRange.startContainer.parentElement;
    const verseElement = startContainer?.closest('[data-verse]');
    if (!verseElement) return;

    const verseRow = verseElement.closest('.grid[data-verse]') || verseElement.closest('.grid');
    if (!verseRow || !activeView) return;

    const verseCell = verseElement.closest('.verse-cell');
    if (!verseCell) return;

    const cells = Array.from(verseRow.children);
    const cellIndex = cells.indexOf(verseCell);
    if (cellIndex === -1 || cellIndex >= activeView.translationIds.length) return;

    const translationId = activeView.translationIds[cellIndex];
    if (!translationId) return;

    const verseNum = parseInt(verseElement.getAttribute('data-verse') || '0', 10);
    if (!verseNum) return;

    const verseContent = verseElement.querySelector('.verse-content');
    const originalText = verseContent?.getAttribute('data-original-text') || '';

    // Calculate character offsets within the verse
    let startOffset: number | undefined;
    let endOffset: number | undefined;

    if (verseContent && originalText && text.trim()) {
      try {
        const selectedText = text.trim();
        const domTextContent = verseContent.textContent || '';

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

        if (domTextContent === originalText) {
          startOffset = domStartOffset;
          endOffset = domEndOffset;
        } else {
          const lowerOriginal = originalText.toLowerCase();
          const lowerSelected = selectedText.toLowerCase();

          const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const occurrences: number[] = [];
          const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(lowerSelected)}\\b`, 'g');
          let regexMatch;
          while ((regexMatch = wordBoundaryRegex.exec(lowerOriginal)) !== null) {
            occurrences.push(regexMatch.index);
          }

          if (occurrences.length === 0) {
            let searchIdx = 0;
            while ((searchIdx = lowerOriginal.indexOf(lowerSelected, searchIdx)) !== -1) {
              occurrences.push(searchIdx);
              searchIdx++;
            }
          }

          if (occurrences.length === 0) {
            console.warn('[useTextSelection] Selected text not found:', selectedText.substring(0, 50));
            return;
          }

          if (occurrences.length === 1) {
            startOffset = occurrences[0];
            endOffset = occurrences[0] + selectedText.length;
          } else {
            let estimatedPos = domStartOffset;
            if (domTextContent.length > 0 && originalText.length > 0 && domTextContent.length !== originalText.length) {
              const ratio = originalText.length / domTextContent.length;
              estimatedPos = Math.floor(domStartOffset * ratio);
            }

            const searchWindow = Math.max(selectedText.length * 3, 50);
            const searchStart = Math.max(0, estimatedPos - searchWindow);
            const searchEnd = Math.min(originalText.length, estimatedPos + searchWindow);

            const nearbyOccurrences = occurrences.filter(occ => occ >= searchStart && occ <= searchEnd);

            const findClosest = (candidates: number[], target: number) => {
              let best = candidates[0];
              let minDist = Math.abs(candidates[0] - target);
              for (const occ of candidates.slice(1)) {
                const dist = Math.abs(occ - target);
                if (dist < minDist) {
                  minDist = dist;
                  best = occ;
                }
              }
              return best;
            };

            const best = findClosest(nearbyOccurrences.length > 0 ? nearbyOccurrences : occurrences, estimatedPos);
            startOffset = best;
            endOffset = best + selectedText.length;
          }
        }

        // Validate offsets
        if (startOffset !== undefined && endOffset !== undefined) {
          startOffset = Math.max(0, Math.min(startOffset, originalText.length));
          endOffset = Math.max(startOffset, Math.min(endOffset, originalText.length));

          const actualSelected = originalText.substring(startOffset, endOffset).trim();
          const normalizeForMatch = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
          if (normalizeForMatch(actualSelected) !== normalizeForMatch(selectedText)) {
            console.warn('[useTextSelection] Offset mismatch:', {
              selectedText,
              actualSelected,
              startOffset,
              endOffset,
            });
          }
        } else {
          console.warn('[useTextSelection] Failed to calculate offsets for:', selectedText);
          return;
        }
      } catch (e) {
        console.warn('[useTextSelection] Error calculating offsets:', e);
        return;
      }
    }

    // Capture menu position from selection rect
    const selRect = expandedRange.getBoundingClientRect();
    const menuAnchor = {
      x: selRect.left + selRect.width / 2,
      y: selRect.top,
    };

    // Look up Strong's numbers
    let strongsNumbers: string[] | undefined;
    const tc = translationChapters.get(translationId);
    const verseData = tc?.chapter?.verses.find((v) => v.ref.verse === verseNum);
    if (verseData?.words) {
      const selectedLower = text.trim().toLowerCase();
      const matched = new Set<string>();
      for (const w of verseData.words) {
        if (selectedLower.includes(w.word.toLowerCase()) || w.word.toLowerCase().includes(selectedLower)) {
          for (const s of w.strongs) matched.add(s);
        }
      }
      if (matched.size > 0) strongsNumbers = [...matched];
    }

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
      strongsNumbers,
    });
    setIsSelecting(true);

    // Scroll the selected verse to the top of the container so it's above the bottom sheet
    requestAnimationFrame(() => {
      const container = verseContainerRef.current;
      const verseEl = container?.querySelector(`[data-verse="${verseNum}"]`);
      if (verseEl && container) {
        const verseRect = verseEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const scrollDelta = verseRect.top - containerRect.top;
        if (scrollDelta > 0) {
          container.scrollBy({ top: scrollDelta, behavior: 'smooth' });
        }
      }
    });

    sel.removeAllRanges();
  }, [activeView, currentBook, currentChapter, translationChapters, setSelection, setIsSelecting, verseContainerRef]);

  return { handleMouseUp };
}
