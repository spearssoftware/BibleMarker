/**
 * Keyword Matching Utilities
 * 
 * Functions to find keyword matches in verse text for cross-translation highlighting.
 */

import type { MarkingPreset } from '@/types/keyWord';
import type { TextAnnotation, SymbolAnnotation, Annotation } from '@/types/annotation';
import type { VerseRef } from '@/types/bible';
import { matchesPreset } from '@/types/keyWord';

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
 * Normalize a word by removing punctuation for comparison
 */
function normalizeWord(word: string): string {
  return word.replace(/^[^\w]*|[^\w]*$/g, '').toLowerCase();
}

/**
 * Trim punctuation from the start and end of text, but keep apostrophes
 * Returns the trimmed text and the number of characters trimmed from start and end
 */
function trimPunctuation(text: string): { trimmed: string; startOffset: number; endOffset: number } {
  // Characters to trim: punctuation except apostrophes
  const punctRegex = /^[^\w']*|[^\w']*$/g;
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
  
  // Split text into words with positions
  const words = splitIntoWords(text);
  
  // Try matching phrase starting at each word position
  // For single-word phrases, check every position to find all occurrences
  // For multi-word phrases, we can optimize by skipping, but for now check all positions
  for (let i = 0; i <= words.length - phraseWords.length; i++) {
    // Extract consecutive words starting at position i
    const candidateWords = words.slice(i, i + phraseWords.length);
    const candidateText = candidateWords.map(w => normalizeForMatching(w.word)).join(' ');
    
    if (candidateText === normalizedPhrase) {
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
  
  // Filter presets that:
  // 1. Have a word defined and a highlight/symbol to apply
  // 2. Apply to this verse based on scope (global/book/chapter)
  // 3. If moduleScope is set, only apply to that specific translation (for single-instance pronouns)
  const keywordPresets = presets.filter(p => {
    if (!p.word || (!p.highlight && !p.symbol)) return false;
    if (!presetAppliesToVerse(p, verseRef)) return false;
    // If moduleScope is set, only apply to that translation (used for pronouns marked in one translation)
    if (p.moduleScope && p.moduleScope !== currentModuleId) return false;
    return true;
  });
  
  if (keywordPresets.length === 0) return annotations;
  
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
  
  // Process each phrase (already sorted longest-first)
  for (const { preset, phrase } of allPhrases) {
    const matches = findPhraseMatches(verseText, phrase);
    
    // Get or create the matched ranges set for this preset
    if (!matchedRangesByPreset.has(preset.id)) {
      matchedRangesByPreset.set(preset.id, new Set<string>());
    }
    const matchedRanges = matchedRangesByPreset.get(preset.id)!;
    
    // Debug: log if we're looking for "Jeremiah" in verse 1
    if (phrase.toLowerCase().includes('jeremiah') && verseRef.verse === 1) {
      console.log(`[KeywordMatching] Looking for "${phrase}" in verse 1:`, {
        presetId: preset.id,
        presetWord: preset.word,
        matchesFound: matches.length,
        verseText: verseText.substring(0, 100),
        matchedRanges: Array.from(matchedRanges)
      });
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
      
      // Debug: log if "Jeremiah" match is being filtered out
      if (phrase.toLowerCase().includes('jeremiah') && verseRef.verse === 1) {
        console.log(`[KeywordMatching] Match for "${phrase}" at ${match.startIndex}-${match.endIndex}:`, {
          hasOverlap,
          matchedText: match.matchedText,
          existingRanges: Array.from(matchedRanges)
        });
      }
      
      if (!hasOverlap) {
        // Mark this range as matched BEFORE creating annotations
        // This prevents shorter phrases from matching within this range (within the same preset)
        const rangeKey = `${match.startIndex}-${match.endIndex}`;
        matchedRanges.add(rangeKey);
        
        const baseId = `virtual-${preset.id}-${verseRef.book}-${verseRef.chapter}-${verseRef.verse}-${match.startIndex}`;
        
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
      }
    }
  }
  
  return annotations;
}
