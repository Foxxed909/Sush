import { describe, expect, it } from 'vitest'
import { buildAgentCommand, effortOptionsFor, normalizeEffort, normalizeModel } from '../src/renderer/src/lib/nightlyModels.js'

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
})
