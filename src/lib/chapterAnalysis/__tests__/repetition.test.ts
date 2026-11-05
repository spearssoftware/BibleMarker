import { describe, it, expect } from 'vitest'
import { findRepetition } from '../repetition'
import { STOPWORDS } from '../stopwords'
import { DEFAULT_DISCOVERY_THRESHOLDS } from '../types'
import type { AnalysisVerse } from '../types'
import { splitIntoWords } from '@/lib/keywordMatching'

function verse(book: string, chapter: number, num: number, text: string): AnalysisVerse {
  return { ref: { book, chapter, verse: num }, text }
}

// A paraphrase of John 1:1-18. "word" repeats 6x (v.1, v.9, v.14, v.18),
// "light" repeats 5x (v.3-7), and "God" repeats 9x - more than either, but
// deprioritized, so it must not win.
const JOHN_1: AnalysisVerse[] = [
  verse('John', 1, 1, 'In the beginning was the Word, and the Word was with God, and the Word was God.'),
  verse('John', 1, 2, 'He was with God in the beginning, and apart from him nothing was made.'),
  verse('John', 1, 3, 'In him was life, and that life became a light for mankind.'),
  verse('John', 1, 4, 'The light shines in the darkness, and the darkness did not overcome it.'),
  verse('John', 1, 5, 'A man named John was sent from God as a witness.'),
  verse('John', 1, 6, 'He came to testify about the light, so that all might believe through him.'),
  verse('John', 1, 7, 'He himself was not the light, but he came to testify about the light.'),
  verse('John', 1, 8, 'God so loved the world that he gave his only Son.'),
  verse('John', 1, 9, 'Whoever believes in the word of life should not perish but have eternal life.'),
  verse('John', 1, 10, 'He was in the world, and the world was made through him, yet the world did not know him.'),
  verse('John', 1, 11, 'He came to his own people, and his own people did not receive him.'),
  verse('John', 1, 12, 'But to all who received him, he gave the right to become children of God.'),
  verse('John', 1, 13, 'They were born, not of blood nor of human will, but of God.'),
  verse('John', 1, 14, 'And the Word became flesh and dwelt among us, and we saw his glory, glory as of the only Son from the Father.'),
  verse('John', 1, 15, 'John testified about him and cried out, saying, this was he of whom I spoke.'),
  verse('John', 1, 16, 'From his fullness we have all received grace upon grace.'),
  verse('John', 1, 17, 'For the law was given through Moses; grace and truth came through Jesus Christ.'),
  verse('John', 1, 18, 'No one has ever seen God, but the only Son has made him known. This is the Word of God.'),
]

// A genealogy-style fixture where the phrasing (and the unit of age - years,
// winters, seasons, springs...) is varied enough per verse that nothing but
// stopwords ever repeats 5+ times. The highest non-stopword count here is
// "hundred" at 4.
const GENEALOGY: AnalysisVerse[] = [
  verse('Gen', 5, 3, 'Adam lived a hundred and thirty years before Seth was born.'),
  verse('Gen', 5, 4, 'Afterward Adam remained on the earth another eight centuries, fathering more sons and daughters.'),
  verse('Gen', 5, 6, 'Seth reached a hundred and five winters before Enosh arrived.'),
  verse('Gen', 5, 7, 'Seth then walked the earth eight hundred and seven more seasons, raising a larger family.'),
  verse('Gen', 5, 9, 'Enosh saw ninety springs pass before Kenan came into being.'),
  verse('Gen', 5, 10, 'Enosh spent eight hundred and fifteen further seasons on earth, adding to his household.'),
  verse('Gen', 5, 12, 'Kenan reached seventy winters before Mahalalel was welcomed.'),
  verse('Gen', 5, 15, 'Mahalalel counted sixty-five seasons before Jared entered the story.'),
]

describe('findRepetition', () => {
  it('surfaces "word" in the John 1 fixture, deprioritizing the higher-count "God"', () => {
    // The default word-length floor is 3, so the 3-letter "god" is already a
    // candidate here - this exercises the DEPRIORITIZED path with no
    // threshold override needed.
    const result = findRepetition(JOHN_1, DEFAULT_DISCOVERY_THRESHOLDS)

    expect(result).not.toBeNull()
    expect(result!.token).toBe('word')
    expect(result!.count).toBe(6)
    expect(result!.firstVerse).toBe(1)
    expect(result!.lastVerse).toBe(18)
    expect(result!.display).toBe('Word')
  })

  it('never chooses a stopword even when it is the most frequent token', () => {
    const result = findRepetition(JOHN_1, DEFAULT_DISCOVERY_THRESHOLDS)
    expect(result).not.toBeNull()
    expect(STOPWORDS.has(result!.token)).toBe(false)
  })

  it('returns null for a genealogy chapter with no qualifying repetition', () => {
    expect(findRepetition(GENEALOGY, DEFAULT_DISCOVERY_THRESHOLDS)).toBeNull()
  })

  it('returns null when the injected threshold cannot be met', () => {
    const thresholds = { ...DEFAULT_DISCOVERY_THRESHOLDS, repetitionMinCount: 50 }
    expect(findRepetition(JOHN_1, thresholds)).toBeNull()
  })

  it('breaks ties by earliest occurrence, not lexical order', () => {
    // "zebra" and "apple" both occur 5 times total; "zebra" occurs first
    // (offset 0 of v.1) even though "apple" sorts first alphabetically and
    // also appears in v.1 (just later, after the zebras).
    const verses: AnalysisVerse[] = [
      verse('Test', 1, 1, 'zebra zebra zebra apple'),
      verse('Test', 1, 2, 'zebra zebra apple apple apple apple'),
    ]
    const result = findRepetition(verses, DEFAULT_DISCOVERY_THRESHOLDS)
    expect(result).not.toBeNull()
    expect(result!.token).toBe('zebra')
    expect(result!.count).toBe(5)
  })

  it('computes different counts for two differently-worded translations of the same chapter', () => {
    const translationA: AnalysisVerse[] = [
      verse('Rom', 5, 1, 'grace grace grace grace grace peace'),
    ]
    const translationB: AnalysisVerse[] = [
      verse('Rom', 5, 1, 'grace grace favor favor peace peace'),
    ]
    const resultA = findRepetition(translationA, DEFAULT_DISCOVERY_THRESHOLDS)
    const resultB = findRepetition(translationB, DEFAULT_DISCOVERY_THRESHOLDS)

    expect(resultA).not.toBeNull()
    expect(resultA!.token).toBe('grace')
    expect(resultA!.count).toBe(5)
    // translation B never reaches the count-5 threshold for any single word
    expect(resultB).toBeNull()
  })

  it('collects distinct raw surface forms in order of first appearance', () => {
    const verses: AnalysisVerse[] = [
      verse('Test', 1, 1, 'word words word'),
      verse('Test', 1, 2, 'Words word word'),
    ]
    const result = findRepetition(verses, DEFAULT_DISCOVERY_THRESHOLDS)
    expect(result).not.toBeNull()
    expect(result!.token).toBe('word')
    expect(result!.forms).toEqual(['word', 'words'])
  })

  it('keeps the first occurrence as the display form, with its casing and without punctuation', () => {
    const verses: AnalysisVerse[] = [
      verse('Test', 1, 1, 'In the beginning was the Word, and the Word was with God.'),
      verse('Test', 1, 2, 'The word, the words, the word.'),
    ]
    const result = findRepetition(verses, DEFAULT_DISCOVERY_THRESHOLDS)
    expect(result!.token).toBe('word')
    expect(result!.display).toBe('Word')
  })

  it('prefers the base form for display even when a possessive or plural comes first', () => {
    const verses: AnalysisVerse[] = [
      verse('Test', 1, 1, "God's people, and the sons of God."),
      verse('Test', 1, 2, 'God saw that God is good; God, God.'),
    ]
    const result = findRepetition(verses, DEFAULT_DISCOVERY_THRESHOLDS)
    expect(result!.token).toBe('god')
    expect(result!.display).toBe('God')
  })

  it('falls back to the first form when the chapter never uses the base form', () => {
    const verses: AnalysisVerse[] = [
      verse('Test', 1, 1, 'Lions, lions, lions.'),
      verse('Test', 1, 2, 'The lions and more lions.'),
    ]
    const result = findRepetition(verses, DEFAULT_DISCOVERY_THRESHOLDS)
    expect(result!.token).toBe('lion')
    expect(result!.display).toBe('Lions')
  })

  it('records occurrence offsets that line up with splitIntoWords on raw text with a curly apostrophe and an em dash', () => {
    const text = 'light—light—light—light—light and the LORD’s glory shone.'
    const verses: AnalysisVerse[] = [verse('Test', 1, 1, text)]
    const result = findRepetition(verses, DEFAULT_DISCOVERY_THRESHOLDS)

    expect(result).not.toBeNull()
    expect(result!.token).toBe('light')

    const words = splitIntoWords(text)
    const lightWords = words.filter(w => w.word.toLowerCase().startsWith('light'))
    expect(result!.occurrences).toHaveLength(lightWords.length)
    result!.occurrences.forEach((occ, i) => {
      expect(occ.start).toBe(lightWords[i].startIndex)
      expect(occ.end).toBe(lightWords[i].endIndex)
    })
  })
})
