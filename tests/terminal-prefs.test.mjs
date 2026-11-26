import { describe, expect, it } from 'vitest'
import { FONT_FALLBACKS, LINE_HEIGHT_DEFAULT, clampLineHeight, resolveFontFamily } from '../src/renderer/src/lib/terminalPrefs.js'

describe('terminal font family', () => {
  it('uses the fallback stack when nothing is saved', () => {
    expect(resolveFontFamily(undefined)).toBe(FONT_FALLBACKS)
    expect(resolveFontFamily('  ')).toBe(FONT_FALLBACKS)
  })
  it('gives a single saved face the cross-platform fallbacks', () => {
    const out = resolveFontFamily("'Cascadia Code'")
    expect(out.startsWith("'Cascadia Code', ")).toBe(true)
    expect(out.endsWith('monospace')).toBe(true)
  })
  it('leaves a stack that already ends in monospace alone', () => {
    expect(resolveFontFamily("'Iosevka', monospace")).toBe("'Iosevka', monospace")
  })
})

describe('terminal line height', () => {
  it('defaults to the classic 1.4 rhythm', () => {
    expect(clampLineHeight(undefined)).toBe(LINE_HEIGHT_DEFAULT)
    expect(clampLineHeight('nope')).toBe(LINE_HEIGHT_DEFAULT)
    expect(clampLineHeight('')).toBe(LINE_HEIGHT_DEFAULT)
  })
  it('clamps to a readable range', () => {
    expect(clampLineHeight(0.2)).toBe(1)
    expect(clampLineHeight(9)).toBe(1.8)
    expect(clampLineHeight('1.28')).toBe(1.28)
  })
})
