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
})
