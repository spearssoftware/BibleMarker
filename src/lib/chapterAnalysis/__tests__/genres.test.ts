import { describe, it, expect } from 'vitest'
import { BIBLE_BOOKS } from '@/types/bible'
import { BOOK_GENRE, GENRE_LABEL, genreFor } from '../genres'
import type { Genre } from '../genres'

const ALL_GENRES: Genre[] = [
  'law',
  'narrative',
  'poetry',
  'wisdom',
  'prophecy',
  'gospel',
  'acts',
  'epistle',
  'apocalyptic',
]

const BANNED_PHRASES = [
  'means',
  'teaches that',
  'this shows',
  'shows that',
  'god is telling',
  'the point is',
  'reveals that',
  'proves that',
]

function assertAnswerFree(text: string, label: string) {
  const lower = text.toLowerCase()
  for (const phrase of BANNED_PHRASES) {
    expect(lower.includes(phrase), `${label} contains banned phrase "${phrase}": "${text}"`).toBe(false)
  }
}

describe('BOOK_GENRE - full canon coverage', () => {
  it('assigns a genre to every BIBLE_BOOKS id', () => {
    for (const book of BIBLE_BOOKS) {
      expect(BOOK_GENRE[book.id], `missing genre for ${book.id}`).toBeDefined()
    }
  })

  it('has no genre entries for unknown book ids', () => {
    const knownIds = new Set(BIBLE_BOOKS.map(b => b.id))
    for (const bookId of Object.keys(BOOK_GENRE)) {
      expect(knownIds.has(bookId), `BOOK_GENRE has an entry for unknown id "${bookId}"`).toBe(true)
    }
  })

  it('covers exactly the 66 books, one genre each', () => {
    expect(Object.keys(BOOK_GENRE)).toHaveLength(66)
    expect(BIBLE_BOOKS).toHaveLength(66)
  })

  it('assigns Acts its own dedicated genre', () => {
    expect(BOOK_GENRE.Acts).toBe('acts')
  })
})

describe('GENRE_LABEL - coverage', () => {
  it('has a label for every genre', () => {
    for (const genre of ALL_GENRES) {
      expect(GENRE_LABEL[genre], `missing label for ${genre}`).toBeTruthy()
    }
  })

})

describe('answer-free guard', () => {
  it('no genre label asserts an interpretation', () => {
    for (const genre of ALL_GENRES) {
      assertAnswerFree(GENRE_LABEL[genre], `${genre} label`)
    }
  })
})

describe('genre labels', () => {
  it('describes Psalms-genre books as a collection, not a single poem', () => {
    expect(GENRE_LABEL.poetry.toLowerCase()).toContain('collection')
  })

  it('avoids the jargon term "apocalypse" for Daniel/Revelation', () => {
    expect(GENRE_LABEL.apocalyptic.toLowerCase()).not.toContain('apocalypse')
  })
})

describe('genreFor', () => {
  it('returns the assigned genre for a known book', () => {
    expect(genreFor('Heb')).toBe('epistle')
    expect(genreFor('Ps')).toBe('poetry')
  })

  it('returns undefined for an unknown book id', () => {
    expect(genreFor('NotABook')).toBeUndefined()
  })
})
