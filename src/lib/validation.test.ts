import { describe, it, expect } from 'vitest'
import {
  ValidationError,
  validateAnnotation,
  validateStudy,
  validateMarkingPreset,
  validateSectionHeading,
  validateChapterTitle,
  validateNote,
  validateMultiTranslationView,
  validateObservationList,
  validateFiveWAndH,
  validateInterpretation,
  validateApplication,
  validatePlace,
  validatePerson,
  sanitizeData,
  validateArray,
} from './validation'
import { ISO as iso } from './__test__/factories'

describe('ValidationError', () => {
  it('sets name, message, field, and value', () => {
    const err = new ValidationError('Bad value', 'field', { x: 1 })
    expect(err.name).toBe('ValidationError')
    expect(err.message).toBe('Bad value')
    expect(err.field).toBe('field')
    expect(err.value).toEqual({ x: 1 })
  })
})

describe('validateAnnotation', () => {
  const validHighlight = {
    id: 'a1',
    moduleId: 'eng-ESV',
    type: 'highlight',
    startRef: { book: 'Gen', chapter: 1, verse: 1 },
    endRef: { book: 'Gen', chapter: 1, verse: 1 },
    color: 'red',
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid highlight annotation', () => {
    const result = validateAnnotation(validHighlight)
    expect(result).toBeDefined()
    expect((result as { id: string }).id).toBe('a1')
  })

  it('throws on non-object', () => {
    expect(() => validateAnnotation(null)).toThrow(ValidationError)
    expect(() => validateAnnotation('x')).toThrow(ValidationError)
  })

  it('throws on invalid ref (chapter < 1)', () => {
    expect(() =>
      validateAnnotation({
        ...validHighlight,
        startRef: { book: 'Gen', chapter: 0, verse: 1 },
      })
    ).toThrow(ValidationError)
  })

  it('throws on invalid type', () => {
    expect(() =>
      validateAnnotation({ ...validHighlight, type: 'invalid' })
    ).toThrow(ValidationError)
  })
})

describe('validateStudy', () => {
  const validStudy = {
    id: 's1',
    name: 'My Study',
    isActive: true,
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid study', () => {
    const result = validateStudy(validStudy)
    expect(result.name).toBe('My Study')
  })

  it('throws on missing name', () => {
    expect(() => validateStudy({ ...validStudy, name: '' })).toThrow(ValidationError)
  })
})

describe('validateMarkingPreset', () => {
  const validPreset = {
    id: 'p1',
    symbol: 'triangle',
    variants: [],
    autoSuggest: false,
    usageCount: 0,
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid preset with symbol', () => {
    const result = validateMarkingPreset(validPreset)
    expect(result.id).toBe('p1')
  })

  it('accepts valid preset with highlight only', () => {
    const result = validateMarkingPreset({
      ...validPreset,
      id: 'p2',
      symbol: undefined,
      highlight: { style: 'highlight', color: 'yellow' },
    })
    expect(result.id).toBe('p2')
  })

  it('throws when neither symbol nor highlight', () => {
    expect(() =>
      validateMarkingPreset({ ...validPreset, symbol: undefined })
    ).toThrow(ValidationError)
  })
})

describe('sanitizeData', () => {
  it('passes valid data through validator', () => {
    const result = sanitizeData({ id: 'x' }, (d) => (d as { id: string }).id)
    expect(result).toBe('x')
  })

  it('rethrows ValidationError from validator', () => {
    expect(() =>
      sanitizeData(null, () => {
        throw new ValidationError('Bad', 'field', null)
      })
    ).toThrow(ValidationError)
  })
})

describe('validateArray', () => {
  it('returns valid items and errors for mixed array', () => {
    const items = [
      { id: 's1', name: 'A', isActive: true, createdAt: iso, updatedAt: iso },
      { id: '', name: 'B', isActive: false, createdAt: iso, updatedAt: iso },
      { id: 's3', name: 'C', isActive: true, createdAt: iso, updatedAt: iso },
    ]
    const { valid, errors } = validateArray(items, (d) => {
      const o = d as { id: string; name: string; isActive: boolean; createdAt: string; updatedAt: string }
      if (typeof o.id !== 'string' || o.id.trim() === '') throw new ValidationError('invalid id')
      return o
    }, 'study')
    expect(valid).toHaveLength(2)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('index 1')
  })
})

// --- New validator tests ---

const ref = { book: 'Gen', chapter: 1, verse: 1 }

describe('validateSectionHeading', () => {
  const valid = {
    id: 'h1',
    title: 'Creation',
    beforeRef: ref,
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid heading', () => {
    expect(validateSectionHeading(valid).id).toBe('h1')
  })

  it('throws on non-object', () => {
    expect(() => validateSectionHeading(null)).toThrow(ValidationError)
  })

  it('throws on missing title', () => {
    expect(() => validateSectionHeading({ ...valid, title: '' })).toThrow(ValidationError)
  })

  it('throws on invalid beforeRef', () => {
    expect(() =>
      validateSectionHeading({ ...valid, beforeRef: { book: '', chapter: 1, verse: 1 } })
    ).toThrow(ValidationError)
  })
})

describe('validateChapterTitle', () => {
  const valid = {
    id: 'ct1',
    book: 'Gen',
    chapter: 1,
    title: 'The Beginning',
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid chapter title', () => {
    expect(validateChapterTitle(valid).id).toBe('ct1')
  })

  it('throws on non-object', () => {
    expect(() => validateChapterTitle(null)).toThrow(ValidationError)
  })

  it('throws on missing book', () => {
    expect(() => validateChapterTitle({ ...valid, book: '' })).toThrow(ValidationError)
  })

  it('throws on chapter < 1', () => {
    expect(() => validateChapterTitle({ ...valid, chapter: 0 })).toThrow(ValidationError)
  })
})

describe('validateNote', () => {
  const valid = {
    id: 'n1',
    moduleId: 'eng-ESV',
    content: 'A note',
    ref,
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid note', () => {
    expect(validateNote(valid).id).toBe('n1')
  })

  it('throws on non-object', () => {
    expect(() => validateNote(null)).toThrow(ValidationError)
  })

  it('throws on missing content (non-string)', () => {
    expect(() => validateNote({ ...valid, content: 123 })).toThrow(ValidationError)
  })

  it('throws on invalid ref', () => {
    expect(() =>
      validateNote({ ...valid, ref: { book: 'Gen', chapter: -1, verse: 1 } })
    ).toThrow(ValidationError)
  })
})

describe('validateMultiTranslationView', () => {
  const valid = {
    id: 'mtv1',
    translationIds: ['ESV', 'NIV'],
    syncScrolling: true,
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid view', () => {
    expect(validateMultiTranslationView(valid).id).toBe('mtv1')
  })

  it('throws on non-object', () => {
    expect(() => validateMultiTranslationView(null)).toThrow(ValidationError)
  })

  it('throws when > 3 translation IDs', () => {
    expect(() =>
      validateMultiTranslationView({ ...valid, translationIds: ['a', 'b', 'c', 'd'] })
    ).toThrow(ValidationError)
  })

  it('throws on missing syncScrolling', () => {
    expect(() =>
      validateMultiTranslationView({ ...valid, syncScrolling: undefined })
    ).toThrow(ValidationError)
  })
})

describe('validateObservationList', () => {
  const validItem = {
    id: 'oi1',
    content: 'An observation',
    verseRef: ref,
    createdAt: iso,
    updatedAt: iso,
  }
  const valid = {
    id: 'ol1',
    title: 'Observations',
    keyWordId: 'kw1',
    items: [validItem],
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid list', () => {
    expect(validateObservationList(valid).id).toBe('ol1')
  })

  it('throws on non-object', () => {
    expect(() => validateObservationList(null)).toThrow(ValidationError)
  })

  it('throws on invalid item in items array', () => {
    expect(() =>
      validateObservationList({ ...valid, items: [{ id: '', content: '', verseRef: ref }] })
    ).toThrow(ValidationError)
  })

  it('throws on missing keyWordId', () => {
    expect(() =>
      validateObservationList({ ...valid, keyWordId: '' })
    ).toThrow(ValidationError)
  })
})

describe('validateFiveWAndH', () => {
  const valid = {
    id: 'fwh1',
    verseRef: ref,
    who: 'God',
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid entry', () => {
    expect(validateFiveWAndH(valid).id).toBe('fwh1')
  })

  it('throws on non-object', () => {
    expect(() => validateFiveWAndH(null)).toThrow(ValidationError)
  })

  it('throws when all fields empty (no content)', () => {
    expect(() =>
      validateFiveWAndH({ ...valid, who: undefined })
    ).toThrow(ValidationError)
  })

  it('throws on invalid linkedPresetIds', () => {
    expect(() =>
      validateFiveWAndH({ ...valid, linkedPresetIds: ['valid', ''] })
    ).toThrow(ValidationError)
  })
})

describe('validateInterpretation', () => {
  const valid = {
    id: 'int1',
    verseRef: ref,
    meaning: 'God created everything',
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid entry', () => {
    expect(validateInterpretation(valid).id).toBe('int1')
  })

  it('throws on non-object', () => {
    expect(() => validateInterpretation(null)).toThrow(ValidationError)
  })

  it('throws when endVerseRef is before verseRef', () => {
    expect(() =>
      validateInterpretation({
        ...valid,
        verseRef: { book: 'Gen', chapter: 1, verse: 5 },
        endVerseRef: { book: 'Gen', chapter: 1, verse: 3 },
      })
    ).toThrow(ValidationError)
  })

  it('throws when all fields empty', () => {
    expect(() =>
      validateInterpretation({ ...valid, meaning: undefined })
    ).toThrow(ValidationError)
  })
})

describe('validateApplication', () => {
  const valid = {
    id: 'app1',
    verseRef: ref,
    teaching: 'God is sovereign',
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid entry', () => {
    expect(validateApplication(valid).id).toBe('app1')
  })

  it('throws on non-object', () => {
    expect(() => validateApplication(null)).toThrow(ValidationError)
  })

  it('throws when all fields empty', () => {
    expect(() =>
      validateApplication({ ...valid, teaching: undefined })
    ).toThrow(ValidationError)
  })

  it('throws on invalid linkedPresetIds', () => {
    expect(() =>
      validateApplication({ ...valid, linkedPresetIds: [123] })
    ).toThrow(ValidationError)
  })
})

describe('validatePlace', () => {
  const valid = {
    id: 'pl1',
    name: 'Eden',
    verseRef: ref,
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid place', () => {
    expect(validatePlace(valid).id).toBe('pl1')
  })

  it('throws on non-object', () => {
    expect(() => validatePlace(null)).toThrow(ValidationError)
  })

  it('throws on missing name', () => {
    expect(() => validatePlace({ ...valid, name: '' })).toThrow(ValidationError)
  })

  it('throws on invalid latitude type', () => {
    expect(() => validatePlace({ ...valid, latitude: 'bad' })).toThrow(ValidationError)
  })
})

describe('validatePerson', () => {
  const valid = {
    id: 'pe1',
    name: 'Adam',
    verseRef: ref,
    createdAt: iso,
    updatedAt: iso,
  }

  it('accepts valid person', () => {
    expect(validatePerson(valid).id).toBe('pe1')
  })

  it('throws on non-object', () => {
    expect(() => validatePerson(null)).toThrow(ValidationError)
  })

  it('throws on missing name', () => {
    expect(() => validatePerson({ ...valid, name: '' })).toThrow(ValidationError)
  })

  it('throws on invalid yearStartEra', () => {
    expect(() =>
      validatePerson({ ...valid, yearStartEra: 'BCE' })
    ).toThrow(ValidationError)
  })
})
