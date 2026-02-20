/**
 * Keyword Matching Utilities
 * 
 * Functions to find keyword matches in verse text for cross-translation highlighting.
 */

import type { MarkingPreset } from '@/types';
import type { TextAnnotation, SymbolAnnotation } from '@/types';
import type { VerseRef } from '@/types';
import { getDebugFlagsSync } from '@/lib/debug';

/**
 * Split text into words with their positions
 */
export function splitIntoWords(text: string): Array<{ word: string; startIndex: number; endIndex: number }> {
  const words: Array<{ word: string; startIndex: number; endIndex: number }> = [];
  const wordRegex = /\S+/g;
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

/**
 * Trim punctuation from the start and end of text, but keep apostrophes
 * Returns the trimmed text and the number of characters trimmed from start and end
 */
function trimPunctuation(text: string): { trimmed: string; startOffset: number; endOffset: number } {
  // Characters to trim: punctuation except apostrophes
  const startMatch = text.match(/^[^\w']*/);
  const endMatch = text.match(/[^\w']*$/);
  
  const startOffset = startMatch ? startMatch[0].length : 0;
  const endOffset = endMatch ? endMatch[0].length : 0;
  
  return {
    trimmed: text.substring(startOffset, text.length - endOffset),
    startOffset,
    endOffset
  };
}

/**
 * Check if a variant applies to the given verse based on its scope
 * - Global (no bookScope): applies everywhere
 * - Book-scoped (bookScope set, no chapterScope): applies to that book
 * - Chapter-scoped (bookScope and chapterScope set): applies to that specific chapter
 */
function variantAppliesToVerse(variant: { text: string; bookScope?: string; chapterScope?: number }, verseRef: VerseRef): boolean {
  // Global variant (no scope) - applies everywhere
  if (!variant.bookScope) return true;
  
  // Book-scoped - check if book matches
  if (variant.bookScope !== verseRef.book) return false;
  
  // If chapter-scoped, check chapter matches
  if (variant.chapterScope !== undefined) {
    return variant.chapterScope === verseRef.chapter;
  }
  
  // Book-scoped but not chapter-scoped - applies to all chapters in that book
  return true;
}

/**
 * Get all matchable phrases from a preset (word + variants that apply to the verse)
 * Returns phrases sorted by length (longest first) to match longer phrases before shorter ones
 */
function getMatchablePhrases(preset: MarkingPreset, verseRef: VerseRef): Array<{ text: string; preset: MarkingPreset }> {
  if (!preset.word) return [];
  const phrases: Array<{ text: string; preset: MarkingPreset }> = [{ text: preset.word, preset }];
  
  // Add variants that apply to this verse
  for (const variant of preset.variants || []) {
    const variantText = typeof variant === 'string' ? variant : variant.text;
    // Check if variant applies to this verse (if it's a Variant object with scope)
    if (typeof variant === 'object' && !variantAppliesToVerse(variant, verseRef)) {
      continue; // Skip this variant - it doesn't apply to this verse
    }
    phrases.push({ text: variantText, preset });
  }
  
  // Sort by length (longest first), then alphabetically for consistency
  return phrases.sort((a, b) => {
    if (b.text.length !== a.text.length) return b.text.length - a.text.length; // Longer first
    return a.text.toLowerCase().localeCompare(b.text.toLowerCase());
  });
}

/**
 * Normalize text for matching (remove punctuation from boundaries, lowercase)
 */
function normalizeForMatching(text: string): string {
  return text.replace(/^[^\w]*|[^\w]*$/g, '').toLowerCase().trim();
}

/**
 * Find all occurrences of a phrase in text, returning start and end positions
 * Handles multi-word phrases by matching normalized versions
 * Trims punctuation (except apostrophes) from the match boundaries
 */
function findPhraseMatches(text: string, phrase: string): Array<{ startIndex: number; endIndex: number; matchedText: string }> {
  const matches: Array<{ startIndex: number; endIndex: number; matchedText: string }> = [];
  const normalizedPhrase = normalizeForMatching(phrase);
  const phraseWords = normalizedPhrase.split(/\s+/).filter(w => w.length > 0);
  
  if (phraseWords.length === 0) return matches;
  
  // Normalize each phrase word separately (strips punctuation like commas from each token)
  // so "word1, word2, word3" matches verse text "word1, word2, word3" where each word has punctuation
  const normalizedPhraseForMatch = phraseWords.map(w => normalizeForMatching(w)).join(' ');
  
  // Split text into words with positions
  const words = splitIntoWords(text);
  
  // Try matching phrase starting at each word position
  // For single-word phrases, check every position to find all occurrences
  // For multi-word phrases, we can optimize by skipping, but for now check all positions
  for (let i = 0; i <= words.length - phraseWords.length; i++) {
    // Extract consecutive words starting at position i
    const candidateWords = words.slice(i, i + phraseWords.length);
    const candidateText = candidateWords.map(w => normalizeForMatching(w.word)).join(' ');
    
    if (candidateText === normalizedPhraseForMatch) {
      // Found a match! Get the actual start and end positions from original text
      const startWord = candidateWords[0];
      const endWord = candidateWords[candidateWords.length - 1];
      
      // Get the full matched text including punctuation
      const fullMatchedText = text.substring(startWord.startIndex, endWord.endIndex);
      
      // Trim punctuation (except apostrophes) to get the actual text to highlight
      const trimmed = trimPunctuation(fullMatchedText);
      
      // Calculate adjusted positions (excluding leading/trailing punctuation)
      const adjustedStartIndex = startWord.startIndex + trimmed.startOffset;
      const adjustedEndIndex = endWord.endIndex - trimmed.endOffset;
      
      // Only add if we have valid positions and the trimmed text matches
      if (adjustedStartIndex >= 0 && adjustedEndIndex > adjustedStartIndex && trimmed.trimmed.length > 0) {
        matches.push({
          startIndex: adjustedStartIndex,
          endIndex: adjustedEndIndex,
          matchedText: trimmed.trimmed
        });
      }
      
      // For multi-word phrases, skip ahead to avoid re-matching the same phrase
      // For single words, continue checking every position (don't skip)
      if (phraseWords.length > 1) {
        i += phraseWords.length - 1;
      }
      // For single words, the loop will naturally increment i to check the next position
    }
  }
  
  return matches;
}

/**
 * Check if a preset applies to the given verse based on scope
 * - Global (no bookScope): applies everywhere
 * - Book-scoped (bookScope set, no chapterScope): applies to that book
 * - Chapter-scoped (bookScope and chapterScope set): applies to that specific chapter
 */
function presetAppliesToVerse(preset: MarkingPreset, verseRef: VerseRef): boolean {
  // Global preset (no bookScope) - applies everywhere
  if (!preset.bookScope) return true;
  
  // Book-scoped - check if book matches
  if (preset.bookScope !== verseRef.book) return false;
  
  // If chapter-scoped, check chapter matches
  if (preset.chapterScope !== undefined) {
    return preset.chapterScope === verseRef.chapter;
  }
  
  // Book-scoped but not chapter-scoped - applies to all chapters in that book
  return true;
}

/**
 * Find all keyword matches in verse text and create virtual annotations
 * These are not persisted - they're computed on-the-fly for visual highlighting
 */
export function findKeywordMatches(
  verseText: string,
  verseRef: VerseRef,
  presets: MarkingPreset[],
  currentModuleId?: string
): Array<TextAnnotation | SymbolAnnotation> {
  const annotations: Array<TextAnnotation | SymbolAnnotation> = [];
  
  if (!verseText || presets.length === 0) return annotations;
  
  // Get debug flags once for this function call
  const debugFlags = getDebugFlagsSync();
  
  // Debug: ESV-specific debugging for Jeremiah 29
  const isESVDebug = debugFlags.keywordMatching && verseRef.book === 'Jer' && verseRef.chapter === 29;
  
  // Filter presets that:
  // 1. Have a word defined and a highlight/symbol to apply
  // 2. Apply to this verse based on scope (global/book/chapter)
  // 3. If moduleScope is set, only apply to that specific translation (for single-instance pronouns)
  const keywordPresets = presets.filter(p => {
    if (!p.word || (!p.highlight && !p.symbol)) {
      if (isESVDebug && (p.word?.toLowerCase().includes('jeremiah') || p.word?.toLowerCase().includes('lord') || p.word === 'LORD')) {
        console.log(`[KeywordMatching] Filtered out preset "${p.word}" - missing highlight/symbol:`, {
          word: p.word,
          hasHighlight: !!p.highlight,
          hasSymbol: !!p.symbol
        });
      }
      return false;
    }
    if (!presetAppliesToVerse(p, verseRef)) {
      if (isESVDebug && (p.word?.toLowerCase().includes('jeremiah') || p.word?.toLowerCase().includes('lord') || p.word === 'LORD')) {
        console.log(`[KeywordMatching] Filtered out preset "${p.word}" - doesn't apply to verse:`, {
          word: p.word,
          bookScope: p.bookScope,
          chapterScope: p.chapterScope,
          verseRef
        });
      }
      return false;
    }
    // If moduleScope is set, only apply to that translation (used for pronouns marked in one translation)
    if (p.moduleScope && p.moduleScope !== currentModuleId) {
      if (isESVDebug && (p.word?.toLowerCase().includes('jeremiah') || p.word?.toLowerCase().includes('lord') || p.word === 'LORD')) {
        console.log(`[KeywordMatching] Filtered out preset "${p.word}" - moduleScope mismatch:`, {
          word: p.word,
          moduleScope: p.moduleScope,
          currentModuleId
        });
      }
      return false;
    }
    return true;
  });
  
  if (keywordPresets.length === 0) {
    if (isESVDebug) {
      console.log(`[KeywordMatching] No keyword presets found for verse ${verseRef.verse}`, {
        totalPresets: presets.length,
        presetsWithJeremiah: presets.filter(p => p.word?.toLowerCase().includes('jeremiah')),
        presetsWithLORD: presets.filter(p => p.word?.toLowerCase().includes('lord') || p.word === 'LORD')
      });
    }
    return annotations;
  }
  
  // Track which character ranges have been matched per preset to avoid overlapping matches
  // This prevents duplicates within the same preset, but allows different presets to match overlapping text
  const matchedRangesByPreset = new Map<string, Set<string>>();
  
  // Collect all phrases with their presets, sorted by length (longest first)
  // For presets with moduleScope, we need to pass the currentModuleId to getMatchablePhrases
  // so it can filter variants appropriately
  interface PhraseMatch {
    preset: MarkingPreset;
    phrase: string;
    normalizedLength: number; // Word count for better sorting
  }
  
  const allPhrases: PhraseMatch[] = [];
  for (const preset of keywordPresets) {
    const phrases = getMatchablePhrases(preset, verseRef);
    for (const { text: phrase } of phrases) {
      // Count words in normalized phrase for better sorting
      const normalizedPhrase = normalizeForMatching(phrase);
      const wordCount = normalizedPhrase.split(/\s+/).filter(w => w.length > 0).length;
      allPhrases.push({ preset, phrase, normalizedLength: wordCount });
    }
  }
  
  // Sort by word count (longest first), then by character length, to match longer phrases before shorter ones
  allPhrases.sort((a, b) => {
    if (b.normalizedLength !== a.normalizedLength) {
      return b.normalizedLength - a.normalizedLength; // More words first
    }
    return b.phrase.length - a.phrase.length; // Then longer character length
  });
  
  if (isESVDebug) {
    console.log(`%c[KeywordMatching] ESV Debug - Verse ${verseRef.verse}`, 'color: blue; font-weight: bold; font-size: 14px;');
    console.log({
      verseText: verseText.substring(0, 300),
      verseTextLength: verseText.length,
      keywordPresetsCount: keywordPresets.length,
      allPhrasesCount: allPhrases.length,
      currentModuleId,
      keywordPresets: keywordPresets.map(p => ({
        id: p.id,
        word: p.word,
        moduleScope: p.moduleScope,
        bookScope: p.bookScope,
        chapterScope: p.chapterScope
      }))
    });
  }
  
  // Process each phrase (already sorted longest-first)
  for (const { preset, phrase } of allPhrases) {
    const matches = findPhraseMatches(verseText, phrase);
    
    // Get or create the matched ranges set for this preset
    if (!matchedRangesByPreset.has(preset.id)) {
      matchedRangesByPreset.set(preset.id, new Set<string>());
    }
    const matchedRanges = matchedRangesByPreset.get(preset.id)!;
    
    // Debug: ESV-specific or general debugging
    const isJeremiahVerse1 = debugFlags.keywordMatching && phrase.toLowerCase().includes('jeremiah') && verseRef.verse === 1;
    const isLORDVerse15 = debugFlags.keywordMatching && (phrase.toLowerCase().includes('lord') || phrase === 'LORD') && verseRef.verse === 15;
    if (isESVDebug || isJeremiahVerse1 || isLORDVerse15) {
      const isRelevant = isESVDebug || phrase.toLowerCase().includes('jeremiah') || phrase.toLowerCase().includes('lord') || phrase === 'LORD';
      if (isRelevant) {
        // Check if phrase should have matched but didn't
        const normalizedPhrase = normalizeForMatching(phrase);
        const phraseInText = verseText.toLowerCase().includes(normalizedPhrase);
        
        console.log(`[KeywordMatching] Looking for "${phrase}" in verse ${verseRef.verse}:`, {
          presetId: preset.id,
          presetWord: preset.word,
          presetSymbol: preset.symbol,
          presetHighlight: preset.highlight,
          moduleScope: preset.moduleScope,
          matchesFound: matches.length,
          normalizedPhrase,
          phraseInText,
          matches: matches.map(m => ({ 
            start: m.startIndex, 
            end: m.endIndex, 
            text: m.matchedText,
            matchedTextInVerse: verseText.substring(m.startIndex, m.endIndex)
          })),
          verseTextSample: verseText.substring(0, 200),
          fullVerseText: verseText,
          matchedRanges: Array.from(matchedRanges),
          currentModuleId
        });
        
        // If no matches found but phrase should be in text, log detailed analysis
        if (matches.length === 0 && phraseInText) {
          console.warn(`[KeywordMatching] WARNING: "${phrase}" appears in verse text but no matches found!`, {
            phrase,
            normalizedPhrase,
            verseText,
            wordsInVerse: splitIntoWords(verseText).map(w => ({ word: w.word, normalized: normalizeForMatching(w.word) }))
          });
        }
      }
    }
    
    for (const match of matches) {
      // Check if this range overlaps with any already matched range FROM THE SAME PRESET
      // This prevents duplicates within a preset, but allows different presets to match overlapping text
      const hasOverlap = Array.from(matchedRanges).some(range => {
        const [start, end] = range.split('-').map(Number);
        // Overlap if: match starts before existing ends AND match ends after existing starts
        // This catches partial overlaps, complete overlaps, and containment
        // But allow adjacent matches (match.startIndex === end) - they don't overlap
        return match.startIndex < end && match.endIndex > start;
      });
      
      // Debug: log if "Jeremiah" (verse 1) or "LORD" (verse 15) match is being filtered out
      const isJeremiahVerse1Debug = debugFlags.keywordMatching && phrase.toLowerCase().includes('jeremiah') && verseRef.verse === 1;
      const isLORDVerse15Debug = debugFlags.keywordMatching && (phrase.toLowerCase().includes('lord') || phrase === 'LORD') && verseRef.verse === 15;
      if (isESVDebug || isJeremiahVerse1Debug || isLORDVerse15Debug) {
        const overlappingRanges = Array.from(matchedRanges).filter(range => {
          const [start, end] = range.split('-').map(Number);
          return match.startIndex < end && match.endIndex > start;
        });
        console.log(`[KeywordMatching] Match for "${phrase}" at ${match.startIndex}-${match.endIndex}:`, {
          hasOverlap,
          matchedText: match.matchedText,
          actualTextInVerse: verseText.substring(match.startIndex, match.endIndex),
          existingRanges: Array.from(matchedRanges),
          overlappingRanges,
          willBeAdded: !hasOverlap,
          presetId: preset.id
        });
      }
      
      if (!hasOverlap) {
        // Mark this range as matched BEFORE creating annotations
        // This prevents shorter phrases from matching within this range (within the same preset)
        const rangeKey = `${match.startIndex}-${match.endIndex}`;
        matchedRanges.add(rangeKey);
        
        const baseId = `virtual-${preset.id}-${verseRef.book}-${verseRef.chapter}-${verseRef.verse}-${match.startIndex}`;
        
        // Debug: Log when creating annotations for ESV
        if (isESVDebug) {
          console.log(`[KeywordMatching] Creating annotation for "${phrase}" at ${match.startIndex}-${match.endIndex}:`, {
            matchedText: match.matchedText,
            actualTextInVerse: verseText.substring(match.startIndex, match.endIndex),
            presetId: preset.id,
            hasHighlight: !!preset.highlight,
            hasSymbol: !!preset.symbol
          });
        }
        
        // Create highlight annotation if preset has highlight
        if (preset.highlight) {
          const highlightAnn: TextAnnotation = {
            id: `${baseId}-highlight`,
            moduleId: '', // Virtual annotations don't have a moduleId
            type: preset.highlight.style === 'textColor' ? 'textColor' : 
                  preset.highlight.style === 'underline' ? 'underline' : 'highlight',
            startRef: verseRef,
            endRef: verseRef,
            startWordIndex: undefined,
            endWordIndex: undefined,
            startOffset: match.startIndex,
            endOffset: match.endIndex,
            selectedText: match.matchedText,
            color: preset.highlight.color,
            createdAt: new Date(),
            updatedAt: new Date(),
            presetId: preset.id,
          };
          annotations.push(highlightAnn);
        }
        
        // Create symbol annotation if preset has symbol
        if (preset.symbol) {
          const symbolAnn: SymbolAnnotation = {
            id: `${baseId}-symbol`,
            moduleId: '', // Virtual annotations don't have a moduleId
            type: 'symbol',
            ref: verseRef,
            wordIndex: undefined,
            position: 'before', // Inline before the word
            selectedText: match.matchedText,
            startWordIndex: undefined,
            endWordIndex: undefined,
            startOffset: match.startIndex,
            endOffset: match.endIndex,
            symbol: preset.symbol,
            color: preset.highlight?.color, // Use highlight color if available
            createdAt: new Date(),
            updatedAt: new Date(),
            presetId: preset.id,
          };
          annotations.push(symbolAnn);
        }
      } else {
        // Debug: log when matches are skipped due to overlap
        const isJeremiahVerse1Debug = debugFlags.keywordMatching && phrase.toLowerCase().includes('jeremiah') && verseRef.verse === 1;
        const isLORDVerse15Debug = debugFlags.keywordMatching && (phrase.toLowerCase().includes('lord') || phrase === 'LORD') && verseRef.verse === 15;
        if (isESVDebug || isJeremiahVerse1Debug || isLORDVerse15Debug) {
          const overlappingRanges = Array.from(matchedRanges).filter(range => {
            const [start, end] = range.split('-').map(Number);
            return match.startIndex < end && match.endIndex > start;
          });
          console.log(`[KeywordMatching] Skipping "${phrase}" match at ${match.startIndex}-${match.endIndex} due to overlap:`, {
            matchedText: match.matchedText,
            actualTextInVerse: verseText.substring(match.startIndex, match.endIndex),
            overlappingRanges,
            presetId: preset.id
          });
        }
      }
    }
  }
  
  if (isESVDebug) {
    console.log(`[KeywordMatching] ESV Debug - Verse ${verseRef.verse} final annotations:`, {
      totalAnnotations: annotations.length,
      annotations: annotations.map(a => ({
        id: a.id,
        type: a.type,
        startOffset: 'startOffset' in a ? a.startOffset : undefined,
        endOffset: 'endOffset' in a ? a.endOffset : undefined,
        presetId: 'presetId' in a ? a.presetId : undefined
      }))
    });
  }
  
  return annotations;
}
