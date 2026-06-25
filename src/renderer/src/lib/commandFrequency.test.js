import { describe, it, expect } from 'vitest'
import { suggestAliasName, THRESHOLD } from './commandFrequency.js'

describe('suggestAliasName', () => {
  it('builds initials from a multi-token command', () => {
    expect(suggestAliasName('git status')).toBe('gs')
    expect(suggestAliasName('npm run dev')).toBe('nrd')
  })

  it('skips flags when forming initials', () => {
    expect(suggestAliasName('git commit -m')).toBe('gc')
  })

  it('takes a short prefix for a single-token command', () => {
    expect(suggestAliasName('docker')).toBe('doc')
  })

  it('avoids names already taken', () => {
    const taken = new Set(['gs'])
    expect(suggestAliasName('git status', taken)).toBe('gs2')
  })
})

describe('THRESHOLD', () => {
  it('is a positive number', () => {
    expect(typeof THRESHOLD).toBe('number')
    expect(THRESHOLD).toBeGreaterThan(0)
  })
})
