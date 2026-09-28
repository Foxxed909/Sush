import { describe, expect, it, vi } from 'vitest'
import { isMultiline, pasteAndSubmit, registerTerminal, unregisterTerminal } from '../src/renderer/src/lib/terminalRegistry.js'

describe('composer paste', () => {
  it('detects multi-line text but ignores a trailing newline', () => {
    expect(isMultiline('one')).toBe(false)
    expect(isMultiline('one\n')).toBe(false)
    expect(isMultiline('one\r\n')).toBe(false)
    expect(isMultiline('one\ntwo')).toBe(true)
    expect(isMultiline('one\r\ntwo\r\n')).toBe(true)
  })

  it('pastes the block once, then presses Enter afterwards', () => {
    const paste = vi.fn()
    const enter = vi.fn()
    const later = []
    registerTerminal('t1', { paste })
    expect(pasteAndSubmit('t1', 'a\nb', enter, { schedule: fn => later.push(fn) })).toBe(true)
    expect(paste).toHaveBeenCalledWith('a\nb')
    expect(enter).not.toHaveBeenCalled()
    later[0]()
    expect(enter).toHaveBeenCalledTimes(1)
    unregisterTerminal('t1', { paste })
  })

  it('reports false when no terminal is mounted so the caller can fall back', () => {
    expect(pasteAndSubmit('missing', 'a\nb', vi.fn())).toBe(false)
  })

  it('does not unregister a newer terminal that replaced it', () => {
    const oldTerm = { paste: vi.fn() }
    const newTerm = { paste: vi.fn() }
    registerTerminal('t2', oldTerm)
    registerTerminal('t2', newTerm)
    unregisterTerminal('t2', oldTerm)
    expect(pasteAndSubmit('t2', 'x\ny', vi.fn(), { schedule: () => {} })).toBe(true)
    expect(newTerm.paste).toHaveBeenCalled()
    unregisterTerminal('t2', newTerm)
  })
})
