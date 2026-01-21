/**
 * Verse Text Component
 * 
 * Renders a single verse with annotations applied.
 */

import { useState, useRef, useMemo } from 'react';
import type { Verse, VerseRef } from '@/types/bible';
import type { Annotation, TextAnnotation, SymbolAnnotation, SymbolKey } from '@/types/annotation';
import { HIGHLIGHT_COLORS, SYMBOLS } from '@/types/annotation';
import { CrossReferencePopup } from './CrossReferencePopup';
import { VerseOverlay } from './VerseOverlay';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { findKeywordMatches } from '@/lib/keywordMatching';
import { getDebugFlagsSync } from '@/lib/debug';

interface VerseTextProps {
  verse: Verse;
  annotations: Annotation[];
  moduleId?: string; // Current translation moduleId for module-scoped keywords
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

export function VerseText({ verse, annotations, moduleId, isSelected, onRemoveAnnotation, onVerseNumberClick, verseMenu, onNavigate, onShowVerse }: VerseTextProps) {
  const [crossRefState, setCrossRefState] = useState<{ refs: string[]; position: { x: number; y: number } } | null>(null);
  const [overlayVerse, setOverlayVerse] = useState<VerseRef | null>(null);
  const verseContentRef = useRef<HTMLSpanElement>(null);
  
  // Get all marking presets for cross-translation keyword highlighting
  const { presets } = useMarkingPresetStore();
  const { activeStudyId } = useStudyStore();
  
  // Filter presets by active study
  const filteredPresets = useMemo(() => {
    // If no study is active, show all keywords (global + study-scoped)
    if (!activeStudyId) {
      return presets;
    }
    
    // If a study is active, show:
    // - Global keywords (no studyId)
    // - Keywords belonging to the active study
    return presets.filter(preset => {
      // Global keywords (no studyId) are always visible
      if (!preset.studyId) return true;
      // Show keywords that belong to the active study
      return preset.studyId === activeStudyId;
    });
  }, [presets, activeStudyId]);
  
  // Get debug flags once for this component
  const debugFlags = getDebugFlagsSync();
  
  // Compute virtual annotations from keyword presets (cross-translation highlighting)
  // These are computed on-the-fly and not persisted
  const virtualAnnotations = useMemo(() => {
    // Use verse.text directly - it's already plain text after parsing
    // extractPlainText is only needed for HTML/OSIS markup, but ESV/ASV text is already clean
    const verseText = verse.text || '';
    
    // Debug: Log ESV-specific debugging for Jeremiah 29 when debug flags are enabled
    const isESVDebug = debugFlags.verseText && verse.ref.book === 'Jer' && verse.ref.chapter === 29;
    
    if (isESVDebug) {
      console.log(`%c[VerseText] ESV Debug - Verse ${verse.ref.verse}`, 'color: orange; font-weight: bold; font-size: 14px;');
      console.log({
        verseText: verseText.substring(0, 200),
        verseTextLength: verseText.length,
        moduleId,
        filteredPresetsCount: filteredPresets.length,
        allPresetsCount: presets.length,
        relevantPresets: filteredPresets
          .filter(p => (p.word?.toLowerCase().includes('jeremiah') || p.word?.toLowerCase().includes('lord')) && 
                       (!p.moduleScope || p.moduleScope === moduleId))
          .map(p => ({
            id: p.id,
            word: p.word,
            moduleScope: p.moduleScope,
            bookScope: p.bookScope,
            chapterScope: p.chapterScope,
            hasSymbol: !!p.symbol,
            hasHighlight: !!p.highlight
          }))
      });
    }
    
    const matches = findKeywordMatches(verseText, verse.ref, filteredPresets, moduleId);
    
    if (isESVDebug) {
      console.log(`[VerseText] ESV Debug - Verse ${verse.ref.verse} matches:`, {
        totalMatches: matches.length,
        matches: matches.map(m => ({
          id: m.id,
          type: m.type,
          startOffset: 'startOffset' in m ? m.startOffset : undefined,
          endOffset: 'endOffset' in m ? m.endOffset : undefined,
          selectedText: 'selectedText' in m ? m.selectedText : undefined,
          presetId: 'presetId' in m ? m.presetId : undefined,
          matchedText: 'startOffset' in m && 'endOffset' in m 
            ? verseText.substring(m.startOffset || 0, m.endOffset || 0)
            : undefined
        }))
      });
    }
    
    // Debug: log if we're looking at verse 1 and there are matches
    if (debugFlags.verseText && verse.ref.verse === 1) {
      const jeremiahPresets = filteredPresets.filter(p => p.word?.toLowerCase().includes('jeremiah'));
      const jeremiahMatches = matches.filter(m => 
        ('selectedText' in m && m.selectedText?.toLowerCase().includes('jeremiah')) ||
        ('startOffset' in m && verseText.substring(m.startOffset || 0, m.endOffset || 0).toLowerCase().includes('jeremiah'))
      );
      if (jeremiahMatches.length > 0) {
        console.log(`[VerseText] Found ${jeremiahMatches.length} "Jeremiah" virtual annotations in verse 1:`, jeremiahMatches);
      } else {
        console.log(`[VerseText] No "Jeremiah" virtual annotations found in verse 1.`, {
          totalMatches: matches.length,
          verseText: verseText.substring(0, 150),
          jeremiahPresets: jeremiahPresets.map(p => ({ 
            id: p.id, 
            word: p.word, 
            studyId: p.studyId,
            bookScope: p.bookScope,
            chapterScope: p.chapterScope,
            moduleScope: p.moduleScope,
            hasSymbol: !!p.symbol,
            hasHighlight: !!p.highlight
          })),
          activeStudyId,
          allPresetsCount: presets.length,
          filteredPresetsCount: filteredPresets.length
        });
      }
    }
    
    return matches;
  }, [verse.text, verse.ref, filteredPresets, moduleId]);
  
  // Merge real annotations with virtual annotations
  // Virtual annotations are filtered out if a real annotation already covers the same range
  // EXCEPT: if the real annotation has the same presetId, prefer the virtual one (it's from the keyword preset)
  const allAnnotations = useMemo(() => {
    // Build a map of real annotation ranges with their presetIds
    const realAnnotationMap = new Map<string, { start: number; end: number; presetId?: string }>();
    
    for (const ann of annotations) {
      if ('startOffset' in ann && 'endOffset' in ann) {
        const key = `${ann.startOffset}-${ann.endOffset}`;
        realAnnotationMap.set(key, {
          start: ann.startOffset!,
          end: ann.endOffset!,
          presetId: 'presetId' in ann ? ann.presetId : undefined
        });
      }
    }
    
    // Filter out real annotations that have the same presetId as a virtual annotation
    // (These are likely duplicates created before we fixed the bug)
    const filteredRealAnnotations = annotations.filter(ann => {
      if ('startOffset' in ann && 'endOffset' in ann && 'presetId' in ann && ann.presetId) {
        // Check if there's a virtual annotation with the same presetId and overlapping range
        const hasMatchingVirtual = virtualAnnotations.some(vann => {
          if ('startOffset' in vann && 'endOffset' in vann && vann.presetId === ann.presetId) {
            // Check if ranges overlap
            return vann.startOffset! < ann.endOffset! && vann.endOffset! > ann.startOffset!;
          }
          return false;
        });
        // If there's a matching virtual annotation, filter out the real one
        return !hasMatchingVirtual;
      }
      return true; // Keep real annotations without presetId or without offsets
    });
    
    // Only include virtual annotations that don't overlap with remaining real annotations
    // Use filteredRealAnnotations to build the overlap map (not the original annotations)
    const filteredRealAnnotationMap = new Map<string, { start: number; end: number; presetId?: string }>();
    for (const ann of filteredRealAnnotations) {
      if ('startOffset' in ann && 'endOffset' in ann) {
        const key = `${ann.startOffset}-${ann.endOffset}`;
        filteredRealAnnotationMap.set(key, {
          start: ann.startOffset!,
          end: ann.endOffset!,
          presetId: 'presetId' in ann ? ann.presetId : undefined
        });
      }
    }
    
    const filteredVirtual = virtualAnnotations.filter(vann => {
      if ('startOffset' in vann && 'endOffset' in vann) {
        // Check if any remaining real annotation covers this range
        // BUT: if virtual annotation has a presetId and real annotation doesn't (or has different one), prefer virtual
        const hasOverlap = Array.from(filteredRealAnnotationMap.values()).some(realRange => {
          const overlaps = vann.startOffset! < realRange.end && vann.endOffset! > realRange.start;
          if (!overlaps) return false;
          
          // If virtual has presetId and real doesn't, prefer virtual (don't filter it out)
          if (vann.presetId && !realRange.presetId) {
            return false; // Don't consider this an overlap - prefer virtual
          }
          
          // If both have presetIds and they're different, prefer virtual (it's from keyword matching)
          if (vann.presetId && realRange.presetId && vann.presetId !== realRange.presetId) {
            return false; // Don't consider this an overlap - prefer virtual
          }
          
          return true; // Overlap with same presetId or real has presetId but virtual doesn't
        });
        
        // Debug: log if "Jeremiah" virtual annotation is being filtered out
        const isJeremiahDebug = debugFlags.verseText && verse.ref.verse === 1 && 
            (('selectedText' in vann && vann.selectedText?.toLowerCase().includes('jeremiah')) ||
             verse.text.substring(vann.startOffset || 0, vann.endOffset || 0).toLowerCase().includes('jeremiah'));
        const isLORDVerse15Debug = debugFlags.verseText && verse.ref.verse === 15 && 
            (('selectedText' in vann && (vann.selectedText?.toLowerCase().includes('lord') || vann.selectedText === 'LORD')) ||
             verse.text.substring(vann.startOffset || 0, vann.endOffset || 0).toLowerCase().includes('lord'));
        
        if (isJeremiahDebug || isLORDVerse15Debug) {
          // Calculate overlapping ranges using the same logic as hasOverlap (with preference)
          const overlappingReal = Array.from(filteredRealAnnotationMap.values()).filter(realRange => {
            const overlaps = vann.startOffset! < realRange.end && vann.endOffset! > realRange.start;
            if (!overlaps) return false;
            
            // Apply same preference logic as hasOverlap check
            if (vann.presetId && !realRange.presetId) {
              return false; // Virtual preferred, don't count as overlap
            }
            if (vann.presetId && realRange.presetId && vann.presetId !== realRange.presetId) {
              return false; // Virtual preferred, don't count as overlap
            }
            return true; // Real overlap that would cause filtering
          });
          // Find the actual real annotations that overlap
          const overlappingRealAnnotations = annotations.filter(ann => {
            if ('startOffset' in ann && 'endOffset' in ann) {
              return ann.startOffset! < vann.endOffset! && ann.endOffset! > vann.startOffset!;
            }
            return false;
          });
          
          const overlappingDetails = overlappingRealAnnotations.map(ann => {
            const annStart = 'startOffset' in ann ? ann.startOffset : undefined;
            const annEnd = 'startOffset' in ann ? ann.endOffset : undefined;
            return {
              id: ann.id,
              type: ann.type,
              startOffset: annStart,
              endOffset: annEnd,
              presetId: 'presetId' in ann ? ann.presetId : undefined,
              selectedText: 'selectedText' in ann ? ann.selectedText : undefined,
              actualText: annStart !== undefined && annEnd !== undefined 
                ? verse.text.substring(annStart, annEnd) 
                : undefined,
              hasSamePresetId: 'presetId' in ann && ann.presetId === vann.presetId
            };
          });
          
          console.log(`[VerseText] Virtual annotation in verse ${verse.ref.verse}:`, {
            virtualAnnotation: {
              id: vann.id,
              type: vann.type,
              startOffset: vann.startOffset,
              endOffset: vann.endOffset,
              presetId: vann.presetId,
              matchedText: verse.text.substring(vann.startOffset || 0, vann.endOffset || 0)
            },
            hasOverlap,
            overlappingRealRanges: overlappingReal,
            overlappingRealAnnotations: overlappingDetails,
            allRealAnnotations: Array.from(filteredRealAnnotationMap.values()),
            allRealAnnotationsFull: filteredRealAnnotations.map(ann => ({
              id: ann.id,
              type: ann.type,
              startOffset: 'startOffset' in ann ? ann.startOffset : undefined,
              endOffset: 'endOffset' in ann ? ann.endOffset : undefined,
              presetId: 'presetId' in ann ? ann.presetId : undefined,
              selectedText: 'selectedText' in ann ? ann.selectedText : undefined
            })),
            willBeIncluded: !hasOverlap,
            reason: hasOverlap 
              ? `Filtered out due to overlap with ${overlappingDetails.length} real annotation(s)`
              : 'Will be included'
          });
        }
        
        return !hasOverlap;
      }
      return true; // Include if no offset info (shouldn't happen, but be safe)
    });
    
    return [...filteredRealAnnotations, ...filteredVirtual];
  }, [annotations, virtualAnnotations]);
  
  // Separate annotation types
  const textAnnotations = allAnnotations.filter(
    (a): a is TextAnnotation => a.type !== 'symbol'
  );
  const symbolAnnotations = allAnnotations.filter(
    (a): a is SymbolAnnotation => a.type === 'symbol'
  );

  // Get symbols before this verse (legacy positioning)
  // Exclude virtual annotations (empty moduleId) - they should be rendered inline, not before verse
  // Only include real annotations (non-empty moduleId) that have position 'before' and no wordIndex
  // AND no valid offsets (if it has offsets, it should be rendered inline, not before verse)
  const symbolsBefore = symbolAnnotations.filter(
    s => s.ref && 
         s.position === 'before' && 
         s.wordIndex === undefined && 
         s.moduleId && s.moduleId.length > 0 &&
         (s.startOffset === undefined || s.endOffset === undefined) // No valid offsets = legacy before-verse positioning
  );
  const symbolsAfter = symbolAnnotations.filter(
    s => s.ref && 
         s.position === 'after' && 
         s.wordIndex === undefined && 
         s.moduleId && s.moduleId.length > 0 &&
         (s.startOffset === undefined || s.endOffset === undefined) // No valid offsets = legacy after-verse positioning
  );
  
  // Get symbols on a range: center (legacy overlay/above) or before (inline in front of word)
  // This includes virtual annotations (empty moduleId) which should be rendered inline
  // For virtual annotations with position 'before', they should have startOffset/endOffset to be rendered inline
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

    // For ESV/ASV/getBible, sourceText is already plain text after parsing
    // Only extractPlainText if needed for HTML/OSIS markup (other APIs)
    // Since we're using verse.text directly, sourceText should already be plain text
    const plainText = sourceText;
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
          // Validate and clamp offsets to text bounds
          const start = Math.max(0, Math.min(ann.startOffset, plainText.length));
          const end = Math.max(start, Math.min(ann.endOffset, plainText.length));
          charOffsets = { start, end };
        }
        
        if (charOffsets) {
          // Ensure offsets are within bounds
          charOffsets.start = Math.max(0, Math.min(charOffsets.start, plainText.length));
          charOffsets.end = Math.max(charOffsets.start, Math.min(charOffsets.end, plainText.length));
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
    // Merge overlapping ranges to prevent duplicate symbols on the same word
    for (const sym of verseCenterSymbols) {
      let charOffsets: { start: number; end: number } | null = null;
      
      if (sym.startWordIndex !== undefined && sym.endWordIndex !== undefined) {
        charOffsets = wordIndicesToCharOffsets(plainText, sym.startWordIndex, sym.endWordIndex);
      }
      
      // Fall back to character offsets (backward compatibility)
      if (!charOffsets && sym.startOffset !== undefined && sym.endOffset !== undefined) {
        // Validate and clamp offsets to text bounds
        const start = Math.max(0, Math.min(sym.startOffset, plainText.length));
        const end = Math.max(start, Math.min(sym.endOffset, plainText.length));
        
        // Debug: log if offsets were out of bounds (indicates cached text issue)
        if (debugFlags.verseText && (sym.startOffset !== start || sym.endOffset !== end)) {
          console.warn(`[VerseText] Symbol offset out of bounds for verse ${verse.ref.verse}:`, {
            original: { start: sym.startOffset, end: sym.endOffset },
            clamped: { start, end },
            textLength: plainText.length,
            isVirtual: !sym.moduleId || sym.moduleId === '',
            presetId: sym.presetId
          });
        }
        
        charOffsets = { start, end };
      }
      
      if (charOffsets) {
        // Ensure offsets are within bounds
        const originalStart = charOffsets.start;
        const originalEnd = charOffsets.end;
        charOffsets.start = Math.max(0, Math.min(charOffsets.start, plainText.length));
        charOffsets.end = Math.max(charOffsets.start, Math.min(charOffsets.end, plainText.length));
        
        // Debug: log if offsets were clamped
        if (debugFlags.verseText && (originalStart !== charOffsets.start || originalEnd !== charOffsets.end)) {
          console.warn(`[VerseText] Symbol offset clamped for verse ${verse.ref.verse}:`, {
            original: { start: originalStart, end: originalEnd },
            clamped: { start: charOffsets.start, end: charOffsets.end },
            textLength: plainText.length
          });
        }
        // First try exact match
        let range = ranges.find(r => r.start === charOffsets!.start && r.end === charOffsets!.end);
        
        // If no exact match, try to find an overlapping range or a range that refers to the same word
        // We merge symbols on overlapping ranges to prevent duplicates
        if (!range) {
          // Get the text for this symbol's range to compare
          const symText = plainText.substring(charOffsets.start, charOffsets.end).trim().toLowerCase();
          const symTextNormalized = symText.replace(/[^\w]/g, '');
          
          range = ranges.find(r => {
            // Check if ranges overlap
            const overlaps = !(charOffsets!.end <= r.start || charOffsets!.start >= r.end);
            
            // Check if they refer to the same word by comparing normalized text
            const rangeText = plainText.substring(r.start, r.end).trim().toLowerCase();
            const rangeTextNormalized = rangeText.replace(/[^\w]/g, '');
            const sameWord = symText === rangeText || 
                            (symTextNormalized.length > 0 && rangeTextNormalized.length > 0 && 
                             symTextNormalized === rangeTextNormalized);
            
            // Also check if they're very close (within 10 characters) - likely same word with different punctuation handling
            const isClose = Math.abs(charOffsets!.start - r.start) <= 10 && 
                          Math.abs(charOffsets!.end - r.end) <= 10;
            
            // Also check if the normalized word content matches (handles punctuation differences)
            const wordContentMatches = sameWord || (symTextNormalized && rangeTextNormalized && 
                              symTextNormalized === rangeTextNormalized);
            
            return overlaps || wordContentMatches || isClose;
          });
        }
        
        if (!range) {
          range = { 
            start: charOffsets.start, 
            end: charOffsets.end, 
            textAnnotations: [], 
            symbolAnnotations: [] 
          };
          ranges.push(range);
        } else {
          // Update range bounds to include both ranges
          range.start = Math.min(range.start, charOffsets.start);
          range.end = Math.max(range.end, charOffsets.end);
        }
        
        // Only add symbol if not already present (by ID or by same symbol type)
        // This prevents duplicate symbols when multiple virtual annotations or variants match the same word
        // Since we're merging overlapping ranges, if the range already has this symbol type, skip it
        const alreadyHasSymbol = range.symbolAnnotations.some(s => {
          // Same ID = same annotation
          if (s.id === sym.id) return true;
          // Same symbol type = duplicate (we only want one symbol per word)
          if (s.symbol === sym.symbol) return true;
          return false;
        });
        
        if (!alreadyHasSymbol) {
          range.symbolAnnotations.push(sym);
        }
      }
    }

    // Final deduplication: ensure each range only has one symbol of each type
    // This handles cases where multiple symbols of the same type were added before merging
    for (const range of ranges) {
      if (range.symbolAnnotations.length > 1) {
        // Group by symbol type and keep only the first of each type
        const seenSymbols = new Set<SymbolKey>();
        range.symbolAnnotations = range.symbolAnnotations.filter(sym => {
          if (seenSymbols.has(sym.symbol)) {
            return false; // Already have this symbol type
          }
          seenSymbols.add(sym.symbol);
          return true;
        });
      }
    }

    // Final merge pass: merge any remaining overlapping ranges with symbols
    // This catches cases where ranges were created separately but refer to the same word
    ranges.sort((a, b) => a.start - b.start);
    const mergedRanges: AnnotationRange[] = [];
    for (const range of ranges) {
      // Try to find an existing range that overlaps with this one
      let merged = false;
      for (const existing of mergedRanges) {
        const overlaps = !(range.end <= existing.start || range.start >= existing.end);
        
        // If both ranges have symbols and overlap, merge them (we want one symbol per word position)
        if (overlaps && range.symbolAnnotations.length > 0 && existing.symbolAnnotations.length > 0) {
          // Merge symbols - deduplicate by type
          for (const sym of range.symbolAnnotations) {
            if (!existing.symbolAnnotations.some(s => s.symbol === sym.symbol)) {
              existing.symbolAnnotations.push(sym);
            }
          }
          // Merge text annotations
          for (const ann of range.textAnnotations) {
            if (!existing.textAnnotations.some(a => a.id === ann.id)) {
              existing.textAnnotations.push(ann);
            }
          }
          // Expand bounds to include both
          existing.start = Math.min(existing.start, range.start);
          existing.end = Math.max(existing.end, range.end);
          merged = true;
          break;
        }
      }
      
      if (!merged) {
        mergedRanges.push({ ...range }); // Create a copy
      }
    }
    
    // Replace ranges with merged ranges
    ranges.length = 0;
    ranges.push(...mergedRanges);

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

    // Create segments between boundaries
    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
      const start = sortedBoundaries[i];
      const end = sortedBoundaries[i + 1];
      const text = plainText.substring(start, end);
      
      // Find which annotations apply to this segment
      const segmentAnnotations: TextAnnotation[] = [];
      const segmentSymbolsMap = new Map<SymbolKey, SymbolAnnotation>(); // Use Map to deduplicate by symbol type

      for (const range of ranges) {
        // Annotation applies if it overlaps with this segment
        // Use <= for end to include adjacent ranges (range ends exactly where segment starts)
        if (range.start < end && range.end > start) {
          segmentAnnotations.push(...range.textAnnotations);
          // Deduplicate symbols by symbol type - only keep one of each type
          for (const sym of range.symbolAnnotations) {
            if (!segmentSymbolsMap.has(sym.symbol)) {
              segmentSymbolsMap.set(sym.symbol, sym);
            }
          }
        }
      }

      segments.push({
        start,
        end,
        text,
        annotations: segmentAnnotations,
        symbols: Array.from(segmentSymbolsMap.values()),
      });
    }

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
          // Only show remove button for real annotations (non-virtual)
          const isVirtual = !symAnn.moduleId || symAnn.moduleId === '';
          const removeButton = isVirtual ? '' : `<button 
                class="annotation-remove"
                data-annotation-id="${annotationIds[0]}"
                title="Remove annotation"
                aria-label="Remove annotation"
              >×</button>`;
          
          // Split segment text into word content and trailing punctuation
          // This prevents symbols from appearing next to periods, commas, etc.
          const segmentText = segment.text;
          const trailingPunctMatch = segmentText.match(/([.,;:!?)\]}\s]*)$/);
          const trailingPunct = trailingPunctMatch ? trailingPunctMatch[1] : '';
          const wordContent = trailingPunct ? segmentText.slice(0, -trailingPunct.length) : segmentText;
          
          htmlSegments.push(`<span${styleAttr} class="${classNames}" data-annotation-ids="${annotationIds.join(',')}">
              <span class="symbol-before" style="margin-right: 0.2em; font-size: 1.1em; line-height: 1; ${symbolColor ? `color: ${symbolColor};` : 'color: currentColor;'}">${symbolText}</span>
              <span class="annotation-text"${textStyles}>${escapeHtml(wordContent)}</span>${escapeHtml(trailingPunct)}${removeButton}
            </span>`);
        } else {
          // Only text annotations
          const allStyles = ['position: relative', 'display: inline-block', ...combinedStyles];
          const styleAttr = ` style="${allStyles.join('; ')}"`;
          const classNames = `annotation-group ${annotationIds.map(id => `annotation-${id}`).join(' ')}`;
          // Only show remove button for real annotations (non-virtual)
          const firstAnn = segment.annotations[0];
          const isVirtual = firstAnn && (!firstAnn.moduleId || firstAnn.moduleId === '');
          const removeButton = isVirtual ? '' : `<button 
                class="annotation-remove"
                data-annotation-id="${annotationIds[0]}"
                title="Remove annotation"
                aria-label="Remove annotation"
              >×</button>`;
          htmlSegments.push(`<span${styleAttr} class="${classNames}" data-annotation-ids="${annotationIds.join(',')}">
            <span class="annotation-text">${escapeHtml(segment.text)}</span>
            ${removeButton}
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

  // Use verse.text as the base - it's already plain text after parsing (ESV/ASV/getBible)
  // Only use extractPlainText for APIs that return HTML/OSIS markup
  const baseContent = verse.text || '';
  
  // For ESV/ASV/getBible, verse.text is already plain text, so use it directly
  // This ensures offsets calculated during keyword matching match the rendered text
  const plainTextForOffset = baseContent;
  
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
            // Always use internal state for overlay
            setOverlayVerse(ref);
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
            setOverlayVerse(null);
          }}
          onNavigate={onNavigate}
        />
      )}
    </span>
  );
}
