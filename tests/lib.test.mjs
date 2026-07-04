// Unit tests over the pure renderer libs — the logic that every surface
// shares and that regressions silently break. Run with `npm test`.
import { describe, it, expect } from 'vitest'
import { hexToRgb, rgba } from '../src/renderer/src/lib/ui.js'
import { classify, detectLimit, stripAnsi, summarize } from '../src/renderer/src/lib/agentActivity.js'
import { parseIntent, runningTargets, agentIdFromToken } from '../src/renderer/src/lib/seducia.js'
import { formatCredits } from '../src/renderer/src/lib/dictation.js'

describe('ui color helpers', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#ff6b9d')).toEqual({ r: 255, g: 107, b: 157 })
  })
  it('parses 3-digit hex', () => {
    expect(hexToRgb('#f0a')).toEqual({ r: 255, g: 0, b: 170 })
  })
  it('falls back to the pink accent on garbage', () => {
    expect(hexToRgb('not-a-color')).toEqual({ r: 255, g: 107, b: 157 })
  })
  it('builds rgba strings', () => {
    expect(rgba('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)')
  })
})

describe('agent activity classifier', () => {
  const now = 1_000_000
  it('classifies streaming output as working', () => {
    expect(classify({ tail: 'building...', lastDataAt: now - 200, startedAt: now - 5000 }, now)).toBe('working')
  })
  it('classifies a fresh silent session as booting', () => {
    expect(classify({ tail: '', lastDataAt: 0, startedAt: now - 1000 }, now)).toBe('booting')
  })
  it('classifies an exited session by exit code', () => {
    expect(classify({ exited: true, exitCode: 0 }, now)).toBe('done')
    expect(classify({ exited: true, exitCode: 1 }, now)).toBe('error')
  })
  it('flags agent y/n prompts as waiting, but never for plain shells', () => {
    const rec = { tail: 'Overwrite? [y/N]', lastDataAt: now - 5000, startedAt: now - 60000 }
    expect(classify({ ...rec, isAgent: true }, now)).toBe('waiting')
    expect(classify({ ...rec, isAgent: false }, now)).toBe('idle')
  })
  it('detects usage-limit signatures, not casual mentions', () => {
    expect(detectLimit('Error: usage limit reached, resets at 4pm')).toBe(true)
    expect(detectLimit('I set a limit of 5 retries')).toBe(false)
  })
  it('strips ANSI escapes', () => {
    expect(stripAnsi('[31mred[0m')).toBe('red')
  })
  it('summarize tallies states', () => {
    expect(summarize({ a: 'working', b: 'working', c: 'idle' }).working).toBe(2)
  })
})

describe('seducia intent parser', () => {
  it('parses "tell claude ..." into a prompt intent', () => {
    const i = parseIntent('tell claude to run the tests', null, [])
    expect(i).toMatchObject({ type: 'prompt', target: 'claude' })
    expect(i.text).toMatch(/run the tests/)
  })
  it('parses counts into launch intents', () => {
    const i = parseIntent('3 claude', '/tmp', [])
    expect(i.type).toBe('launch')
    expect(i.agents.find(a => a.id === 'claude')?.count).toBe(3)
  })
  it('parses status queries', () => {
    expect(parseIntent("what's running", null, []).type).toBe('status')
  })
  it('resolves agent synonyms', () => {
    expect(agentIdFromToken('everyone')).toBe('all')
    expect(agentIdFromToken('powershell')).toBe('shell')
  })
  it('matches running targets by agent, then label', () => {
    const tabs = [
      { id: '1', agentId: 'claude', label: 'Builder', status: 'running' },
      { id: '2', agentId: 'codex', label: 'Reviewer', status: 'running' },
      { id: '3', agentId: 'claude', label: 'Old', status: 'exited' }
    ]
    expect(runningTargets(tabs, 'claude').map(t => t.id)).toEqual(['1'])
    expect(runningTargets(tabs, 'reviewer').map(t => t.id)).toEqual(['2'])
    expect(runningTargets(tabs, 'all')).toHaveLength(2)
  })
})

describe('quiet credits formatting', () => {
  it('formats large balances in minutes', () => {
    expect(formatCredits(660)).toBe('11m left')
  })
  it('formats mixed minutes and seconds', () => {
    expect(formatCredits(95)).toBe('1m 35s left')
  })
  it('formats sub-minute balances in seconds', () => {
    expect(formatCredits(42)).toBe('42s left')
  })
  it('clamps negatives to zero', () => {
    expect(formatCredits(-5)).toBe('0s left')
  })
})
