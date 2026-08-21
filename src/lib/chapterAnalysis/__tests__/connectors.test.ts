import { describe, it, expect } from 'vitest'
import { findConnectors, groupConnectorsByVerse, promptFor } from '../connectors'
import type { AnalysisVerse } from '../types'

function verse(book: string, chapter: number, num: number, text: string): AnalysisVerse {
  return { ref: { book, chapter, verse: num }, text }
}

// A paraphrase of Romans 5:1-11.
const ROMANS_5: AnalysisVerse[] = [
  verse('Rom', 5, 1, 'Therefore, since we have been justified by faith, we have peace with God through our Lord Jesus Christ.'),
  verse('Rom', 5, 2, 'Through him we have also obtained access by faith into this grace in which we stand, and we rejoice in hope of the glory of God.'),
  verse('Rom', 5, 3, 'Not only that, but we also rejoice in our sufferings, because suffering produces endurance.'),
  verse('Rom', 5, 4, 'And endurance produces character, and character produces hope.'),
  verse('Rom', 5, 5, 'And hope does not put us to shame, because love has been poured into our hearts through the Holy Spirit.'),
  verse('Rom', 5, 6, 'For while we were still weak, at the right time Christ died for the ungodly.'),
  verse('Rom', 5, 7, 'For one will scarcely die for a righteous person, though perhaps for a good person one would dare even to die.'),
  verse('Rom', 5, 8, 'But God shows his love for us in that while we were still sinners, Christ died for us.'),
  verse('Rom', 5, 9, 'Since we have now been justified by his blood, much more shall we be saved by him from the wrath of God.'),
  verse('Rom', 5, 10, 'For if while we were enemies we were reconciled to God by the death of his Son, much more shall we be saved by his life.'),
  verse('Rom', 5, 11, 'So then we also rejoice in God through our Lord Jesus Christ, through whom we have now received reconciliation.'),
]

describe('findConnectors - Romans 5 fixture', () => {
  const hits = findConnectors(ROMANS_5)

  it('finds a conclusion hinge on "therefore" at v.1', () => {
    const hit = hits.find(h => h.verse === 1 && h.category === 'conclusion')
    expect(hit).toBeDefined()
    expect(hit!.phrase.toLowerCase()).toBe('therefore')
  })

  it('excludes "for us"/"for a righteous person" as mid-clause, non-clause-start cause hits', () => {
    const causeHitsInV7And8 = hits.filter(h => h.category === 'cause' && (h.verse === 7 || h.verse === 8))
    // v.7 opens with clause-start "For" (one cause hit); its mid-clause "for a
    // righteous person"/"for a good person" are excluded. v.8 opens with "But"
    // (contrast, not cause), so its "for us" occurrences are mid-clause and
    // excluded entirely - no cause hit for v.8 at all.
    expect(causeHitsInV7And8).toHaveLength(1)
    expect(causeHitsInV7And8[0].verse).toBe(7)
  })

  it('claims "so then" as a single two-word conclusion hit, not separate so/then hits', () => {
    const v11Hits = hits.filter(h => h.verse === 11)
    expect(v11Hits).toHaveLength(1)
    expect(v11Hits[0].category).toBe('conclusion')
    expect(v11Hits[0].phrase.toLowerCase()).toBe('so then')
  })

  it('groups hits by verse', () => {
    const grouped = groupConnectorsByVerse(hits)
    expect(grouped.get(1)!.length).toBeGreaterThan(0)
    expect(grouped.get(4)).toBeUndefined()
  })
})

describe('findConnectors - clause-start rule for for/so/since', () => {
  it('"For God so loved the world" yields one cause hit (verse-initial "For"), not the mid-clause "so"', () => {
    const verses = [verse('John', 3, 16, 'For God so loved the world that he gave his only Son.')]
    const hits = findConnectors(verses)
    const causeHits = hits.filter(h => h.category === 'cause')
    expect(causeHits).toHaveLength(1)
    expect(causeHits[0].phrase.toLowerCase()).toBe('for')
  })

  it('"for you" mid-clause produces no cause hit', () => {
    const verses = [verse('John', 15, 13, 'He laid down his life for you and for me.')]
    const hits = findConnectors(verses)
    expect(hits.filter(h => h.category === 'cause')).toHaveLength(0)
  })

  it('counts "since" at verse start but not mid-clause', () => {
    const verses = [verse('Test', 1, 1, 'Since the beginning, we have known him; nothing changed since the beginning.')]
    const hits = findConnectors(verses)
    const causeHits = hits.filter(h => h.category === 'cause' && h.phrase.toLowerCase() === 'since')
    expect(causeHits).toHaveLength(1)
    expect(causeHits[0].start).toBe(0)
  })

  it('counts a clause-start connector after a comma', () => {
    const verses = [verse('Test', 1, 1, 'He was tired, for the journey had been long.')]
    const hits = findConnectors(verses)
    const causeHits = hits.filter(h => h.category === 'cause')
    expect(causeHits).toHaveLength(1)
    expect(causeHits[0].phrase.toLowerCase()).toBe('for')
  })
})

describe('findConnectors - purpose phrases', () => {
  it('matches "so that" and "in order that" as single hits, not double-counted with shorter overlapping words', () => {
    const verses = [verse('Test', 1, 1, 'He explained it so that all could understand, in order that none would be confused.')]
    const hits = findConnectors(verses)
    const purposeHits = hits.filter(h => h.category === 'purpose')
    expect(purposeHits).toHaveLength(2)
    expect(purposeHits.map(h => h.phrase.toLowerCase())).toEqual(['so that', 'in order that'])
  })
})

describe('findConnectors - if/then post-filter', () => {
  it('counts both "if" and "then" when "if" precedes "then" in the same verse', () => {
    const verses = [verse('Test', 1, 1, 'If you love me, then you will keep my commandments.')]
    const hits = findConnectors(verses)
    const conditionHits = hits.filter(h => h.category === 'condition')
    expect(conditionHits).toHaveLength(2)
    expect(conditionHits.map(h => h.phrase.toLowerCase())).toEqual(['if', 'then'])
  })

  it('drops a bare "then" with no preceding "if" in the same verse', () => {
    const verses = [verse('Test', 1, 1, 'We prayed, and then we waited.')]
    const hits = findConnectors(verses)
    expect(hits.filter(h => h.category === 'condition')).toHaveLength(0)
  })
})

describe('promptFor', () => {
  it('substitutes the phrase into the category prompt template', () => {
    const hit = { phrase: 'Therefore', category: 'conclusion' as const, verse: 1, start: 0, end: 9 }
    expect(promptFor(hit)).toBe("A 'Therefore' — what is it there for?")
  })
})
