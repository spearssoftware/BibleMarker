import { describe, it, expect } from 'vitest'
import { BIBLE_BOOKS } from '@/types/bible'
import {
  BOOK_GENRE,
  GENRE_ORIENTATION,
  GENRE_QUESTIONS,
  GENRE_LABEL,
  CHAPTER_QUESTION_OVERRIDES,
  genreFor,
  orientationFor,
  questionFor,
} from '../genres'
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

describe('GENRE_ORIENTATION and GENRE_QUESTIONS - coverage', () => {
  it('has an orientation for every genre', () => {
    for (const genre of ALL_GENRES) {
      expect(GENRE_ORIENTATION[genre], `missing orientation for ${genre}`).toBeTruthy()
    }
  })

  it('has a label for every genre', () => {
    for (const genre of ALL_GENRES) {
      expect(GENRE_LABEL[genre], `missing label for ${genre}`).toBeTruthy()
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

  it('no chapter override asserts an interpretation', () => {
    for (const [bookId, byChapter] of Object.entries(CHAPTER_QUESTION_OVERRIDES)) {
      for (const [chapter, question] of Object.entries(byChapter)) {
        assertAnswerFree(question, `override[${bookId}.${chapter}]`)
      }
    }
  })

  it('no genre label asserts an interpretation', () => {
    for (const genre of ALL_GENRES) {
      assertAnswerFree(GENRE_LABEL[genre], `${genre} label`)
    }
  })
})

describe('neutrality - no contested critical claims or presumed content', () => {
  it('does not claim every law-book rule is protective', () => {
    for (const question of GENRE_QUESTIONS.law) {
      expect(question).not.toContain('This rule protects something')
    }
  })

  it('does not assert wisdom books critique each other', () => {
    for (const question of GENRE_QUESTIONS.wisdom) {
      expect(question.toLowerCase()).not.toContain('argues with itself')
    }
  })

  it('does not presume the gospels diverge on shared events', () => {
    for (const question of GENRE_QUESTIONS.gospel) {
      expect(question).not.toContain('reads differently across the four gospels')
    }
  })

  it('does not claim prophecy is written "in verse" (Isaiah 36-39 is prose)', () => {
    expect(GENRE_ORIENTATION.prophecy).not.toContain('in verse')
  })

  it('does not claim law books are "not a story" (Exodus contains narrative)', () => {
    expect(GENRE_ORIENTATION.law.toLowerCase()).not.toContain('not a story')
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

describe('CHAPTER_QUESTION_OVERRIDES - key validity', () => {
  const booksById = new Map(BIBLE_BOOKS.map(b => [b.id, b]))

  it('every book key exists in BIBLE_BOOKS, and every chapter number is in that book\'s range', () => {
    for (const [bookId, byChapter] of Object.entries(CHAPTER_QUESTION_OVERRIDES)) {
      const book = booksById.get(bookId)
      expect(book, `override references unknown book id "${bookId}"`).toBeDefined()

      for (const chapterKey of Object.keys(byChapter)) {
        const chapter = Number(chapterKey)
        expect(chapter, `override "${bookId}.${chapterKey}" chapter is below 1`).toBeGreaterThanOrEqual(1)
        if (book) {
          expect(chapter, `override "${bookId}.${chapterKey}" chapter exceeds ${bookId}'s ${book.chapters} chapters`).toBeLessThanOrEqual(book.chapters)
        }
      }
    }
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

  it('always returns a question from that genre\'s list or a chapter override, for every chapter of every book', () => {
    for (const book of BIBLE_BOOKS) {
      const genre = BOOK_GENRE[book.id]
      const questions = GENRE_QUESTIONS[genre]
      for (let chapter = 1; chapter <= book.chapters; chapter++) {
        const question = questionFor(book.id, chapter)
        const override = CHAPTER_QUESTION_OVERRIDES[book.id]?.[chapter]
        if (override) {
          expect(question).toBe(override)
        } else {
          expect(questions).toContain(question)
        }
      }
    }
  })

  it('returns undefined for an unknown book id', () => {
    expect(questionFor('NotABook', 1)).toBeUndefined()
  })

  // The exhaustive "every chapter of every book" test above already asserts
  // these overrides fire and match; what's left to guard here is that each
  // dedicated override actually avoids the generic genre phrasing it exists
  // to replace.
  it.each([
    ['Gen', 5, 'Someone wants something'],
    ['Matt', 1, 'Jesus is talking'],
    ['Deut', 34, 'Case law'],
  ])('the %s %i override avoids the generic-genre phrasing %j', (bookId, chapter, phrase) => {
    expect(questionFor(bookId, chapter)).not.toContain(phrase)
  })

  it('gives Psalm 1 and Psalm 2 different questions', () => {
    expect(questionFor('Ps', 1)).not.toBe(questionFor('Ps', 2))
  })
})
