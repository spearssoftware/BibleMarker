import { describe, it, expect } from 'vitest'
import { BIBLE_BOOKS } from '@/types/bible'
import { BOOK_GENRE, GENRE_ORIENTATION, GENRE_QUESTIONS, genreFor, orientationFor, questionFor } from '../genres'
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

const BANNED_PHRASES = ['means', 'teaches that', 'this shows', 'god is telling', 'the point is']

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

describe('GENRE_ORIENTATION and GENRE_QUESTIONS - coverage', () => {
  it('has an orientation for every genre', () => {
    for (const genre of ALL_GENRES) {
      expect(GENRE_ORIENTATION[genre], `missing orientation for ${genre}`).toBeTruthy()
    }
  })

  it('has at least 4 questions for every genre', () => {
    for (const genre of ALL_GENRES) {
      expect(GENRE_QUESTIONS[genre].length, `${genre} has too few questions`).toBeGreaterThanOrEqual(4)
    }
  })

  it('gives poetry 6 questions for per-chapter variety', () => {
    expect(GENRE_QUESTIONS.poetry.length).toBe(6)
  })
})

describe('answer-free guard', () => {
  it('no orientation asserts an interpretation', () => {
    for (const genre of ALL_GENRES) {
      assertAnswerFree(GENRE_ORIENTATION[genre], `${genre} orientation`)
    }
  })

  it('no question asserts an interpretation', () => {
    for (const genre of ALL_GENRES) {
      GENRE_QUESTIONS[genre].forEach((question, i) => {
        assertAnswerFree(question, `${genre} question[${i}]`)
      })
    }
  })
})

describe('genreFor / orientationFor', () => {
  it('returns the assigned genre for a known book', () => {
    expect(genreFor('Heb')).toBe('epistle')
    expect(genreFor('Ps')).toBe('poetry')
  })

  it('returns undefined for an unknown book id', () => {
    expect(genreFor('NotABook')).toBeUndefined()
  })

  it('returns the matching orientation line for a known book', () => {
    expect(orientationFor('Heb')).toBe(GENRE_ORIENTATION.epistle)
  })

  it('returns undefined orientation for an unknown book id', () => {
    expect(orientationFor('NotABook')).toBeUndefined()
  })
})

describe('questionFor - determinism and range', () => {
  it('is deterministic across repeated calls for the same book/chapter', () => {
    expect(questionFor('Heb', 1)).toBe(questionFor('Heb', 1))
    expect(questionFor('Ps', 23)).toBe(questionFor('Ps', 23))
  })

  it('picks (chapter - 1) % questions.length', () => {
    const questions = GENRE_QUESTIONS.epistle
    expect(questionFor('Heb', 1)).toBe(questions[0])
    expect(questionFor('Heb', 2)).toBe(questions[1 % questions.length])
    expect(questionFor('Heb', questions.length + 1)).toBe(questions[0])
  })

  it('always returns a question from that genre\'s list, for every chapter of every book', () => {
    for (const book of BIBLE_BOOKS) {
      const genre = BOOK_GENRE[book.id]
      const questions = GENRE_QUESTIONS[genre]
      for (let chapter = 1; chapter <= book.chapters; chapter++) {
        const question = questionFor(book.id, chapter)
        expect(questions).toContain(question)
      }
    }
  })

  it('returns undefined for an unknown book id', () => {
    expect(questionFor('NotABook', 1)).toBeUndefined()
  })

  it('gives Genesis 5 (a genealogy chapter) a genealogy-safe narrative question, not "someone wants something"', () => {
    const question = questionFor('Gen', 5)
    expect(question).not.toContain('Someone wants something')
  })

  it('gives Psalm 1 and Psalm 2 different questions', () => {
    expect(questionFor('Ps', 1)).not.toBe(questionFor('Ps', 2))
  })
})
