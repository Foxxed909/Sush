import { describe, expect, it } from 'vitest'
import {
  AGENTS,
  COMMANDS,
  completions,
  helpText,
  isAirCommand,
  parseAirCommand,
  runAirCommand,
  suggest,
  tokenize
} from '../src/renderer/commands.js'
import { DEFAULT_THEME_ID, THEMES, getAirTheme, resolveTheme } from '../src/renderer/themes.js'

describe('Air command detection', () => {
  it('claims lines that start with : and leaves everything else to the shell', () => {
    expect(isAirCommand(':help')).toBe(true)
    expect(isAirCommand('git status')).toBe(false)
    // A shell command that merely mentions a colon is not ours.
    expect(isAirCommand('echo a:b')).toBe(false)
  })

  it('does not claim a bare colon, which is a half-typed command', () => {
    expect(isAirCommand(':')).toBe(false)
    expect(isAirCommand(': ')).toBe(false)
  })

  it('is safe on non-string input', () => {
    expect(isAirCommand(null)).toBe(false)
    expect(isAirCommand(undefined)).toBe(false)
  })
})

describe('tokenize', () => {
  it('keeps a quoted path with spaces as one argument', () => {
    expect(tokenize('"C:\\Program Files\\x" second')).toEqual(['C:\\Program Files\\x', 'second'])
    expect(tokenize("'two words' tail")).toEqual(['two words', 'tail'])
  })

  it('collapses runs of whitespace and returns [] for nothing', () => {
    expect(tokenize('  a   b  ')).toEqual(['a', 'b'])
    expect(tokenize('')).toEqual([])
    expect(tokenize(undefined)).toEqual([])
  })
})

describe('parseAirCommand', () => {
  it('resolves aliases to the canonical name', () => {
    expect(parseAirCommand(':cls').name).toBe('clear')
    expect(parseAirCommand(':q').name).toBe('close')
    expect(parseAirCommand(':?').name).toBe('help')
  })

  it('is case-insensitive on the command word but keeps the rest verbatim', () => {
    const parsed = parseAirCommand(':NOTE Fix The Retry Loop')
    expect(parsed.name).toBe('note')
    expect(parsed.rest).toBe('Fix The Retry Loop')
  })

  it('suggests a near miss and gives up cleanly on a far one', () => {
    expect(parseAirCommand(':thme').error).toContain(':theme')
    expect(parseAirCommand(':xyzzy').error).toContain(':help')
  })
})

describe('suggest', () => {
  it('prefers a prefix match, then a single edit', () => {
    expect(suggest('th')).toBe('theme')
    expect(suggest('clera')).toBe('clear')
    expect(suggest('qqqqqq')).toBe(null)
    expect(suggest('')).toBe(null)
  })
})

describe('resolveAction', () => {
  it('routes :note with text to the note, and bare :note to the panel', () => {
    expect(runAirCommand(':note check the timeout')).toMatchObject({
      ok: true, action: 'note-add', text: 'check the timeout'
    })
    expect(runAirCommand(':note')).toMatchObject({ ok: true, action: 'notes-open' })
  })

  it('requires a known agent', () => {
    expect(runAirCommand(':agent claude')).toMatchObject({ ok: true, action: 'agent', agent: 'claude' })
    expect(runAirCommand(':agent')).toMatchObject({ ok: false })
    expect(runAirCommand(':agent notanagent').error).toContain('notanagent')
    for (const agent of AGENTS) {
      expect(runAirCommand(`:agent ${agent}`).ok).toBe(true)
    }
  })

  it('turns :go into a zero-based index and rejects nonsense', () => {
    expect(runAirCommand(':go 3')).toMatchObject({ ok: true, action: 'go', index: 2 })
    expect(runAirCommand(':go 0').ok).toBe(false)
    expect(runAirCommand(':go two').ok).toBe(false)
    expect(runAirCommand(':go').ok).toBe(false)
  })

  it('clamps :font rather than erroring, and understands + / -', () => {
    expect(runAirCommand(':font 400')).toMatchObject({ ok: true, action: 'font', size: 32 })
    expect(runAirCommand(':font 1')).toMatchObject({ ok: true, action: 'font', size: 8 })
    expect(runAirCommand(':font 15.6')).toMatchObject({ ok: true, action: 'font', size: 16 })
    expect(runAirCommand(':font +')).toMatchObject({ ok: true, action: 'font-step', step: 1 })
    expect(runAirCommand(':font -')).toMatchObject({ ok: true, action: 'font-step', step: -1 })
    expect(runAirCommand(':font').ok).toBe(false)
  })

  it('needs a name for :rename and caps its length', () => {
    expect(runAirCommand(':rename api')).toMatchObject({ ok: true, action: 'rename', label: 'api' })
    expect(runAirCommand(':rename   ').ok).toBe(false)
    expect(runAirCommand(`:rename ${'x'.repeat(80)}`).label).toHaveLength(40)
  })

  it('treats a bare :find as clearing the search', () => {
    expect(runAirCommand(':find needle')).toMatchObject({ ok: true, action: 'find', query: 'needle' })
    expect(runAirCommand(':find')).toMatchObject({ ok: true, action: 'find', query: null })
  })

  it('gives every declared command a resolvable no-argument form or a clear error', () => {
    for (const command of COMMANDS) {
      const result = runAirCommand(`:${command.name}`)
      const needsArg = command.args.startsWith('<')
      expect(result.ok).toBe(!needsArg)
      if (!result.ok) expect(typeof result.error).toBe('string')
    }
  })
})

describe('completions', () => {
  it('matches aliases but only ever offers canonical names', () => {
    const names = completions(':cl').map(c => c.name)
    expect(names).toContain('clear')
    expect(names).not.toContain('cls')
  })

  it('stops once the command word is complete', () => {
    expect(completions(':theme moon')).toEqual([])
    expect(completions('theme')).toEqual([])
    expect(completions(':').length).toBe(COMMANDS.length)
  })
})

describe('helpText', () => {
  it('lists everything, and explains one command when asked', () => {
    expect(helpText().length).toBeGreaterThan(COMMANDS.length)
    expect(helpText('clear')[0]).toBe(':clear')
    expect(helpText('nope')[0]).toContain('No command')
  })
})

describe('themes', () => {
  it('falls back to the default for an unknown id', () => {
    expect(getAirTheme('nope').id).toBe(DEFAULT_THEME_ID)
    expect(getAirTheme(undefined).id).toBe(DEFAULT_THEME_ID)
  })

  it('cycles with no argument and wraps at the end', () => {
    const first = resolveTheme(null, THEMES[0].id)
    expect(first.theme.id).toBe(THEMES[1].id)
    const wrapped = resolveTheme(null, THEMES[THEMES.length - 1].id)
    expect(wrapped.theme.id).toBe(THEMES[0].id)
  })

  it('accepts a partial name and reports an ambiguous or missing one', () => {
    expect(resolveTheme('harb', 'moonlight').theme.id).toBe('harbor')
    expect(resolveTheme('MOONLIGHT', 'paper').theme.id).toBe('moonlight')
    expect(resolveTheme('zzz', 'moonlight').ok).toBe(false)
  })

  it('gives every theme a complete xterm palette', () => {
    const keys = Object.keys(THEMES[0].xterm)
    for (const theme of THEMES) {
      expect(Object.keys(theme.xterm).sort()).toEqual([...keys].sort())
      for (const value of Object.values(theme.xterm)) expect(value).toMatch(/^#[0-9a-f]{6}$/i)
      for (const value of Object.values(theme.ui)) expect(value).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
