import { describe, it, expect } from 'vitest'
import { splitIntoWords, findKeywordMatches } from './keywordMatching'
import type { MarkingPreset } from '@/types'
import type { VerseRef } from '@/types'

describe('splitIntoWords', () => {
  it('returns empty array for empty string', () => {
    expect(splitIntoWords('')).toEqual([])
  })

  it('returns single word with correct indices', () => {
    expect(splitIntoWords('hello')).toEqual([
      { word: 'hello', startIndex: 0, endIndex: 5 },
    ])
  })

  it('splits multiple words and records positions', () => {
    const result = splitIntoWords('hello world')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ word: 'hello', startIndex: 0, endIndex: 5 })
    expect(result[1]).toEqual({ word: 'world', startIndex: 6, endIndex: 11 })
  })

  it('handles punctuation and spaces', () => {
    const result = splitIntoWords('hello,  world.')
    expect(result).toHaveLength(2)
    expect(result[0].word).toBe('hello,')
    expect(result[1].word).toBe('world.')
  })

  it('splits on em dashes', () => {
    const result = splitIntoWords('remnant\u2014because')
    expect(result).toHaveLength(2)
    expect(result[0].word).toBe('remnant')
    expect(result[1].word).toBe('because')
  })

  it('splits on en dashes', () => {
    const result = splitIntoWords('faith\u2013hope')
    expect(result).toHaveLength(2)
    expect(result[0].word).toBe('faith')
    expect(result[1].word).toBe('hope')
  })
})

describe('findKeywordMatches', () => {
  const verseRef: VerseRef = { book: 'Gen', chapter: 1, verse: 1 }

  function preset(overrides: Partial<MarkingPreset> & { id: string; word: string }): MarkingPreset {
    return {
      highlight: { style: 'highlight', color: 'red' },
      variants: [],
      autoSuggest: false,
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }
  }

  it('returns empty array for empty verse text', () => {
    const presets = [preset({ id: 'p1', word: 'faith' })]
    expect(findKeywordMatches('', verseRef, presets)).toEqual([])
  })

  it('returns empty array for empty presets', () => {
    expect(findKeywordMatches('In the beginning God created', verseRef, [])).toEqual([])
  })

  it('returns one annotation when preset word appears in verse', () => {
    const presets = [preset({ id: 'p1', word: 'God' })]
    const result = findKeywordMatches('In the beginning God created', verseRef, presets)
    expect(result.length).toBeGreaterThanOrEqual(1)
    const ann = result[0]
    expect(ann.presetId).toBe('p1')
    if ('startOffset' in ann && 'endOffset' in ann) {
      const text = 'In the beginning God created'
      const matched = text.substring(ann.startOffset!, ann.endOffset!)
      expect(matched).toBe('God')
    }
  })

  it('returns empty when preset is book-scoped to a different book', () => {
    const presets = [
      preset({ id: 'p1', word: 'Moses', bookScope: 'Exod' }),
    ]
    const result = findKeywordMatches('In the beginning God created', verseRef, presets)
    expect(result).toEqual([])
  })

  it('returns match when preset is book-scoped to same book', () => {
    const presets = [
      preset({ id: 'p1', word: 'beginning', bookScope: 'Gen' }),
    ]
    const result = findKeywordMatches('In the beginning God created', verseRef, presets)
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].presetId).toBe('p1')
  })

  it('matches phrase with commas when verse has same words with punctuation', () => {
    const presets = [preset({ id: 'p1', word: 'faith, hope, love' })]
    const result = findKeywordMatches('Now faith, hope, love remain', verseRef, presets)
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].presetId).toBe('p1')
  })

  it('matches keyword adjacent to em dash', () => {
    const presets = [preset({ id: 'p1', word: 'remnant' })]
    const result = findKeywordMatches('this remnant\u2014because we are left', verseRef, presets)
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].presetId).toBe('p1')
  })

  // --- Chapter-scoped presets ---
  it('returns match only for matching chapter', () => {
    const presets = [
      preset({ id: 'p1', word: 'God', bookScope: 'Gen', chapterScope: 1 }),
    ]
    const ch1 = findKeywordMatches('God is good', verseRef, presets)
    expect(ch1.length).toBeGreaterThanOrEqual(1)

    const ch2Ref: VerseRef = { book: 'Gen', chapter: 2, verse: 1 }
    const ch2 = findKeywordMatches('God is good', ch2Ref, presets)
    expect(ch2).toEqual([])
  })

  // --- Module-scoped presets ---
  it('skips preset when moduleScope does not match currentModuleId', () => {
    const presets = [
      preset({ id: 'p1', word: 'God', moduleScope: 'eng-ESV' }),
    ]
    const result = findKeywordMatches('God is good', verseRef, presets, 'eng-NIV')
    expect(result).toEqual([])
  })

  it('matches when moduleScope matches currentModuleId', () => {
    const presets = [
      preset({ id: 'p1', word: 'God', moduleScope: 'eng-ESV' }),
    ]
    const result = findKeywordMatches('God is good', verseRef, presets, 'eng-ESV')
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  // --- Symbol annotations ---
  it('creates SymbolAnnotation for preset with symbol only (no highlight)', () => {
    const presets = [
      preset({ id: 'p1', word: 'God', highlight: undefined, symbol: 'triangle' }),
    ]
    const result = findKeywordMatches('God is good', verseRef, presets)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('symbol')
  })

  // --- Both symbol + highlight ---
  it('creates two annotations per match when preset has both', () => {
    const presets = [
      preset({ id: 'p1', word: 'God', symbol: 'triangle' }),
    ]
    const result = findKeywordMatches('God is good', verseRef, presets)
    expect(result).toHaveLength(2)
    const types = result.map(a => a.type)
    expect(types).toContain('highlight')
    expect(types).toContain('symbol')
  })

  // --- Variant matching ---
  it('matches variant text', () => {
    const presets = [
      preset({ id: 'p1', word: 'God', variants: [{ text: 'LORD' }] }),
    ]
    const result = findKeywordMatches('The LORD is good', verseRef, presets)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  // --- Scoped variants ---
  it('applies scoped variant only to matching book', () => {
    const presets = [
      preset({
        id: 'p1',
        word: 'God',
        variants: [{ text: 'Elohim', bookScope: 'Gen' }],
      }),
    ]
    const genResult = findKeywordMatches('Elohim created', verseRef, presets)
    expect(genResult.length).toBeGreaterThanOrEqual(1)

    const exodRef: VerseRef = { book: 'Exod', chapter: 1, verse: 1 }
    const exodResult = findKeywordMatches('Elohim appeared', exodRef, presets)
    // Should still match "God" if present, but not "Elohim" in Exodus
    expect(exodResult).toEqual([])
  })

  // --- Overlapping presets ---
  it('allows two different presets to match the same text range', () => {
    const presets = [
      preset({ id: 'p1', word: 'God' }),
      preset({ id: 'p2', word: 'God', highlight: { style: 'underline', color: 'blue' } }),
    ]
    const result = findKeywordMatches('God is good', verseRef, presets)
    // Each preset should produce at least one annotation for "God"
    const p1Anns = result.filter(a => a.presetId === 'p1')
    const p2Anns = result.filter(a => a.presetId === 'p2')
    expect(p1Anns.length).toBeGreaterThanOrEqual(1)
    expect(p2Anns.length).toBeGreaterThanOrEqual(1)
  })

  // --- Same-preset overlap prevention ---
  it('longer phrase match prevents shorter variant from matching same range', () => {
    const presets = [
      preset({
        id: 'p1',
        word: 'God Almighty',
        variants: [{ text: 'God' }],
      }),
    ]
    const result = findKeywordMatches('God Almighty is great', verseRef, presets)
    // Should match "God Almighty" but not also "God" separately within the same preset
    expect(result).toHaveLength(1)
    if ('startOffset' in result[0] && 'endOffset' in result[0]) {
      const matched = 'God Almighty is great'.substring(result[0].startOffset!, result[0].endOffset!)
      expect(matched).toBe('God Almighty')
    }
  })

  // --- Multiple occurrences ---
  it('word appearing twice produces two annotations', () => {
    const presets = [preset({ id: 'p1', word: 'God' })]
    const result = findKeywordMatches('God made God known', verseRef, presets)
    expect(result).toHaveLength(2)
  })

  // --- Case insensitivity ---
  it('"God" preset matches "god" in text', () => {
    const presets = [preset({ id: 'p1', word: 'God' })]
    const result = findKeywordMatches('In the beginning god created', verseRef, presets)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })
})
