import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addCustomAgent, loadCustomAgents, removeCustomAgent } from '../src/renderer/src/lib/agents.js'

const storage = new Map()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('localStorage', {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value))
  })
})

describe('custom agents', () => {
  it('rejects additions beyond the stored limit instead of reporting false success', () => {
    for (let i = 0; i < 12; i++) {
      expect(addCustomAgent({ label: `Agent ${i}`, command: `agent-${i}` }).ok).toBe(true)
    }

    expect(addCustomAgent({ label: 'Overflow', command: 'overflow' })).toEqual({
      ok: false,
      error: 'You can add up to 12 custom agents'
    })
    expect(loadCustomAgents()).toHaveLength(12)
    expect(loadCustomAgents().some(agent => agent.label === 'Overflow')).toBe(false)

    removeCustomAgent(loadCustomAgents()[0].id)
    expect(addCustomAgent({ label: 'Replacement', command: 'replacement' }).ok).toBe(true)
    expect(loadCustomAgents()).toHaveLength(12)
  })

  it('accepts valid CSS hex colors and falls back for malformed lengths', () => {
    for (const color of ['#abc', '#abcd', '#a1b2c3', '#a1b2c3d4']) {
      expect(addCustomAgent({ label: color, command: 'agent', color }).ok).toBe(true)
    }

    expect(loadCustomAgents().map(agent => agent.color)).toEqual([
      '#abc', '#abcd', '#a1b2c3', '#a1b2c3d4'
    ])

    storage.set('sush-custom-agents', JSON.stringify([
      { id: 'five', label: 'Five', command: 'five', color: '#12345' },
      { id: 'seven', label: 'Seven', command: 'seven', color: '#1234567' }
    ]))
    expect(loadCustomAgents().map(agent => agent.color)).toEqual(['#8b9bb0', '#8b9bb0'])
  })
})

describe('exactResumeCommand', () => {
  it('resumes a bound conversation by id and refuses unsafe ids', async () => {
    const { exactResumeCommand } = await import('../src/renderer/src/lib/agents.js')
    expect(exactResumeCommand('claude', '123e4567-e89b-42d3-a456-426614174000')).toBe('claude --resume 123e4567-e89b-42d3-a456-426614174000')
    expect(exactResumeCommand('codex', '0199a2b3-c4d5-7e6f-8a9b-0c1d2e3f4a5b')).toBe('codex resume 0199a2b3-c4d5-7e6f-8a9b-0c1d2e3f4a5b')
    expect(exactResumeCommand('gemini', '123e4567-e89b-42d3-a456-426614174000')).toBeNull()
    expect(exactResumeCommand('claude', 'abc; rm -rf ~')).toBeNull()
    expect(exactResumeCommand('claude', '--dangerously-skip')).toBeNull()
    expect(exactResumeCommand('claude', '')).toBeNull()
  })
})
