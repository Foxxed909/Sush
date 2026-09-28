import { describe, expect, it } from 'vitest'
import { handoffSource, lineageOf, lineageTag } from '../src/renderer/src/lib/lineage.js'

const claude = { id: 'a', agentId: 'claude', label: 'Claude Code' }
const codex = { id: 'b', agentId: 'codex', label: 'Codex', handoffFrom: { id: 'a', agentId: 'claude', label: 'Claude Code' } }

describe('handoff lineage', () => {
  it('reads a valid source and rejects junk', () => {
    expect(handoffSource(codex)).toEqual({ id: 'a', agentId: 'claude', label: 'Claude Code' })
    expect(handoffSource({ handoffFrom: 'x' })).toBeNull()
    expect(handoffSource({ handoffFrom: {} })).toBeNull()
    expect(handoffSource(null)).toBeNull()
  })

  it('links both directions from the live tab list', () => {
    const tabs = [claude, codex]
    expect(lineageOf(codex, tabs).from.id).toBe('a')
    expect(lineageOf(codex, tabs).sourceAlive).toBe(true)
    expect(lineageOf(claude, tabs).to.map(t => t.id)).toEqual(['b'])
  })

  it('forgets the link when the source is closed', () => {
    const l = lineageOf(codex, [codex])
    expect(l.from.id).toBe('a')
    expect(l.sourceAlive).toBe(false)
  })

  it('tags the rail with a direction arrow', () => {
    const name = id => ({ claude: 'claude', codex: 'codex' })[id]
    expect(lineageTag(codex, [claude, codex], name)).toEqual({ arrow: '←', text: 'claude' })
    expect(lineageTag(claude, [claude, codex], name)).toEqual({ arrow: '→', text: 'codex' })
    expect(lineageTag({ id: 'z' }, [claude, codex], name)).toBeNull()
    const two = { ...codex, id: 'c' }
    expect(lineageTag(claude, [claude, codex, two], name).text).toBe('2 handoffs')
  })
})
