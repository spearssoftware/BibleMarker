import { describe, it, expect } from 'vitest'
import {
  ValidationError,
  validateAnnotation,
  validateStudy,
  validateMarkingPreset,
  sanitizeData,
  validateArray,
} from './validation'

const iso = '2025-01-01T00:00:00.000Z'

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
