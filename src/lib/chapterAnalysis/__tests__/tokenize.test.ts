import { describe, it, expect } from 'vitest'
import { tokenizeVerse, singularize } from '../tokenize'
import { splitIntoWords } from '@/lib/keywordMatching'

describe('singularize', () => {
  it('strips a bare trailing s (words -> word)', () => {
    expect(singularize('words')).toBe('word')
  })

  it('turns ies into y (cities -> city)', () => {
    expect(singularize('cities')).toBe('city')
  })

  it('strips a straight possessive (god\'s -> god)', () => {
    expect(singularize("god's")).toBe('god')
  })

  it('strips a curly possessive (god’s -> god)', () => {
    expect(singularize('god’s')).toBe('god')
  })

  it('leaves Jesus unchanged (guarded by the -us exception)', () => {
    expect(singularize('jesus')).toBe('jesus')
  })

  it('keeps word/words together', () => {
    expect(singularize('word')).toBe('word')
    expect(singularize('words')).toBe('word')
  })

  it('keeps light/lights together', () => {
    expect(singularize('light')).toBe('light')
    expect(singularize('lights')).toBe('light')
  })

  it('does not strip a short word ending in s', () => {
    // length must be > 4 for the bare-s rule to apply
    expect(singularize('this')).toBe('this')
  })

  it('does not strip ss/us/is endings', () => {
    expect(singularize('class')).toBe('class')
    expect(singularize('basis')).toBe('basis')
  })

  it('reduces "es" after ch (churches -> church)', () => {
    expect(singularize('churches')).toBe('church')
  })

  it('strips only the trailing s for a bare ses ending (houses -> house)', () => {
    expect(singularize('houses')).toBe('house')
  })

  it('strips only the trailing s for a bare ses ending (verses -> verse)', () => {
    expect(singularize('verses')).toBe('verse')
  })

  it('strips "es" after x (boxes -> box)', () => {
    expect(singularize('boxes')).toBe('box')
  })

  it('strips only the trailing s for a bare ses ending (promises -> promise)', () => {
    expect(singularize('promises')).toBe('promise')
  })

  it('singularizes a 4-letter plural (sons -> son)', () => {
    expect(singularize('sons')).toBe('son')
  })

  it('singularizes a 4-letter plural (gods -> god)', () => {
    expect(singularize('gods')).toBe('god')
  })

  it('singularizes a 4-letter plural (days -> day)', () => {
    expect(singularize('days')).toBe('day')
  })

  it('leaves "thus" unchanged (guarded by the -us exception)', () => {
    expect(singularize('thus')).toBe('thus')
  })

  it('leaves "his" unchanged (too short for the bare-s rule)', () => {
    expect(singularize('his')).toBe('his')
  })

  it('leaves words ending in "ves" unchanged (wives, knives, lives)', () => {
    expect(singularize('wives')).toBe('wives')
    expect(singularize('knives')).toBe('knives')
    expect(singularize('lives')).toBe('lives')
  })
})

describe('tokenizeVerse', () => {
  it('splits and normalizes verse text into tokens', () => {
    const tokens = tokenizeVerse('In the beginning was the Word.')
    expect(tokens.map(t => t.normalized)).toEqual(['in', 'the', 'beginning', 'was', 'the', 'word'])
  })

  it('drops tokens with no letters', () => {
    const tokens = tokenizeVerse('In 2024, 100% arrived.')
    expect(tokens.map(t => t.normalized)).toEqual(['in', 'arrived'])
  })

  it('offsets line up with splitIntoWords for text with a curly apostrophe and an em dash', () => {
    const text = 'This is the LORD’s doing—it is marvelous.'
    const words = splitIntoWords(text)
    const tokens = tokenizeVerse(text)

    // Same count and same offsets (tokenizeVerse keeps the word-boundary
    // offsets from splitIntoWords; it only normalizes the text).
    expect(tokens).toHaveLength(words.length)
    tokens.forEach((token, i) => {
      expect(token.startIndex).toBe(words[i].startIndex)
      expect(token.endIndex).toBe(words[i].endIndex)
    })

    const lordToken = tokens.find(t => t.normalized.startsWith('lord'))!
    expect(text.substring(lordToken.startIndex, lordToken.endIndex)).toBe('LORD’s')
  })
})
