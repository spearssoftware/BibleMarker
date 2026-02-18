import { describe, it, expect } from 'vitest'
import { parseVersion, isNewer } from './updateCheck'

describe('parseVersion', () => {
  it('parses "1.2.3"', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
  })

  it('parses "v1.2.3"', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
  })

  it('parses "V2.0.0"', () => {
    expect(parseVersion('V2.0.0')).toEqual([2, 0, 0])
  })

  it('handles missing patch (treats as 0)', () => {
    expect(parseVersion('1.0')).toEqual([1, 0, 0])
  })

  it('handles malformed parts (treats as 0)', () => {
    expect(parseVersion('x.y.z')).toEqual([0, 0, 0])
  })

  it('trims whitespace', () => {
    expect(parseVersion('  1.2.3  ')).toEqual([1, 2, 3])
  })

  it('parses "app-v0.7.6" tag format', () => {
    expect(parseVersion('app-v0.7.6')).toEqual([0, 7, 6])
  })

  it('parses "app-v1.2.3" tag format', () => {
    expect(parseVersion('app-v1.2.3')).toEqual([1, 2, 3])
  })
})

describe('isNewer', () => {
  it('returns true when a > b (patch)', () => {
    expect(isNewer('1.2.4', '1.2.3')).toBe(true)
  })

  it('returns true when a > b (minor)', () => {
    expect(isNewer('2.0.0', '1.9.9')).toBe(true)
  })

  it('returns true when a > b (major)', () => {
    expect(isNewer('2.0.0', '1.0.0')).toBe(true)
  })

  it('returns false when versions are equal', () => {
    expect(isNewer('1.2.3', '1.2.3')).toBe(false)
  })

  it('returns false when a < b', () => {
    expect(isNewer('1.2.3', '1.2.4')).toBe(false)
  })
})
