import { describe, it, expect } from 'vitest'
import { validateBackup, getBackupPreview, type BackupData } from './backup'

describe('validateBackup', () => {
  const minimalValid = {
    version: '1.0',
    timestamp: '2025-01-01T00:00:00.000Z',
    data: {
      preferences: {},
      annotations: [],
      sectionHeadings: [],
      chapterTitles: [],
      notes: [],
      markingPresets: [],
      studies: [],
      multiTranslationViews: [],
      observationLists: [],
      applications: [],
    },
  }

  it('returns valid for minimal valid backup shape', () => {
    const result = validateBackup(minimalValid)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns invalid when version is missing', () => {
    const result = validateBackup({ ...minimalValid, version: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('version'))).toBe(true)
  })

  it('returns invalid when data is missing', () => {
    const result = validateBackup({ version: '1.0', timestamp: '2025-01-01T00:00:00.000Z' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.toLowerCase().includes('data'))).toBe(true)
  })

  it('returns invalid for non-object input', () => {
    const result = validateBackup(null)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('getBackupPreview', () => {
  it('returns counts for minimal backup', () => {
    const backup: BackupData = {
      version: '1.0',
      timestamp: '2025-01-01T00:00:00.000Z',
      data: {
        preferences: {} as BackupData['data']['preferences'],
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
      },
    }
    const preview = getBackupPreview(backup)
    expect(preview.preferences).toBe(1)
    expect(preview.annotations).toBe(0)
    expect(preview.studies).toBe(0)
    expect(preview.applications).toBe(0)
  })
})
