/**
 * Verse Text Component
 * 
 * Renders a single verse with annotations applied.
 */

import { useState, useRef } from 'react';
import type { Verse, VerseRef } from '@/types/bible';
import type { Annotation, TextAnnotation, SymbolAnnotation } from '@/types/annotation';
import { HIGHLIGHT_COLORS, SYMBOLS } from '@/types/annotation';
import { CrossReferencePopup } from './CrossReferencePopup';
import { VerseOverlay } from './VerseOverlay';

interface VerseTextProps {
  verse: Verse;
  annotations: Annotation[];
  isSelected?: boolean;
  onRemoveAnnotation?: (id: string) => void;
  onVerseNumberClick?: (verseNum: number) => void;
  verseMenu?: React.ReactNode;
  onNavigate?: (ref: VerseRef) => void;
  onShowVerse?: (ref: VerseRef) => void; // Show verse in overlay
}

// Helper to extract plain text from HTML (removes tags but keeps text)
function extractPlainText(html: string): string {
  // Create a temporary element to parse HTML and extract text
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
}

export function VerseText({ verse, annotations, isSelected, onRemoveAnnotation, onVerseNumberClick, verseMenu, onNavigate, onShowVerse }: VerseTextProps) {
  const [crossRefState, setCrossRefState] = useState<{ refs: string[]; position: { x: number; y: number } } | null>(null);
  const [overlayVerse, setOverlayVerse] = useState<VerseRef | null>(null);
  const verseContentRef = useRef<HTMLSpanElement>(null);
  // Separate annotation types
  const textAnnotations = annotations.filter(
    (a): a is TextAnnotation => a.type !== 'symbol'
  );
  const symbolAnnotations = annotations.filter(
    (a): a is SymbolAnnotation => a.type === 'symbol'
  );

  // Get symbols before this verse (legacy positioning)
  const symbolsBefore = symbolAnnotations.filter(
    s => s.ref && s.position === 'before' && s.wordIndex === undefined
  );
  const symbolsAfter = symbolAnnotations.filter(
    s => s.ref && s.position === 'after' && s.wordIndex === undefined
  );
  
  // Get symbols on a range: center (legacy overlay/above) or before (inline in front of word)
  const centerSymbols = symbolAnnotations.filter(
    s => (s.position === 'center' || s.position === 'before') && s.ref && s.ref.verse === verse.ref.verse
  );

  // Helper to split text into words and get their character positions
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

  // Convert word indices to character offsets for rendering
  function wordIndicesToCharOffsets(
    plainText: string,
    startWordIndex: number | undefined,
    endWordIndex: number | undefined
  ): { start: number; end: number } | null {
    if (startWordIndex === undefined || endWordIndex === undefined) {
      return null;
    }
    
    const words = splitIntoWords(plainText);
    if (words.length === 0 || startWordIndex >= words.length || endWordIndex >= words.length) {
      return null;
    }
    
    const startChar = words[startWordIndex].startIndex;
    const endChar = words[endWordIndex].endIndex;
    
    return { start: startChar, end: endChar };
  }

  // Render verse text with annotations using a segment-based approach
  // This is more reliable than string manipulation - we split text into segments
  // where each segment has a uniform set of styles
  const renderAnnotatedText = (sourceText: string): string => {
    const verseNum = verse.ref.verse;
    
    // Get annotations that apply to this verse
    const verseAnnotations = textAnnotations.filter(ann => {
      return ann.startRef.verse <= verseNum && ann.endRef.verse >= verseNum;
    });

    // Get center symbols for this verse
    const verseCenterSymbols = centerSymbols.filter(sym => {
      return sym.ref && sym.ref.verse === verseNum && 
             (sym.endRef === undefined || sym.endRef.verse === verseNum);
    });

    // If no annotations, return as-is
    if (verseAnnotations.length === 0 && verseCenterSymbols.length === 0) {
      return sourceText;
    }

    // Extract plain text from source (removes any HTML/OSIS markup)
    const plainText = extractPlainText(sourceText);
    if (!plainText || plainText.length === 0) {
      return sourceText;
    }

    // Collect all annotation ranges with their styles
    interface AnnotationRange {
      start: number;
      end: number;
      textAnnotations: TextAnnotation[];
      symbolAnnotations: SymbolAnnotation[];
    }

    const ranges: AnnotationRange[] = [];

    // Add text annotations - prefer word indices, fall back to character offsets
    for (const ann of verseAnnotations) {
      if (ann.startRef.verse === verseNum && ann.endRef.verse === verseNum) {
        // Try word indices first (new approach)
        let charOffsets: { start: number; end: number } | null = null;
        
        if (ann.startWordIndex !== undefined && ann.endWordIndex !== undefined) {
          charOffsets = wordIndicesToCharOffsets(plainText, ann.startWordIndex, ann.endWordIndex);
        }
        
        // Fall back to character offsets (backward compatibility)
        if (!charOffsets && ann.startOffset !== undefined && ann.endOffset !== undefined) {
          charOffsets = { start: ann.startOffset, end: ann.endOffset };
        }
        
        if (charOffsets) {
          let range = ranges.find(r => r.start === charOffsets!.start && r.end === charOffsets!.end);
          if (!range) {
            range = { 
              start: charOffsets.start, 
              end: charOffsets.end, 
              textAnnotations: [], 
              symbolAnnotations: [] 
            };
            ranges.push(range);
          }
          range.textAnnotations.push(ann);
        }
      }
    }

    // Add center symbols - prefer word indices, fall back to character offsets
    for (const sym of verseCenterSymbols) {
      let charOffsets: { start: number; end: number } | null = null;
      
      if (sym.startWordIndex !== undefined && sym.endWordIndex !== undefined) {
        charOffsets = wordIndicesToCharOffsets(plainText, sym.startWordIndex, sym.endWordIndex);
      }
      
      // Fall back to character offsets (backward compatibility)
      if (!charOffsets && sym.startOffset !== undefined && sym.endOffset !== undefined) {
        charOffsets = { start: sym.startOffset, end: sym.endOffset };
      }
      
      if (charOffsets) {
        let range = ranges.find(r => r.start === charOffsets!.start && r.end === charOffsets!.end);
        if (!range) {
          range = { 
            start: charOffsets.start, 
            end: charOffsets.end, 
            textAnnotations: [], 
            symbolAnnotations: [] 
          };
          ranges.push(range);
        }
        range.symbolAnnotations.push(sym);
      }
    }

    // Sort ranges by start position
    ranges.sort((a, b) => a.start - b.start);

    // Build segments: split text at all annotation boundaries
    // Each segment will have a list of annotations that apply to it
    interface TextSegment {
      start: number;
      end: number;
      text: string;
      annotations: TextAnnotation[];
      symbols: SymbolAnnotation[];
    }

    const segments: TextSegment[] = [];
    const boundaries = new Set<number>([0, plainText.length]);
    
    // Collect all boundary points
    for (const range of ranges) {
      boundaries.add(range.start);
      boundaries.add(range.end);
    }

    const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

    console.log('Rendering annotations:', {
      plainTextLength: plainText.length,
      ranges: ranges.map(r => ({ start: r.start, end: r.end, count: r.textAnnotations.length + r.symbolAnnotations.length })),
      boundaries: Array.from(sortedBoundaries)
    });

    // Create segments between boundaries
    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
      const start = sortedBoundaries[i];
      const end = sortedBoundaries[i + 1];
      const text = plainText.substring(start, end);
      
      // Find which annotations apply to this segment
      const segmentAnnotations: TextAnnotation[] = [];
      const segmentSymbols: SymbolAnnotation[] = [];

      for (const range of ranges) {
        // Annotation applies if it overlaps with this segment
        // Use <= for end to include adjacent ranges (range ends exactly where segment starts)
        if (range.start < end && range.end > start) {
          segmentAnnotations.push(...range.textAnnotations);
          segmentSymbols.push(...range.symbolAnnotations);
        }
      }

      segments.push({
        start,
        end,
        text,
        annotations: segmentAnnotations,
        symbols: segmentSymbols,
      });
    }

    console.log('Created segments:', segments.map(s => ({
      start: s.start,
      end: s.end,
      text: s.text.substring(0, 20),
      annotationCount: s.annotations.length,
      symbolCount: s.symbols.length
    })));

    // Render each segment with its combined styles
    const htmlSegments: string[] = [];

    for (const segment of segments) {
      if (segment.annotations.length === 0 && segment.symbols.length === 0) {
        // No annotations - output plain text
        htmlSegments.push(escapeHtml(segment.text));
      } else {
        // Combine styles from all annotations
        const combinedStyles: string[] = [];
        const annotationIds: string[] = [];

        for (const ann of segment.annotations) {
          annotationIds.push(ann.id);
          if (ann.type === 'highlight') {
            combinedStyles.push(`background-color: ${HIGHLIGHT_COLORS[ann.color]}40`);
          }
          if (ann.type === 'textColor') {
            combinedStyles.push(`color: ${HIGHLIGHT_COLORS[ann.color]}`);
          }
          if (ann.type === 'underline') {
            combinedStyles.push(`text-decoration: underline`);
            combinedStyles.push(`text-decoration-color: ${HIGHLIGHT_COLORS[ann.color]}`);
            combinedStyles.push(`text-decoration-style: ${ann.underlineStyle || 'solid'}`);
          }
        }

        // Handle symbols: inline in front of the word so the word can also have highlight/underline/color
        if (segment.symbols.length > 0) {
          const symAnn = segment.symbols[0];
          const symbolText = SYMBOLS[symAnn.symbol];
          const symbolColor = symAnn.color ? HIGHLIGHT_COLORS[symAnn.color] : undefined;
          annotationIds.push(symAnn.id);
          const textStyles = combinedStyles.length ? ` style="${combinedStyles.join('; ')}"` : '';
          const allStyles = ['position: relative', 'display: inline-flex', 'align-items: baseline'];
          const styleAttr = ` style="${allStyles.join('; ')}"`;
          const classNames = `symbol-inline annotation-group ${annotationIds.map(id => `annotation-${id}`).join(' ')}`;
          htmlSegments.push(`<span${styleAttr} class="${classNames}" data-annotation-ids="${annotationIds.join(',')}">
              <span class="symbol-before" style="margin-right: 0.2em; font-size: 1.1em; line-height: 1; ${symbolColor ? `color: ${symbolColor};` : 'color: currentColor;'}">${symbolText}</span>
              <span class="annotation-text"${textStyles}>${escapeHtml(segment.text)}</span>
              <button 
                class="annotation-remove"
                data-annotation-id="${annotationIds[0]}"
                title="Remove annotation"
                aria-label="Remove annotation"
              >×</button>
            </span>`);
        } else {
          // Only text annotations
          const allStyles = ['position: relative', 'display: inline-block', ...combinedStyles];
          const styleAttr = ` style="${allStyles.join('; ')}"`;
          const classNames = `annotation-group ${annotationIds.map(id => `annotation-${id}`).join(' ')}`;
          htmlSegments.push(`<span${styleAttr} class="${classNames}" data-annotation-ids="${annotationIds.join(',')}">
            <span class="annotation-text">${escapeHtml(segment.text)}</span>
            <button 
              class="annotation-remove"
              data-annotation-id="${annotationIds[0]}"
              title="Remove annotation"
              aria-label="Remove annotation"
            >×</button>
          </span>`);
        }
      }
    }

    return htmlSegments.join('');
  };

  // Helper to escape HTML (for safety, though we control the content)
  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Use verse.text as the base (getBible returns clean plain text)
  // verse.html should be the same as verse.text for getBible
  const baseContent = verse.text || '';
  
  // Extract plain text to store in data attribute for offset calculations
  // This ensures offsets are calculated relative to the same plain text we render
  const plainTextForOffset = extractPlainText(baseContent);
  
  // Render annotations on the base text
  const content = renderAnnotatedText(baseContent);
  
  // Note: getBible returns plain text, so there are no cross-references to merge
  // If we add support for other APIs that provide cross-refs, we can add that logic here

  // Handle clicks on remove buttons and cross-references (using event delegation)
  const handleVerseContentClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    const target = e.target as HTMLElement;
    
    // Check for remove button clicks
    const removeButton = target.closest('.annotation-remove') as HTMLElement;
    if (removeButton && onRemoveAnnotation) {
      const annotationId = removeButton.getAttribute('data-annotation-id');
      if (annotationId) {
        e.preventDefault();
        e.stopPropagation();
        onRemoveAnnotation(annotationId);
      }
      return;
    }
    
    // Check for cross-reference clicks
    const crossRef = target.closest('.cross-ref') as HTMLElement;
    if (crossRef) {
      e.preventDefault();
      e.stopPropagation();
      const refsStr = crossRef.getAttribute('data-refs');
      if (refsStr) {
        const refs = refsStr.split(',').map(r => r.trim());
        const rect = crossRef.getBoundingClientRect();
        setCrossRefState({
          refs,
          position: {
            x: rect.left + rect.width / 2,
            y: rect.bottom + 8,
          },
        });
      }
    }
  };

  return (
    <span 
      className={`verse inline group ${isSelected ? 'bg-scripture-accent/20 rounded' : ''}`}
      data-verse={verse.ref.verse}
    >
      {/* Symbols before verse */}
      {symbolsBefore.map((sym, i) => (
        <span 
          key={`before-${i}`}
          className="symbol mr-1"
          style={{ color: sym.color ? HIGHLIGHT_COLORS[sym.color] : undefined }}
        >
          {SYMBOLS[sym.symbol]}
        </span>
      ))}

      {/* Verse number with menu */}
      <span className="relative inline-block">
        <span 
          className="verse-number cursor-pointer hover:text-scripture-text transition-colors relative inline-block"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onVerseNumberClick) {
              onVerseNumberClick(verse.ref.verse);
            }
          }}
          title={onVerseNumberClick ? "Click to add section heading or note" : undefined}
        >
          {verse.ref.verse}
        </span>
        {verseMenu}
      </span>

      {/* Verse text with styling */}
      <span 
        ref={verseContentRef}
        className="verse-content"
        data-original-text={plainTextForOffset}
        dangerouslySetInnerHTML={{ __html: content }}
        onClick={handleVerseContentClick}
      />

      {/* Symbols after verse */}
      {symbolsAfter.map((sym, i) => (
        <span 
          key={`after-${i}`}
          className="symbol ml-1"
          style={{ color: sym.color ? HIGHLIGHT_COLORS[sym.color] : undefined }}
        >
          {SYMBOLS[sym.symbol]}
        </span>
      ))}

      {/* Space between verses */}
      <span> </span>

      {/* Cross-reference popup */}
      {crossRefState && (
        <CrossReferencePopup
          refs={crossRefState.refs}
          onNavigate={onNavigate || (() => {})}
          onShowVerse={(ref) => {
            console.log('CrossReferencePopup: onShowVerse called with:', ref);
            // Always use internal state for overlay
            setOverlayVerse(ref);
            console.log('VerseText: overlayVerse state should be set');
            // Also notify parent if needed for external tracking
            if (onShowVerse) {
              onShowVerse(ref);
            }
          }}
          onClose={() => setCrossRefState(null)}
          position={crossRefState.position}
        />
      )}

      {/* Verse overlay */}
      {overlayVerse && (
        <VerseOverlay
          verseRef={overlayVerse}
          onClose={() => {
            console.log('VerseOverlay: closing');
            setOverlayVerse(null);
          }}
          onNavigate={onNavigate}
        />
      )}
    </span>
  );
}
