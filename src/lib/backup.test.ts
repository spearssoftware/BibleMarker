import { describe, it, expect } from 'vitest'
import { validateBackup, getBackupPreview, type BackupData } from './backup'

// -- Test fixtures --
// Fixtures use ISO strings for dates (like real JSON backup files).
// BackupData types expect Date objects, so we cast through unknown.

const now = '2025-01-01T00:00:00.000Z'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeBackup(overrides: Record<string, any> = {}): BackupData {
  return {
    version: '1.0',
    timestamp: now,
    data: {
      preferences: { id: 'main' },
      annotations: [],
      sectionHeadings: [],
      chapterTitles: [],
      notes: [],
      markingPresets: [],
      studies: [],
      multiTranslationViews: [],
      observationLists: [],
      fiveWAndH: [],
      contrasts: [],
      timeExpressions: [],
      places: [],
      people: [],
      conclusions: [],
      interpretations: [],
      applications: [],
      ...overrides,
    },
  } as unknown as BackupData
}

const validAnnotation = {
  id: 'ann-1',
  moduleId: 'sword-NASB',
  type: 'highlight' as const,
  color: 'yellow' as const,
  startRef: { book: 'Genesis', chapter: 1, verse: 1 },
  endRef: { book: 'Genesis', chapter: 1, verse: 1 },
  createdAt: now,
  updatedAt: now,
}

const validSectionHeading = {
  id: 'sh-1',
  title: 'The Beginning',
  beforeRef: { book: 'Genesis', chapter: 1, verse: 1 },
  createdAt: now,
  updatedAt: now,
}

const validChapterTitle = {
  id: 'ct-1',
  book: 'Genesis',
  chapter: 1,
  title: 'Creation',
  createdAt: now,
  updatedAt: now,
}

const validNote = {
  id: 'note-1',
  moduleId: 'sword-NASB',
  content: 'A note about creation',
  ref: { book: 'Genesis', chapter: 1, verse: 1 },
  createdAt: now,
  updatedAt: now,
}

const validStudy = {
  id: 'study-1',
  name: 'Genesis Study',
  isActive: true,
  createdAt: now,
  updatedAt: now,
}

const validMarkingPreset = {
  id: 'preset-1',
  highlight: { style: 'highlight', color: 'yellow' },
  variants: [],
  autoSuggest: false,
  usageCount: 0,
  createdAt: now,
  updatedAt: now,
}

const validMultiTranslationView = {
  id: 'mtv-1',
  translationIds: ['sword-NASB'],
  syncScrolling: true,
}

const validObservationList = {
  id: 'ol-1',
  title: 'Observations on God',
  keyWordId: 'kw-1',
  items: [{
    id: 'oli-1',
    content: 'God created the heavens',
    verseRef: { book: 'Genesis', chapter: 1, verse: 1 },
    createdAt: now,
    updatedAt: now,
  }],
  createdAt: now,
  updatedAt: now,
}

const validFiveWAndH = {
  id: 'fwh-1',
  verseRef: { book: 'Genesis', chapter: 1, verse: 1 },
  who: 'God',
  what: 'Created the heavens and earth',
  createdAt: now,
  updatedAt: now,
}

const validPlace = {
  id: 'place-1',
  name: 'Eden',
  verseRef: { book: 'Genesis', chapter: 2, verse: 8 },
  createdAt: now,
  updatedAt: now,
}

const validPerson = {
  id: 'person-1',
  name: 'Adam',
  verseRef: { book: 'Genesis', chapter: 2, verse: 7 },
  createdAt: now,
  updatedAt: now,
}

const validContrast = {
  id: 'contrast-1',
  itemA: 'Light',
  itemB: 'Darkness',
  verseRef: { book: 'Genesis', chapter: 1, verse: 1 },
  createdAt: now,
  updatedAt: now,
}

const validTimeExpression = {
  id: 'time-1',
  expression: 'In the beginning',
  verseRef: { book: 'Genesis', chapter: 1, verse: 1 },
  createdAt: now,
  updatedAt: now,
}

const validConclusion = {
  id: 'conclusion-1',
  term: 'Therefore',
  verseRef: { book: 'Genesis', chapter: 1, verse: 1 },
  createdAt: now,
  updatedAt: now,
}

const validInterpretation = {
  id: 'interp-1',
  verseRef: { book: 'Genesis', chapter: 1, verse: 1 },
  meaning: 'God is the creator of all things',
  createdAt: now,
  updatedAt: now,
}

const validApplication = {
  id: 'app-1',
  verseRef: { book: 'Genesis', chapter: 1, verse: 1 },
  teaching: 'God is sovereign over creation',
  createdAt: now,
  updatedAt: now,
}

// -- Tests --

describe('validateBackup', () => {
  it('returns valid for minimal empty backup', () => {
    const result = validateBackup(makeBackup())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns valid for fully populated backup', () => {
    const backup = makeBackup({
      annotations: [validAnnotation],
      sectionHeadings: [validSectionHeading],
      chapterTitles: [validChapterTitle],
      notes: [validNote],
      markingPresets: [validMarkingPreset],
      studies: [validStudy],
      multiTranslationViews: [validMultiTranslationView],
      observationLists: [validObservationList],
      fiveWAndH: [validFiveWAndH],
      contrasts: [validContrast],
      timeExpressions: [validTimeExpression],
      places: [validPlace],
      people: [validPerson],
      conclusions: [validConclusion],
      interpretations: [validInterpretation],
      applications: [validApplication],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  // -- Structural validation --

  it('returns invalid for null input', () => {
    const result = validateBackup(null)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Backup data must be an object')
  })

  it('returns invalid for non-object input', () => {
    expect(validateBackup('string').valid).toBe(false)
    expect(validateBackup(42).valid).toBe(false)
    expect(validateBackup(undefined).valid).toBe(false)
  })

  it('returns invalid when version is missing', () => {
    const result = validateBackup({ ...makeBackup(), version: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('version'))).toBe(true)
  })

  it('returns invalid when timestamp is missing', () => {
    const result = validateBackup({ ...makeBackup(), timestamp: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('timestamp'))).toBe(true)
  })

  it('returns invalid when data is missing', () => {
    const result = validateBackup({ version: '1.0', timestamp: now })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.toLowerCase().includes('data'))).toBe(true)
  })

  it('returns invalid when data is not an object', () => {
    const result = validateBackup({ version: '1.0', timestamp: now, data: 'not-object' })
    expect(result.valid).toBe(false)
  })

  // -- Required fields --

  it('returns invalid when required array field is not an array', () => {
    const backup = makeBackup()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(backup.data as any).annotations = 'not-an-array'
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('annotations'))).toBe(true)
  })

  it('returns invalid when preferences is missing', () => {
    const backup = makeBackup()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(backup.data as any).preferences = null
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('preferences'))).toBe(true)
  })

  // -- Per-record validation --

  it('reports invalid annotation records', () => {
    const backup = makeBackup({
      annotations: [{ id: '', type: 'invalid' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Annotations validation errors'))).toBe(true)
  })

  it('reports invalid section heading records', () => {
    const backup = makeBackup({
      sectionHeadings: [{ id: 'sh-1', title: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Section headings validation errors'))).toBe(true)
  })

  it('reports invalid chapter title records', () => {
    const backup = makeBackup({
      chapterTitles: [{ id: 'ct-1', book: '', chapter: 0 }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Chapter titles validation errors'))).toBe(true)
  })

  it('reports invalid note records', () => {
    const backup = makeBackup({
      notes: [{ id: '', moduleId: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Notes validation errors'))).toBe(true)
  })

  it('reports invalid marking preset records', () => {
    const backup = makeBackup({
      markingPresets: [{ id: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Marking presets validation errors'))).toBe(true)
  })

  it('reports invalid study records', () => {
    const backup = makeBackup({
      studies: [{ id: '', name: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Studies validation errors'))).toBe(true)
  })

  it('reports invalid multi-translation view records', () => {
    const backup = makeBackup({
      multiTranslationViews: [{ id: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Multi-translation views validation errors'))).toBe(true)
  })

  it('reports invalid observation list records', () => {
    const backup = makeBackup({
      observationLists: [{ id: '', title: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Observation lists validation errors'))).toBe(true)
  })

  it('reports invalid 5W+H records', () => {
    const backup = makeBackup({
      fiveWAndH: [{ id: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('5W+H entries validation errors'))).toBe(true)
  })

  it('reports invalid contrast records', () => {
    const backup = makeBackup({
      contrasts: [{ id: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Contrasts validation errors'))).toBe(true)
  })

  it('reports invalid time expression records', () => {
    const backup = makeBackup({
      timeExpressions: [{ id: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Time expressions validation errors'))).toBe(true)
  })

  it('reports invalid place records', () => {
    const backup = makeBackup({
      places: [{ id: '', name: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Places validation errors'))).toBe(true)
  })

  it('reports invalid people records', () => {
    const backup = makeBackup({
      people: [{ id: '', name: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('People validation errors'))).toBe(true)
  })

  it('reports invalid conclusion records', () => {
    const backup = makeBackup({
      conclusions: [{ id: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Conclusions validation errors'))).toBe(true)
  })

  it('reports invalid interpretation records', () => {
    const backup = makeBackup({
      interpretations: [{ id: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Interpretation entries validation errors'))).toBe(true)
  })

  it('reports invalid application records', () => {
    const backup = makeBackup({
      applications: [{ id: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Application entries validation errors'))).toBe(true)
  })

  // -- Edge cases --

  it('limits error examples to 3 per data type', () => {
    const backup = makeBackup({
      annotations: Array.from({ length: 10 }, (_, i) => ({ id: `bad-${i}` })) as never[],
    })
    const result = validateBackup(backup)
    const annotationDetailErrors = result.errors.filter(e => e.startsWith('  - '))
    expect(annotationDetailErrors.length).toBeLessThanOrEqual(3)
  })

  it('validates multiple data types independently', () => {
    const backup = makeBackup({
      annotations: [{ id: '' }] as never[],
      notes: [{ id: '' }] as never[],
      studies: [{ id: '' }] as never[],
    })
    const result = validateBackup(backup)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Annotations'))).toBe(true)
    expect(result.errors.some(e => e.includes('Notes'))).toBe(true)
    expect(result.errors.some(e => e.includes('Studies'))).toBe(true)
  })

  it('accepts backup with optional arrays missing (backward compatibility)', () => {
    const backup = makeBackup()
    // Simulate an older backup missing optional fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = backup.data as any
    delete data.fiveWAndH
    delete data.contrasts
    delete data.timeExpressions
    delete data.places
    delete data.people
    delete data.conclusions
    delete data.interpretations
    const result = validateBackup(backup)
    expect(result.valid).toBe(true)
  })

  it('accepts backup from JSON round-trip (date strings instead of Date objects)', () => {
    const backup = makeBackup({
      annotations: [validAnnotation],
      studies: [validStudy],
      places: [validPlace],
      people: [validPerson],
      interpretations: [validInterpretation],
      applications: [validApplication],
    })
    const roundTripped = JSON.parse(JSON.stringify(backup))
    const result = validateBackup(roundTripped)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

describe('getBackupPreview', () => {
  it('returns counts for empty backup', () => {
    const preview = getBackupPreview(makeBackup())
    expect(preview.preferences).toBe(1)
    expect(preview.annotations).toBe(0)
    expect(preview.sectionHeadings).toBe(0)
    expect(preview.chapterTitles).toBe(0)
    expect(preview.notes).toBe(0)
    expect(preview.markingPresets).toBe(0)
    expect(preview.studies).toBe(0)
    expect(preview.multiTranslationViews).toBe(0)
    expect(preview.observationLists).toBe(0)
    expect(preview.fiveWAndH).toBe(0)
    expect(preview.contrasts).toBe(0)
    expect(preview.timeExpressions).toBe(0)
    expect(preview.places).toBe(0)
    expect(preview.people).toBe(0)
    expect(preview.conclusions).toBe(0)
    expect(preview.interpretations).toBe(0)
    expect(preview.applications).toBe(0)
    expect(preview.cachedChapters).toBe(0)
  })

  it('returns correct counts for populated backup', () => {
    const backup = makeBackup({
      annotations: [validAnnotation, { ...validAnnotation, id: 'ann-2' }],
      sectionHeadings: [validSectionHeading],
      chapterTitles: [validChapterTitle],
      notes: [validNote, { ...validNote, id: 'note-2' }, { ...validNote, id: 'note-3' }],
      markingPresets: [validMarkingPreset],
      studies: [validStudy],
      multiTranslationViews: [validMultiTranslationView],
      observationLists: [validObservationList],
      fiveWAndH: [validFiveWAndH],
      contrasts: [validContrast],
      timeExpressions: [validTimeExpression],
      places: [validPlace],
      people: [validPerson],
      conclusions: [validConclusion],
      interpretations: [validInterpretation],
      applications: [validApplication],
    })
    const preview = getBackupPreview(backup)
    expect(preview.preferences).toBe(1)
    expect(preview.annotations).toBe(2)
    expect(preview.sectionHeadings).toBe(1)
    expect(preview.notes).toBe(3)
    expect(preview.studies).toBe(1)
    expect(preview.places).toBe(1)
    expect(preview.people).toBe(1)
    expect(preview.interpretations).toBe(1)
    expect(preview.applications).toBe(1)
  })

  it('counts cached chapters when present', () => {
    const backup = makeBackup()
    backup.data.cachedChapters = [
      { id: 'ch-1', moduleId: 'sword-NASB', book: 'Genesis', chapter: 1, verses: { 1: 'In the beginning...' }, cachedAt: now },
      { id: 'ch-2', moduleId: 'sword-NASB', book: 'Genesis', chapter: 2, verses: { 1: 'Thus the heavens...' }, cachedAt: now },
    ]
    const preview = getBackupPreview(backup)
    expect(preview.cachedChapters).toBe(2)
  })

  it('handles missing optional arrays gracefully', () => {
    const backup = makeBackup()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = backup.data as any
    delete data.fiveWAndH
    delete data.contrasts
    delete data.timeExpressions
    delete data.places
    delete data.people
    delete data.conclusions
    delete data.interpretations
    delete data.cachedChapters
    const preview = getBackupPreview(backup)
    expect(preview.fiveWAndH).toBe(0)
    expect(preview.contrasts).toBe(0)
    expect(preview.timeExpressions).toBe(0)
    expect(preview.places).toBe(0)
    expect(preview.people).toBe(0)
    expect(preview.conclusions).toBe(0)
    expect(preview.interpretations).toBe(0)
    expect(preview.cachedChapters).toBe(0)
  })
})
