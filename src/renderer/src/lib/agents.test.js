import { describe, it, expect } from 'vitest'
import { BUILTIN_AGENTS, agentById, LOGIN_COMMANDS, MAX_SESSIONS, AGENTS } from './agents.js'

describe('builtin agents', () => {
  it('includes the core CLIs', () => {
    const ids = BUILTIN_AGENTS.map((a) => a.id)
    expect(ids).toContain('shell')
    expect(ids).toContain('claude')
    expect(ids).toContain('codex')
    expect(ids).toContain('gemini')
  })

  it('AGENTS aliases the builtin list', () => {
    expect(AGENTS).toBe(BUILTIN_AGENTS)
  })
})

describe('agentById', () => {
  it('resolves a known agent', () => {
    expect(agentById('claude')?.label).toBe('Claude Code')
  })
  it('returns null for an unknown id', () => {
    expect(agentById('nope')).toBeNull()
  })
})

describe('login commands', () => {
  it('defines a sign-in for each cloud CLI', () => {
    for (const id of ['claude', 'codex', 'gemini', 'opencode']) {
      expect(LOGIN_COMMANDS[id]).toBeTruthy()
      expect(typeof LOGIN_COMMANDS[id].command).toBe('string')
    }
  })
})

describe('MAX_SESSIONS', () => {
  it('caps the swarm at a sane number', () => {
    expect(MAX_SESSIONS).toBeGreaterThanOrEqual(1)
    expect(MAX_SESSIONS).toBeLessThanOrEqual(64)
  })
})
