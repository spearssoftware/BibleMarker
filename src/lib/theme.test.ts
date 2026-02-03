import { describe, it, expect, vi } from 'vitest'
import { getEffectiveTheme } from './theme'

describe('getEffectiveTheme', () => {
  it('returns "light" when theme is "light"', () => {
    expect(getEffectiveTheme('light')).toBe('light')
  })

  it('returns "dark" when theme is "dark"', () => {
    expect(getEffectiveTheme('dark')).toBe('dark')
  })

  it('returns "dark" when theme is "auto" and OS prefers dark', () => {
    vi.stubGlobal(
      'window',
      { matchMedia: () => ({ matches: true }) }
    )
    expect(getEffectiveTheme('auto')).toBe('dark')
    vi.unstubAllGlobals()
  })

  it('returns "light" when theme is "auto" and OS prefers light', () => {
    vi.stubGlobal(
      'window',
      { matchMedia: () => ({ matches: false }) }
    )
    expect(getEffectiveTheme('auto')).toBe('light')
    vi.unstubAllGlobals()
  })
})
