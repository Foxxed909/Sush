import { describe, expect, it } from 'vitest'
import { applyXpTick, deskPeek, levelFor, nextNeedsYou, officeHeadcount, officeState } from '../src/renderer/src/lib/officeStats.js'
import { buildInteriorLayout } from '../src/renderer/src/lib/officeLayout.js'
import { broadcastTargetIds } from '../src/renderer/src/lib/terminalInput.js'

const tab = (id, extra = {}) => ({ id, agentId: 'claude', cwd: '/w/a', status: 'running', ...extra })

describe('officeState', () => {
  it('ranks limit over exited over activity', () => {
    expect(officeState(tab('a', { status: 'exited' }), { a: 'working' }, { a: true })).toBe('limit')
    expect(officeState(tab('a', { status: 'exited' }), { a: 'working' }, {})).toBe('error')
    expect(officeState(tab('a'), { a: 'waiting' }, {})).toBe('waiting')
    expect(officeState(tab('a'), {}, {})).toBe('idle')
    expect(officeState(null)).toBe('idle')
  })

  it('headcount counts exited sessions as errors', () => {
    const counts = officeHeadcount([tab('a', { status: 'exited' }), tab('b')], { b: 'booting' }, {})
    expect(counts).toMatchObject({ total: 2, error: 1, working: 1, idle: 0 })
  })
})

describe('nextNeedsYou', () => {
  const tabs = [tab('a'), tab('b'), tab('c'), tab('d')]
  const states = { a: 'working', b: 'waiting', c: 'idle', d: 'waiting' }

  it('returns null when nobody needs you', () => {
    expect(nextNeedsYou(tabs, { a: 'working' }, {})).toBeNull()
  })

  it('puts waiting before limits and cycles in tab order', () => {
    const limits = { c: true }
    expect(nextNeedsYou(tabs, states, limits, null)).toBe('b')
    expect(nextNeedsYou(tabs, states, limits, 'b')).toBe('d')
    expect(nextNeedsYou(tabs, states, limits, 'd')).toBe('c')
    expect(nextNeedsYou(tabs, states, limits, 'c')).toBe('b')
  })

  it('starts over when the last jump target no longer needs you', () => {
    expect(nextNeedsYou(tabs, states, {}, 'a')).toBe('b')
  })
})

describe('deskPeek', () => {
  it('prefers the last assistant reply from the Thread', () => {
    const items = [
      { type: 'assistant', text: 'first' },
      { type: 'tool_use', text: 'ls' },
      { type: 'assistant', text: '  final\n answer  ' },
      { type: 'tool_result', text: 'ok' }
    ]
    expect(deskPeek({ items, tail: 'prompt $' })).toEqual({ source: 'thread', text: 'final answer' })
  })

  it('falls back to the last non-blank terminal line', () => {
    expect(deskPeek({ items: [], tail: 'one\n  two  \n\n   \n' })).toEqual({ source: 'terminal', text: 'two' })
  })

  it('returns null when there is nothing to show, and clips long text', () => {
    expect(deskPeek({ tail: '\n\n' })).toBeNull()
    const long = deskPeek({ tail: 'x'.repeat(500) }, 20)
    expect(long.text).toHaveLength(20)
    expect(long.text.endsWith('…')).toBe(true)
  })
})

describe('broadcastTargetIds', () => {
  const tabs = [
    tab('a', { cwd: '/w/one', groupId: 'g1' }),
    tab('b', { cwd: '/w/one' }),               // same folder, launched separately
    tab('c', { cwd: '/w/two', groupId: 'g1' }) // same launch group, other project
  ]

  it('is null while broadcast is off', () => {
    expect(broadcastTargetIds(tabs, tabs[0], { mode: false, scope: 'workspace' })).toBeNull()
  })

  it('reaches everyone in the all scope', () => {
    expect(broadcastTargetIds(tabs, tabs[0], { mode: true, scope: 'all' })).toEqual(['a', 'b', 'c'])
  })

  it('fences a workspace broadcast to the project folder, not the launch group', () => {
    expect(broadcastTargetIds(tabs, tabs[0], { mode: true, scope: 'workspace' })).toEqual(['a', 'b'])
    expect(broadcastTargetIds(tabs, tabs[2], { mode: true, scope: 'workspace' })).toEqual(['c'])
  })

  it('a folderless session is its own fence', () => {
    const solo = { id: 's', status: 'running' }
    expect(broadcastTargetIds([...tabs, solo], solo, { mode: true, scope: 'workspace' })).toEqual(['s'])
  })
})

describe('office layout + XP', () => {
  it('reports sessions past the desk cap as overflow', () => {
    const many = Array.from({ length: 18 }, (_, i) => tab(`t${i}`))
    const interior = buildInteriorLayout(many, 'cwd:/w/a')
    expect(interior.desks.filter(d => d.tabId)).toHaveLength(15)
    expect(interior.overflow).toBe(3)
  })

  it('awards a finished turn and levels at 50·n²', () => {
    const { ledger, gained } = applyXpTick({ agents: {}, offices: {} }, { tabKey: 'k', officeKey: 'o', prevState: 'working', state: 'waiting' })
    expect(gained).toBe(15)
    expect(ledger.offices.o).toBe(15)
    expect(levelFor(200).level).toBe(2)
  })
})
