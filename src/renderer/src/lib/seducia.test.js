import { describe, it, expect } from 'vitest'
import {
  agentIdFromToken,
  parseIntent,
  runningTargets,
  summarize,
  targetName,
  pathLabel
} from './seducia.js'

describe('agentIdFromToken', () => {
  it('maps known synonyms to agent ids', () => {
    expect(agentIdFromToken('claude')).toBe('claude')
    expect(agentIdFromToken('terminal')).toBe('shell')
    expect(agentIdFromToken('open code')).toBe('opencode')
  })
  it('maps collective words to "all"', () => {
    expect(agentIdFromToken('everyone')).toBe('all')
    expect(agentIdFromToken('team')).toBe('all')
  })
  it('returns null for unknown tokens', () => {
    expect(agentIdFromToken('banana')).toBeNull()
    expect(agentIdFromToken('')).toBeNull()
  })
})

describe('pathLabel', () => {
  it('returns the last path segment', () => {
    expect(pathLabel('/home/user/project')).toBe('project')
    expect(pathLabel('C:\\dev\\sush\\')).toBe('sush')
  })
  it('falls back for empty input', () => {
    expect(pathLabel('')).toBe('this directory')
  })
})

describe('parseIntent', () => {
  it('detects a status request', () => {
    expect(parseIntent('status').type).toBe('status')
    expect(parseIntent("what's running").type).toBe('status')
  })

  it('parses "agent: message" into a prompt', () => {
    expect(parseIntent('claude: fix the failing test')).toEqual({
      type: 'prompt',
      target: 'claude',
      text: 'fix the failing test'
    })
  })

  it('parses a "tell <agent> ..." verb form', () => {
    const r = parseIntent('tell codex to refactor this')
    expect(r.type).toBe('prompt')
    expect(r.target).toBe('codex')
    expect(r.text).toBe('refactor this')
  })

  it('parses a focus command', () => {
    expect(parseIntent('focus codex')).toEqual({ type: 'focus', target: 'codex' })
  })

  it('parses an agent count into a launch', () => {
    const r = parseIntent('3 claude', '/work')
    expect(r.type).toBe('launch')
    expect(r.cwd).toBe('/work')
    const claude = r.agents.find((a) => a.id === 'claude')
    expect(claude.count).toBe(3)
  })

  it('parses a team launch', () => {
    const r = parseIntent('build team here', '/work')
    expect(r.type).toBe('launch')
    expect(r.agents.length).toBeGreaterThan(1)
  })

  it('falls back to a plain run for arbitrary text', () => {
    expect(parseIntent('git push origin main')).toEqual({
      type: 'run',
      input: 'git push origin main'
    })
  })
})

describe('runningTargets', () => {
  const tabs = [
    { agentId: 'claude', label: 'Claude Code', status: 'running' },
    { agentId: 'claude', label: 'Claude Code 2', status: 'running' },
    { agentId: 'codex', label: 'Codex', status: 'exited' }
  ]

  it('returns every live tab for "all"', () => {
    expect(runningTargets(tabs, 'all')).toHaveLength(2)
  })
  it('filters by agent id', () => {
    expect(runningTargets(tabs, 'claude')).toHaveLength(2)
  })
  it('matches a specific session label', () => {
    const r = runningTargets(tabs, 'Claude Code 2')
    expect(r).toHaveLength(1)
    expect(r[0].label).toBe('Claude Code 2')
  })
})

describe('summarize / targetName', () => {
  it('summarizes agent counts', () => {
    expect(summarize([{ count: 2, label: 'Claude' }, { count: 1, label: 'Codex' }])).toBe(
      '2x Claude, 1x Codex'
    )
  })
  it('names the "all" target', () => {
    expect(targetName('all')).toBe('agents')
  })
})
