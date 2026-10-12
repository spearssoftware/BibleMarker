import { describe, it, expect } from 'vitest'
import { BIBLE_BOOKS } from '@/types/bible'
import { BOOK_INTRO, introFor } from '../bookIntros'

function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?]["'”’]?)\s+/).filter(s => s.trim().length > 0).length
}

describe('BOOK_INTRO - full canon coverage', () => {
  it('has an intro for every BIBLE_BOOKS id', () => {
    for (const book of BIBLE_BOOKS) {
      expect(BOOK_INTRO[book.id], `missing intro for ${book.id}`).toBeTruthy()
    }
  })

  it('has no intro entries for unknown book ids', () => {
    const knownIds = new Set(BIBLE_BOOKS.map(b => b.id))
    for (const bookId of Object.keys(BOOK_INTRO)) {
      expect(knownIds.has(bookId), `BOOK_INTRO has an entry for unknown id "${bookId}"`).toBe(true)
    }
  })

  it('covers exactly the 66 books, one intro each', () => {
    expect(Object.keys(BOOK_INTRO)).toHaveLength(66)
    expect(BIBLE_BOOKS).toHaveLength(66)
  })

  it('keeps every intro to one to three sentences', () => {
    for (const [bookId, text] of Object.entries(BOOK_INTRO)) {
      const count = sentenceCount(text)
      expect(count, `${bookId} has ${count} sentences: "${text}"`).toBeGreaterThanOrEqual(1)
      expect(count, `${bookId} has ${count} sentences: "${text}"`).toBeLessThanOrEqual(3)
    }
  })
})

describe('introFor', () => {
  it('returns the intro for a known book', () => {
    expect(introFor('Gen')).toBe(BOOK_INTRO.Gen)
  })

  it('returns undefined for an unknown book', () => {
    expect(introFor('Nope')).toBeUndefined()
  })
})
