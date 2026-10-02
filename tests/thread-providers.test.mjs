import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  augmentCodexCommand, codexConfigDefinesHooks, compareVersions, geminiThreadHooksEnabled,
  parseCodexRollout, parseGeminiChat, setGeminiCompressionThreshold, setGeminiThreadHooks,
  validCodexTranscriptPath, validGeminiTranscriptPath, withGeminiThreadHooks
} from '../src/main/thread-providers.js'
import { parseThreadEvents, prepareThreadEventFile, readThread } from '../src/main/thread-bridge.js'
import { buildCapabilities } from '../src/main/provider-capabilities.js'
import { budgetRange, clampBudget, geminiThreshold } from '../src/renderer/src/lib/contextBudget.js'
import { changedFilesFromSteps, latestContextTokens } from '../src/renderer/src/lib/threadTurns.js'
import { contextWindowFor } from '../src/renderer/src/lib/nightlyModels.js'

const CODEX_SID = '01a0eee6-cf2d-7bd0-8a62-de92025d192d'
const GEMINI_SID = 'dea883fa-a64e-41df-a9e7-017ae804e321'
const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'sush-tp-')); dirs.push(d); return d }
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }) })

// Records in the shapes Codex 0.159 and Gemini 0.61 actually wrote.
const codexRollout = [
  { type: 'session_meta', payload: { id: CODEX_SID, cwd: '/p' } },
  { type: 'event_msg', payload: { type: 'task_started', model_context_window: 258400 } },
  { type: 'turn_context', payload: { model: 'gpt-6-astra' } },
  { type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: '<skills_instructions>…' }] } },
  { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>\n<cwd>/p</cwd>' }] } },
  { type: 'response_item', timestamp: '2026-09-29T20:41:40.000Z', payload: { type: 'message', id: 'u1', role: 'user', content: [{ type: 'input_text', text: 'fix the test' }] } },
  { type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'c1', arguments: '{"cmd":"npm test"}' } },
  { type: 'response_item', payload: { type: 'function_call_output', call_id: 'c1', output: '{"output":"1 failing","metadata":{"exit_code":1}}' } },
  { type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', call_id: 'c2', input: '*** Begin Patch\n*** Update File: src/a.js\n@@\n-old\n+new\n+more\n*** End Patch' } },
  { type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'c2', output: 'Success' } },
  { type: 'response_item', timestamp: '2026-09-29T20:41:50.000Z', payload: { type: 'message', id: 'a1', role: 'assistant', content: [{ type: 'output_text', text: 'Fixed.' }] } },
  { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 12000, cached_input_tokens: 8000, output_tokens: 300 }, model_context_window: 258400 } } }
].map(r => JSON.stringify(r)).join('\n')

const geminiChat = [
  { sessionId: GEMINI_SID, projectHash: 'x', startTime: 't', kind: 'main' },
  { $set: { messages: [{ id: 'ctx', type: 'user', content: [{ text: '<session_context>\nThis is the Gemini CLI.' }] }] } },
  { id: 'u1', timestamp: 't1', type: 'user', content: [{ text: 'rename foo' }] },
  { id: 'g1', timestamp: 't2', type: 'gemini', content: '', toolCalls: [{ id: 'tc1', name: 'replace', args: { file_path: 'a.js', old_string: 'foo', new_string: 'bar' }, status: 'success', result: [{ functionResponse: { response: { output: 'ok' } } }] }] },
  { id: 'g1', timestamp: 't2', type: 'gemini', content: '', toolCalls: [{ id: 'tc1', name: 'replace', args: { file_path: 'a.js', old_string: 'foo', new_string: 'bar' }, status: 'success', result: [{ functionResponse: { response: { output: 'ok' } } }] }], tokens: { input: 5000, output: 40, cached: 1000, thoughts: 0, tool: 0, total: 5040 } },
  { id: 'g2', timestamp: 't3', type: 'gemini', content: 'Renamed.', tokens: { input: 5100, output: 10, cached: 0, total: 5110 } }
].map(r => JSON.stringify(r)).join('\n')

describe('Codex thread adapter', () => {
  it('parses a rollout into Thread items and skips injected context', () => {
    const { items, contextWindow } = parseCodexRollout(codexRollout, CODEX_SID)
    expect(contextWindow).toBe(258400)
    expect(items.filter(i => i.type === 'user').map(i => i.text)).toEqual(['fix the test'])
    const bash = items.find(i => i.type === 'tool_use' && i.name === 'Bash')
    expect(bash.input.command).toBe('npm test')
    expect(items.find(i => i.type === 'tool_result' && i.toolUseId === 'c1')).toMatchObject({ isError: true, text: '1 failing' })
    expect(items.find(i => i.name === 'Patch').input.description).toBe('src/a.js')
    expect(latestContextTokens(items)).toBe(12300)
  })

  it('refuses a rollout whose header names another session', () => {
    expect(parseCodexRollout(codexRollout, '01a0eee6-0000-7000-8000-000000000000').items).toEqual([])
  })

  it('counts apply_patch edits as changed files', () => {
    const { items } = parseCodexRollout(codexRollout, CODEX_SID)
    const use = items.find(i => i.name === 'Patch')
    expect(changedFilesFromSteps([{ use, result: null }])).toEqual([{ path: 'src/a.js', added: 2, removed: 1 }])
  })

  it('validates rollout paths by session id', () => {
    expect(validCodexTranscriptPath(`/h/.codex/sessions/2026/09/29/rollout-2026-09-29T20-41-38-${CODEX_SID}.jsonl`, CODEX_SID)).toBe(true)
    expect(validCodexTranscriptPath(`/h/.codex/sessions/rollout-x-${CODEX_SID}.jsonl`, GEMINI_SID)).toBe(false)
    expect(validCodexTranscriptPath('/etc/passwd', CODEX_SID)).toBe(false)
  })

  it('adds per-launch hooks and the budget right after `codex`', () => {
    const out = augmentCodexCommand('codex resume --last', { shellId: 'zsh', platform: 'darwin', budget: 150000 })
    expect(out.thread).toBe(true)
    expect(out.command.startsWith("codex -c 'hooks.SessionStart=")).toBe(true)
    expect(out.command).toContain('-c model_auto_compact_token_limit=150000 resume --last')
    expect(out.command).not.toMatch(/\/(Users|home)\//) // never a path in the command
  })

  it('stays out of the way where hooks cannot be added safely', () => {
    expect(augmentCodexCommand('codex', { shellId: 'pwsh', platform: 'win32' }).thread).toBe(false)
    expect(augmentCodexCommand('codex | tee log', { shellId: 'bash' })).toEqual({ command: 'codex | tee log', thread: false })
    expect(augmentCodexCommand('codex', { shellId: 'bash', configText: '[hooks.Stop]\ncommand = "x"' }).thread).toBe(false)
    expect(augmentCodexCommand('codex', { shellId: 'bash', thread: false, budget: 90000 }).command).toBe('codex -c model_auto_compact_token_limit=90000')
    expect(codexConfigDefinesHooks('[[hooks.SessionStart]]\n')).toBe(true)
    expect(codexConfigDefinesHooks('model = "gpt"\n')).toBe(false)
  })

  it('only claims Codex Thread on a CLI verified to support it', () => {
    const help = '-c, --config <key=value>\n'
    expect(buildCapabilities('codex', { installed: true, version: '0.159.0', help }).threadBridge).toBe(true)
    expect(buildCapabilities('codex', { installed: true, version: '0.120.4', help }).threadBridge).toBe(false)
    expect(compareVersions('0.160.1', '0.159.0')).toBe(1)
  })
})

describe('Gemini thread adapter', () => {
  it('replays upserts and $set, maps tools and keeps usage', () => {
    const { items } = parseGeminiChat(geminiChat, GEMINI_SID)
    expect(items.filter(i => i.type === 'user').map(i => i.text)).toEqual(['rename foo'])
    expect(items.filter(i => i.type === 'tool_use')).toHaveLength(1)
    const edit = items.find(i => i.type === 'tool_use')
    expect(edit).toMatchObject({ name: 'Edit', input: { file_path: 'a.js' } })
    expect(edit.usage).toBeTruthy()
    expect(items.find(i => i.type === 'tool_result').text).toBe('ok')
    expect(latestContextTokens(items)).toBe(5110)
  })

  it('treats BeforeAgent/AfterAgent as turn boundaries', () => {
    const events = [
      { session_id: GEMINI_SID, transcript_path: '/t', hook_event_name: 'SessionStart' },
      { session_id: GEMINI_SID, hook_event_name: 'BeforeAgent', prompt: 'hi' }
    ].map(e => JSON.stringify(e)).join('\n')
    const meta = parseThreadEvents(events)
    expect(meta.state).toBe('working')
    expect(meta.prompts.map(p => p.text)).toEqual(['hi'])
    expect(parseThreadEvents(`${events}\n${JSON.stringify({ session_id: GEMINI_SID, hook_event_name: 'AfterAgent' })}`).state).toBe('idle')
  })

  it('validates chat paths', () => {
    expect(validGeminiTranscriptPath(`/h/.gemini/tmp/proj/chats/session-2026-09-29T20-36-${GEMINI_SID.slice(0, 8)}.jsonl`, GEMINI_SID)).toBe(true)
    expect(validGeminiTranscriptPath('/h/.gemini/tmp/proj/session-x.jsonl', GEMINI_SID)).toBe(false)
  })

  it('adds and removes exactly its own hook, keeping the user’s', () => {
    const user = { theme: 'x', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }
    const on = withGeminiThreadHooks(user, true, 'linux')
    expect(geminiThreadHooksEnabled(on)).toBe(true)
    expect(on.hooks.SessionStart).toHaveLength(2)
    expect(withGeminiThreadHooks(on, true, 'linux').hooks.SessionStart).toHaveLength(2) // idempotent
    const off = withGeminiThreadHooks(on, false, 'linux')
    expect(off).toEqual(user)
  })

  it('writes the opt-in and threshold into the Gemini settings file', () => {
    const home = tmp()
    const env = { GEMINI_CLI_HOME: home }
    mkdirSync(join(home, '.gemini'))
    writeFileSync(join(home, '.gemini', 'settings.json'), JSON.stringify({ model: { name: 'gemini-2.5-pro' } }))
    expect(setGeminiThreadHooks(env, true, 'linux')).toBe(true)
    expect(setGeminiCompressionThreshold(env, 0.4)).toBe(0.4)
    const saved = JSON.parse(readFileSync(join(home, '.gemini', 'settings.json'), 'utf8'))
    expect(saved.model).toEqual({ name: 'gemini-2.5-pro', compressionThreshold: 0.4 })
    expect(saved.hooks.BeforeAgent[0].hooks[0].command).toContain('SUSH_THREAD_EVENT_PATH')
    expect(setGeminiCompressionThreshold(env, null)).toBe(null)
  })

  it('reads a bound Gemini session end to end, only under its roots', () => {
    const userData = tmp()
    const home = tmp()
    const chat = join(home, '.gemini', 'tmp', 'proj', 'chats', `session-2026-09-29T20-36-${GEMINI_SID.slice(0, 8)}.jsonl`)
    mkdirSync(join(home, '.gemini', 'tmp', 'proj', 'chats'), { recursive: true })
    writeFileSync(chat, geminiChat)
    const events = prepareThreadEventFile(userData, 'tab-g')
    writeFileSync(events, JSON.stringify({ session_id: GEMINI_SID, transcript_path: chat, hook_event_name: 'SessionStart' }) + '\n')
    const roots = [join(home, '.gemini', 'tmp')]
    const result = readThread(userData, 'tab-g', { roots, provider: 'gemini' })
    expect(result).toMatchObject({ ok: true, bound: true, provider: 'gemini', transcriptAvailable: true })
    expect(result.items.length).toBeGreaterThan(2)
    const outside = readThread(userData, 'tab-g', { roots: [join(tmp(), 'elsewhere')], provider: 'gemini' })
    expect(outside.transcriptAvailable).toBe(false)
  })
})

describe('context budget', () => {
  it('spans the CLI floor to the model window', () => {
    expect(budgetRange('claude', 200_000)).toMatchObject({ min: 100_000, max: 200_000 })
    expect(budgetRange('codex', 258_400).min).toBe(10_000)
    expect(budgetRange('opencode', 200_000)).toBe(null)
    expect(budgetRange('codex', null)).toBe(null)
  })

  it('clamps, and treats the full window as "no budget"', () => {
    expect(clampBudget('claude', 1, 200_000)).toBe(100_000)
    expect(clampBudget('claude', 150_000, 200_000)).toBe(150_000)
    expect(clampBudget('claude', 200_000, 200_000)).toBe(null)
    expect(clampBudget('codex', 1, 258_400)).toBe(10_000)
  })

  it('converts Gemini budgets to its threshold fraction', () => {
    expect(geminiThreshold(524_288, 1_048_576)).toBe(0.5)
    expect(geminiThreshold(1, 1_048_576)).toBe(0.01)
  })

  it('prefers the window a CLI reports', () => {
    expect(contextWindowFor('codex', 'gpt-6-astra', 258_400)).toBe(258_400)
    expect(contextWindowFor('claude', 'haiku')).toBe(200_000)
    expect(contextWindowFor('gemini', 'gemini-2.5-pro')).toBe(1_048_576)
  })
})
