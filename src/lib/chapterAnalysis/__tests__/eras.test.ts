import { describe, it, expect } from 'vitest'
import { ERA_BANDS, eraPosition, isPrimeval } from '../eras'

describe('ERA_BANDS', () => {
  it('has the eight labels in order', () => {
    expect(ERA_BANDS.map(b => b.label)).toEqual([
      'Beginnings',
      'Patriarchs',
      'Exodus & Wilderness',
      'Judges',
      'Kingdom',
      'Exile',
      'Return',
      'Jesus & the Church',
    ])
  })

  it('is ordered, with each band starting at or before its end', () => {
    for (const band of ERA_BANDS) {
      expect(band.startYear, band.label).toBeLessThanOrEqual(band.endYear)
    }
  })

  it('is contiguous with no gaps or overlaps', () => {
    for (let i = 1; i < ERA_BANDS.length; i++) {
      expect(ERA_BANDS[i].startYear, ERA_BANDS[i].label).toBe(ERA_BANDS[i - 1].endYear + 1)
    }
  })

  it('covers -4003 through 96', () => {
    expect(ERA_BANDS[0].startYear).toBeLessThanOrEqual(-4003)
    expect(ERA_BANDS[ERA_BANDS.length - 1].endYear).toBeGreaterThanOrEqual(96)
  })
})

describe('eraPosition', () => {
  it('places the first year at the start of the first band', () => {
    expect(eraPosition(-4003)).toEqual({ index: 0, fraction: 0 })
  })

  it('splits the Beginnings/Patriarchs edge', () => {
    expect(eraPosition(-1921)?.index).toBe(0)
    expect(eraPosition(-1920)).toEqual({ index: 1, fraction: 0 })
  })

  it('places the last year in the last band, below 1', () => {
    const pos = eraPosition(96)
    expect(pos?.index).toBe(ERA_BANDS.length - 1)
    expect(pos!.fraction).toBeLessThan(1)
    expect(pos!.fraction).toBeGreaterThan(0.9)
  })

  it('keeps every band-end fraction within [0, 1)', () => {
    ERA_BANDS.forEach((band, i) => {
      const pos = eraPosition(band.endYear)
      expect(pos?.index).toBe(i)
      expect(pos!.fraction).toBeGreaterThanOrEqual(0)
      expect(pos!.fraction).toBeLessThan(1)
    })
  })

  it('returns null outside all bands', () => {
    expect(eraPosition(-5000)).toBeNull()
    expect(eraPosition(97)).toBeNull()
  })
})

describe('isPrimeval', () => {
  it('is true for Genesis 1 through 11', () => {
    expect(isPrimeval('Gen', 1)).toBe(true)
    expect(isPrimeval('Gen', 11)).toBe(true)
  })

  it('is false from Genesis 12', () => {
    expect(isPrimeval('Gen', 12)).toBe(false)
  })

  it('is false for other books', () => {
    expect(isPrimeval('Exod', 1)).toBe(false)
    expect(isPrimeval('Matt', 1)).toBe(false)
  })
})
