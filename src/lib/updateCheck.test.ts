import { describe, it, expect } from 'vitest'
import { parseVersion, isNewer } from './updateCheck'

describe('parseVersion', () => {
  it('parses "1.2.3"', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null })
  })

  it('parses "v1.2.3"', () => {
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null })
  })

  it('parses "V2.0.0"', () => {
    expect(parseVersion('V2.0.0')).toEqual({ major: 2, minor: 0, patch: 0, prerelease: null })
  })

  it('handles missing patch (treats as 0)', () => {
    expect(parseVersion('1.0')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: null })
  })

  it('handles malformed parts (treats as 0)', () => {
    expect(parseVersion('x.y.z')).toEqual({ major: 0, minor: 0, patch: 0, prerelease: null })
  })

  it('trims whitespace', () => {
    expect(parseVersion('  1.2.3  ')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null })
  })

  it('parses "app-v0.7.6" tag format', () => {
    expect(parseVersion('app-v0.7.6')).toEqual({ major: 0, minor: 7, patch: 6, prerelease: null })
  })

  it('parses "app-v1.2.3" tag format', () => {
    expect(parseVersion('app-v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null })
  })

  it('parses "2.0.0-beta.1"', () => {
    expect(parseVersion('2.0.0-beta.1')).toEqual({ major: 2, minor: 0, patch: 0, prerelease: 'beta.1' })
  })

  it('parses "app-v2.0.0-beta.3"', () => {
    expect(parseVersion('app-v2.0.0-beta.3')).toEqual({ major: 2, minor: 0, patch: 0, prerelease: 'beta.3' })
  })

  it('parses "1.0.0-alpha.1"', () => {
    expect(parseVersion('1.0.0-alpha.1')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: 'alpha.1' })
  })

  it('parses "1.0.0-rc.2"', () => {
    expect(parseVersion('1.0.0-rc.2')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: 'rc.2' })
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

  // Prerelease tests
  it('stable is newer than prerelease at same version', () => {
    expect(isNewer('2.0.0', '2.0.0-beta.3')).toBe(true)
  })

  it('prerelease is not newer than stable at same version', () => {
    expect(isNewer('2.0.0-beta.3', '2.0.0')).toBe(false)
  })

  it('higher beta is newer than lower beta', () => {
    expect(isNewer('2.0.0-beta.2', '2.0.0-beta.1')).toBe(true)
  })

  it('lower beta is not newer than higher beta', () => {
    expect(isNewer('2.0.0-beta.1', '2.0.0-beta.2')).toBe(false)
  })

  it('higher version prerelease is newer than lower stable', () => {
    expect(isNewer('2.0.0-beta.1', '1.5.3')).toBe(true)
  })

  it('lower stable is not newer than higher prerelease', () => {
    expect(isNewer('1.5.4', '2.0.0-beta.1')).toBe(false)
  })
})

