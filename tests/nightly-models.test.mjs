import { describe, expect, it } from 'vitest'
import { buildAgentCommand, effortOptionsFor, normalizeEffort, normalizeModel, normalizePermission, permissionModesFor } from '../src/renderer/src/lib/nightlyModels.js'

const agent = (id, command, resumeCommand) => ({ id, command, resumeCommand })

describe('Nightly model launch adapter', () => {
  it('adds a verified model flag without changing the provider base command', () => {
    expect(buildAgentCommand(agent('claude', 'claude', 'claude --continue'), { model: 'opus' }))
      .toBe('claude --model opus')
    expect(buildAgentCommand(agent('gemini', 'gemini'), { model: 'flash' }))
      .toBe('gemini --model flash')
    expect(buildAgentCommand(agent('opencode', 'opencode'), { model: 'anthropic/claude-sonnet-4-5' }))
      .toBe('opencode --model anthropic/claude-sonnet-4-5')
  })

  it('keeps the selected model when restoring a resumable session', () => {
    expect(buildAgentCommand(agent('codex', 'codex', 'codex resume --last'), { model: 'gpt-5.3-codex', resume: true }))
      .toBe('codex resume --last --model gpt-5.3-codex')
  })

  it('adds provider-native reasoning controls only for verified providers', () => {
    expect(buildAgentCommand(agent('claude', 'claude', 'claude --continue'), { model: 'opus', effort: 'high' }))
      .toBe('claude --model opus --effort high')
    expect(buildAgentCommand(agent('codex', 'codex', 'codex resume --last'), { model: 'gpt-5.3-codex', effort: 'xhigh' }))
      .toBe('codex --model gpt-5.3-codex --config "model_reasoning_effort=\'xhigh\'"')
    expect(normalizeEffort('claude', 'banana')).toBeNull()
    expect(normalizeEffort('claude', 'ultracode')).toBeNull()
    expect(normalizeEffort('gemini', 'high')).toBeNull()
  })

  it('narrows Codex reasoning choices for verified model catalogs', () => {
    expect(effortOptionsFor('codex', 'gpt-5.3-codex'))
      .toEqual(['', 'low', 'medium', 'high', 'xhigh'])
    expect(normalizeEffort('codex', 'minimal', 'gpt-5.3-codex')).toBeNull()
    expect(normalizeEffort('codex', 'xhigh', 'gpt-5.3-codex')).toBe('xhigh')
    expect(buildAgentCommand(agent('codex', 'codex'), { model: 'gpt-5.3-codex', effort: 'minimal' }))
      .toBe('codex --model gpt-5.3-codex')
  })

  it('does not append model text for providers without a verified model flag', () => {
    expect(buildAgentCommand(agent('grok', 'grok', 'grok --continue'), { model: 'anything' }))
      .toBe('grok')
  })

  it('rejects shell metacharacters instead of interpolating them into a command', () => {
    expect(normalizeModel('claude', 'opus && rm -rf /')).toBeNull()
    expect(buildAgentCommand(agent('claude', 'claude'), { model: 'opus && echo nope' }))
      .toBe('claude')
  })

  it('rejects unsupported Claude effort names instead of forwarding them', () => {
    expect(buildAgentCommand(agent('claude', 'claude'), { model: 'opus', effort: 'ultracode' }))
      .toBe('claude --model opus')
  })

  it('treats blank/default selection as provider-owned behavior', () => {
    expect(normalizeModel('gemini', '')).toBeNull()
    expect(buildAgentCommand(agent('gemini', 'gemini'), { model: '' })).toBe('gemini')
  })

  it('rejects model ids that the CLI would parse as flags', () => {
    expect(normalizeModel('claude', '--dangerously-skip-permissions')).toBeNull()
    expect(normalizeModel('claude', '-p')).toBeNull()
    expect(buildAgentCommand(agent('claude', 'claude'), { model: '--dangerously-skip-permissions' }))
      .toBe('claude')
    expect(normalizeModel('opencode', 'anthropic/claude-sonnet-4-5')).toBe('anthropic/claude-sonnet-4-5')
    expect(normalizeModel('codex', 'gpt-5.3-codex')).toBe('gpt-5.3-codex')
  })
})

describe('permission modes', () => {
  const claude = { id: 'claude', command: 'claude', resumeCommand: 'claude --continue' }
  const codex = { id: 'codex', command: 'codex', resumeCommand: 'codex resume --last' }
  const gemini = { id: 'gemini', command: 'gemini', resumeCommand: 'gemini --resume latest' }
  it('maps each mode onto the CLI flag', () => {
    expect(buildAgentCommand(claude, { permission: 'plan' })).toBe('claude --permission-mode plan')
    expect(buildAgentCommand(claude, { permission: 'full', resume: true })).toBe('claude --continue --permission-mode bypassPermissions')
    expect(buildAgentCommand(codex, { permission: 'edits' })).toBe('codex -s workspace-write')
    expect(buildAgentCommand(codex, { permission: 'full' })).toBe('codex --dangerously-bypass-approvals-and-sandbox')
    expect(buildAgentCommand(gemini, { permission: 'edits' })).toBe('gemini --approval-mode auto_edit')
  })
  it('drops unknown or unsupported modes', () => {
    expect(buildAgentCommand(claude, { permission: 'rm -rf' })).toBe('claude')
    expect(buildAgentCommand(gemini, { permission: 'auto' })).toBe('gemini')
    expect(normalizePermission('opencode', 'plan')).toBe(null)
    expect(normalizePermission('opencode', 'full')).toBe('full')
  })
  it('offers only modes the provider has', () => {
    expect(permissionModesFor('claude').map(m => m.value)).toEqual(['', 'ask', 'plan', 'edits', 'auto', 'full'])
    expect(permissionModesFor('gemini').map(m => m.value)).toEqual(['', 'ask', 'plan', 'edits', 'full'])
    expect(permissionModesFor('shell')).toEqual([])
  })
  it('combines with model and effort', () => {
    expect(buildAgentCommand(claude, { model: 'claude-opus-5-5', effort: 'high', permission: 'edits' }))
      .toBe('claude --permission-mode acceptEdits --model claude-opus-5-5 --effort high')
  })
})
