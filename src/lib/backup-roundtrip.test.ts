import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateBackup, getBackupPreview, restoreBackup, type BackupData } from './backup'
import { importAllData, clearDatabase } from '@/lib/database'
import { performBackup } from '@/lib/autoBackup'
import {
  ISO, makeHighlightAnnotation, makeSymbolAnnotation, makeMarkingPreset,
  makeStudy, makeObservationList, makeObservationItem,
  makeTimeExpression, makePerson, makePlace,
  makeConclusion, makeInterpretation, makeApplication, makeVerseRef,
} from './__test__/factories'

// Mock database and autoBackup modules
vi.mock('@/lib/database')
vi.mock('@/lib/autoBackup', () => ({
  performBackup: vi.fn().mockResolvedValue(null),
}))

const mockImportAllData = vi.mocked(importAllData)
const mockClearDatabase = vi.mocked(clearDatabase)
const mockPerformBackup = vi.mocked(performBackup)

const now = ISO

function makePreferences() {
  return {
    id: 'main',
    marking: {
      recentColors: ['red'],
      recentSymbols: ['cross'],
      defaultTool: 'highlight' as const,
      defaultColor: 'yellow' as const,
      defaultSymbol: 'cross' as const,
      toolbarPosition: 'bottom' as const,
      showToolbarByDefault: true,
    },
    fontSize: 'base' as const,
    theme: 'dark' as const,
    favoriteTranslations: ['sword-NASB'],
    recentTranslations: ['sword-NASB'],
  }
}

function makeSectionHeading(overrides?: Record<string, unknown>) {
  return {
    id: 'sh-1',
    title: 'The Beginning',
    beforeRef: makeVerseRef(),
    createdAt: new Date(now),
    updatedAt: new Date(now),
    ...overrides,
  }
}

function makeChapterTitle(overrides?: Record<string, unknown>) {
  return {
    id: 'ct-1',
    book: 'Genesis',
    chapter: 1,
    title: 'Creation',
    createdAt: new Date(now),
    updatedAt: new Date(now),
    ...overrides,
  }
}

function makeNote(overrides?: Record<string, unknown>) {
  return {
    id: 'note-1',
    moduleId: 'sword-NASB',
    content: 'A note about creation',
    ref: makeVerseRef(),
    createdAt: new Date(now),
    updatedAt: new Date(now),
    ...overrides,
  }
}

function makeMultiTranslationView(overrides?: Record<string, unknown>) {
  return {
    id: 'mtv-1',
    translationIds: ['sword-NASB', 'sword-KJV'],
    syncScrolling: true,
    ...overrides,
  }
}

/**
 * Build a fully populated BackupData as it would appear after JSON round-trip
 * (dates as ISO strings, not Date objects).
 */
function makeFullBackup(): BackupData {
  return JSON.parse(JSON.stringify({
    version: '0.12.5',
    timestamp: now,
    data: {
      preferences: makePreferences(),
      annotations: [
        makeHighlightAnnotation({ id: 'ann-1' }),
        makeSymbolAnnotation({ id: 'sym-1' }),
      ],
      sectionHeadings: [makeSectionHeading()],
      chapterTitles: [makeChapterTitle()],
      notes: [makeNote()],
      markingPresets: [makeMarkingPreset({ id: 'preset-1' })],
      studies: [makeStudy({ id: 'study-1', name: 'Genesis Study', isActive: true })],
      multiTranslationViews: [makeMultiTranslationView()],
      observationLists: [makeObservationList({
        id: 'ol-1',
        items: [makeObservationItem({ id: 'item-1' })],
      })],
      timeExpressions: [makeTimeExpression({ id: 'time-1' })],
      places: [makePlace({ id: 'place-1' })],
      people: [makePerson({ id: 'person-1' })],
      conclusions: [makeConclusion({ id: 'conclusion-1' })],
      interpretations: [makeInterpretation({ id: 'interp-1', meaning: 'God is creator' })],
      applications: [makeApplication({ id: 'app-1', teaching: 'God is sovereign' })],
    },
  })) as BackupData
}

describe('backup roundtrip', () => {
  it('fully populated backup survives JSON serialize/deserialize and validates', () => {
    const backup = makeFullBackup()

    // Simulate writing to file and reading back
    const json = JSON.stringify(backup)
    const restored = JSON.parse(json) as BackupData

    const result = validateBackup(restored)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('preview counts match after round-trip', () => {
    const backup = makeFullBackup()
    const roundTripped = JSON.parse(JSON.stringify(backup)) as BackupData

    const preview = getBackupPreview(roundTripped)
    expect(preview.annotations).toBe(2)
    expect(preview.sectionHeadings).toBe(1)
    expect(preview.chapterTitles).toBe(1)
    expect(preview.notes).toBe(1)
    expect(preview.markingPresets).toBe(1)
    expect(preview.studies).toBe(1)
    expect(preview.multiTranslationViews).toBe(1)
    expect(preview.observationLists).toBe(1)
    expect(preview.timeExpressions).toBe(1)
    expect(preview.places).toBe(1)
    expect(preview.people).toBe(1)
    expect(preview.conclusions).toBe(1)
    expect(preview.interpretations).toBe(1)
    expect(preview.applications).toBe(1)
  })

  it('data integrity preserved through round-trip', () => {
    const backup = makeFullBackup()
    const json = JSON.stringify(backup, null, 2)
    const restored = JSON.parse(json) as BackupData

    // Verify specific field values survived
    expect(restored.data.annotations[0].id).toBe('ann-1')
    expect(restored.data.annotations[0].type).toBe('highlight')
    expect(restored.data.annotations[1].type).toBe('symbol')
    expect(restored.data.sectionHeadings[0].title).toBe('The Beginning')
    expect(restored.data.chapterTitles[0].book).toBe('Genesis')
    expect(restored.data.notes[0].content).toBe('A note about creation')
    expect(restored.data.studies[0].name).toBe('Genesis Study')
    expect(restored.data.multiTranslationViews[0].translationIds).toEqual(['sword-NASB', 'sword-KJV'])
    expect(restored.data.observationLists[0].items).toHaveLength(1)
    expect(restored.data.places[0].name).toBe('Jerusalem')
    expect(restored.data.people[0].name).toBe('Moses')
    expect(restored.data.timeExpressions[0].expression).toBe('In the beginning')
    expect(restored.data.conclusions[0].term).toBe('therefore')
  })

  it('handles backup with cached chapters through round-trip', () => {
    const backup = makeFullBackup()
    backup.data.cachedChapters = [{
      id: 'cache-1',
      moduleId: 'sword-NASB',
      book: 'Genesis',
      chapter: 1,
      verses: { 1: 'In the beginning...', 2: 'The earth was...' },
      cachedAt: now,
    }]

    const restored = JSON.parse(JSON.stringify(backup)) as BackupData
    const result = validateBackup(restored)
    expect(result.valid).toBe(true)
    expect(restored.data.cachedChapters).toHaveLength(1)
    expect(restored.data.cachedChapters![0].verses).toEqual({ 1: 'In the beginning...', 2: 'The earth was...' })
  })
})

describe('restoreBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClearDatabase.mockResolvedValue()
    mockImportAllData.mockResolvedValue()
  })

  it('clears database and imports all data', async () => {
    const backup = makeFullBackup()
    await restoreBackup(backup)

    expect(mockClearDatabase).toHaveBeenCalledOnce()
    expect(mockImportAllData).toHaveBeenCalledOnce()
  })

  it('creates a safety backup before clearing', async () => {
    const backup = makeFullBackup()
    const callOrder: string[] = []

    mockPerformBackup.mockImplementation(async () => {
      callOrder.push('backup')
      return null
    })
    mockClearDatabase.mockImplementation(async () => {
      callOrder.push('clear')
    })

    await restoreBackup(backup)

    expect(callOrder).toEqual(['backup', 'clear'])
  })

  it('proceeds even if safety backup fails', async () => {
    const backup = makeFullBackup()
    mockPerformBackup.mockRejectedValue(new Error('backup failed'))

    await restoreBackup(backup)

    expect(mockClearDatabase).toHaveBeenCalledOnce()
    expect(mockImportAllData).toHaveBeenCalledOnce()
  })

  it('passes validated data to importAllData', async () => {
    const backup = makeFullBackup()
    await restoreBackup(backup)

    const importedData = mockImportAllData.mock.calls[0][0]
    expect(importedData.annotations).toHaveLength(2)
    expect(importedData.sectionHeadings).toHaveLength(1)
    expect(importedData.chapterTitles).toHaveLength(1)
    expect(importedData.notes).toHaveLength(1)
    expect(importedData.markingPresets).toHaveLength(1)
    expect(importedData.studies).toHaveLength(1)
    expect(importedData.multiTranslationViews).toHaveLength(1)
    expect(importedData.observationLists).toHaveLength(1)
    expect(importedData.timeExpressions).toHaveLength(1)
    expect(importedData.places).toHaveLength(1)
    expect(importedData.people).toHaveLength(1)
    expect(importedData.conclusions).toHaveLength(1)
    expect(importedData.interpretations).toHaveLength(1)
    expect(importedData.applications).toHaveLength(1)
    expect(importedData.preferences).toEqual(backup.data.preferences)
  })

  it('throws when clearDatabase fails', async () => {
    const backup = makeFullBackup()
    mockClearDatabase.mockRejectedValue(new Error('DB locked'))

    await expect(restoreBackup(backup)).rejects.toThrow('Failed to restore backup')
  })

  it('throws when importAllData fails', async () => {
    const backup = makeFullBackup()
    mockImportAllData.mockRejectedValue(new Error('Import error'))

    await expect(restoreBackup(backup)).rejects.toThrow('Failed to restore backup')
  })

  it('restores backup with empty optional arrays', async () => {
    const backup = makeFullBackup()
    backup.data.timeExpressions = []
    backup.data.places = []
    backup.data.people = []
    backup.data.conclusions = []
    backup.data.interpretations = []
    backup.data.applications = []

    await restoreBackup(backup)

    const importedData = mockImportAllData.mock.calls[0][0]
    expect(importedData.places).toHaveLength(0)
    expect(importedData.applications).toHaveLength(0)
  })

  it('filters out invalid records instead of rejecting entire restore', async () => {
    const backup = makeFullBackup()
    // Add an invalid annotation alongside the valid ones
    backup.data.annotations.push({ id: '', type: 'invalid' } as never)

    await restoreBackup(backup)

    const importedData = mockImportAllData.mock.calls[0][0]
    // Invalid annotation should be filtered out, valid ones kept
    expect(importedData.annotations).toHaveLength(2)
  })

  it('rejects restore when all section headings are invalid', async () => {
    const backup = makeFullBackup()
    backup.data.sectionHeadings = [{ id: 'sh-1', title: '' } as never]

    await expect(restoreBackup(backup)).rejects.toThrow('No valid section headings found')
  })

  it('rejects restore when all chapter titles are invalid', async () => {
    const backup = makeFullBackup()
    backup.data.chapterTitles = [{ id: 'ct-1', book: '', chapter: 0 } as never]

    await expect(restoreBackup(backup)).rejects.toThrow('No valid chapter titles found')
  })
})

describe('backward compatibility', () => {
  it('validates backup missing optional observation arrays (pre-observation feature)', () => {
    const backup: Record<string, unknown> = {
      version: '0.5.0',
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
        applications: [],
        // Missing: timeExpressions, places, people, conclusions, interpretations
      },
    }

    const result = validateBackup(backup)
    expect(result.valid).toBe(true)
  })

  it('validates backup with Date strings instead of Date objects', () => {
    const backup = makeFullBackup()
    // makeFullBackup already uses JSON round-trip so dates are strings
    expect(typeof backup.data.annotations[0].createdAt).toBe('string')

    const result = validateBackup(backup)
    expect(result.valid).toBe(true)
  })

  it('validates backup with extra unknown fields (forward compatibility)', () => {
    const backup = makeFullBackup() as unknown as Record<string, unknown>
    const data = backup.data as Record<string, unknown>
    data.futureFeature = [{ id: 'ff-1', data: 'something new' }]
    backup.newTopLevelField = 'future'

    const result = validateBackup(backup)
    expect(result.valid).toBe(true)
  })
})
