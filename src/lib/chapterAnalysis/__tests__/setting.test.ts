import { describe, it, expect } from 'vitest'
import { DEITY_SLUGS, buildChapterLine, formatAboutYear, isForetoldIn, isInChapter } from '../setting'

const base = {
  yearDisplay: '1921 BC',
  peopleCount: 3,
  placeCount: 2,
  firstEventTitle: 'Abraham Enters Canaan',
  primeval: false,
}

describe('DEITY_SLUGS', () => {
  it('holds God and the Holy Spirit', () => {
    expect(DEITY_SLUGS.has('god')).toBe(true)
    expect(DEITY_SLUGS.has('holy-spirit')).toBe(true)
    expect(DEITY_SLUGS.has('abraham')).toBe(false)
  })
})

describe('formatAboutYear', () => {
  it('lowercases mid-line', () => {
    expect(formatAboutYear('1921 BC', { capitalized: false })).toBe('about 1921 BC')
  })

  it('capitalizes at the start of a line', () => {
    expect(formatAboutYear('1921 BC', { capitalized: true })).toBe('About 1921 BC')
  })
})

describe('buildChapterLine', () => {
  it('joins every piece with a middle dot', () => {
    expect(buildChapterLine(base)).toBe('About 1921 BC · 3 people · 2 places · Abraham Enters Canaan')
  })

  it('uses singular forms for one', () => {
    expect(buildChapterLine({ ...base, peopleCount: 1, placeCount: 1, firstEventTitle: null })).toBe(
      'About 1921 BC · 1 person · 1 place',
    )
  })

  it('omits zero counts', () => {
    expect(buildChapterLine({ ...base, peopleCount: 0, placeCount: 0 })).toBe(
      'About 1921 BC · Abraham Enters Canaan',
    )
  })

  it('omits the year when primeval, even if one is given', () => {
    expect(buildChapterLine({ ...base, primeval: true })).toBe('3 people · 2 places · Abraham Enters Canaan')
  })

  it('omits a missing year', () => {
    expect(buildChapterLine({ ...base, yearDisplay: null })).toBe('3 people · 2 places · Abraham Enters Canaan')
  })

  it('returns null when there is nothing to show', () => {
    expect(
      buildChapterLine({ yearDisplay: null, peopleCount: 0, placeCount: 0, firstEventTitle: null, primeval: true }),
    ).toBeNull()
  })
})

describe('isInChapter', () => {
  it('matches verses in the chapter', () => {
    expect(isInChapter('Gen.12.1', 'Gen', 12)).toBe(true)
  })

  it('does not confuse chapter 1 with chapter 12', () => {
    expect(isInChapter('Gen.12.1', 'Gen', 1)).toBe(false)
  })

  it('rejects other books', () => {
    expect(isInChapter('Exod.12.1', 'Gen', 12)).toBe(false)
  })
})

describe('isForetoldIn', () => {
  it('is true only for a foretold person in an Old Testament book', () => {
    expect(isForetoldIn('jesus-son-of-joseph', 'Gen')).toBe(true)
    expect(isForetoldIn('jesus-son-of-joseph', 'Matt')).toBe(false)
    expect(isForetoldIn('abraham', 'Gen')).toBe(false)
  })
})
