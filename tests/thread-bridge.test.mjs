import { describe, expect, it } from 'vitest'
import {
  augmentClaudeCommand,
  claudeHookSettings,
  parseClaudeTranscript,
  parseThreadEvents,
  validClaudeTranscriptPath
} from '../src/main/thread-bridge.js'

const SID = '123e4567-e89b-42d3-a456-426614174000'

describe('Claude thread bridge', () => {
  it('adds a Sush hook settings source only to Claude commands', () => {
    expect(augmentClaudeCommand('claude --model sonnet', '/tmp/sush hooks.json', { shellId: 'bash', platform: 'linux' }))
      .toBe("claude --model sonnet --settings '/tmp/sush hooks.json'")
    expect(augmentClaudeCommand('claude', "C:\\Users\\Taylor\\Sush Data\\hooks.json", { shellId: 'powershell', platform: 'win32' }))
      .toBe("claude --settings 'C:\\Users\\Taylor\\Sush Data\\hooks.json'")
    expect(augmentClaudeCommand('codex', '/tmp/hooks.json')).toBe('codex')
    expect(augmentClaudeCommand('claude --settings mine.json', '/tmp/hooks.json')).toBe('claude --settings mine.json')
  })

  it('configures only bounded lifecycle hooks, not every tool call', () => {
    const hooks = claudeHookSettings('linux').hooks
    expect(Object.keys(hooks)).toEqual(['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'])
    expect(hooks.PreToolUse).toBeUndefined()
    expect(hooks.SessionStart[0].hooks[0].command).toContain('SUSH_THREAD_EVENT_PATH')
  })

  it('binds the real interactive session id and lifecycle from hook events', () => {
    const rows = [
      { hook_event_name: 'SessionStart', session_id: SID, transcript_path: `/tmp/${SID}.jsonl`, cwd: '/repo' },
      { hook_event_name: 'UserPromptSubmit', session_id: SID, transcript_path: `/tmp/${SID}.jsonl`, cwd: '/repo/src', user_prompt: 'fix it' },
      { hook_event_name: 'Notification', session_id: SID, transcript_path: `/tmp/${SID}.jsonl`, cwd: '/repo/src' }
    ].map(JSON.stringify).join('\n')
    const state = parseThreadEvents(rows)
    expect(state.sessionId).toBe(SID)
    expect(state.transcriptPath).toBe(`/tmp/${SID}.jsonl`)
    expect(state.cwd).toBe('/repo/src')
    expect(state.state).toBe('waiting')
    expect(state.prompts).toEqual([{ text: 'fix it', sessionId: SID, cwd: '/repo/src' }])
  })

  it('parses only structural user/assistant/tool records and never thinking blocks', () => {
    const rows = [
      {
        type: 'user', uuid: 'u1', timestamp: '2026-09-28T20:00:00Z',
        message: { role: 'user', content: 'Please fix tests' }
      },
      {
        type: 'assistant', uuid: 'a1', timestamp: '2026-09-28T20:00:01Z',
        message: {
          role: 'assistant', model: 'claude-sonnet-5',
          content: [
            { type: 'thinking', thinking: 'private reasoning that must not render' },
            { type: 'text', text: 'I found the failure.' },
            { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'npm test' } }
          ],
          usage: { input_tokens: 12, output_tokens: 8 }
        }
      },
      {
        type: 'user', uuid: 'u2',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: '177 passed', is_error: false }]
        }
      }
    ].map(JSON.stringify).join('\n')

    const items = parseClaudeTranscript(rows)
    expect(items.map(x => x.type)).toEqual(['user', 'assistant', 'tool_use', 'tool_result'])
    expect(items.find(x => x.type === 'assistant').text).toBe('I found the failure.')
    expect(JSON.stringify(items)).not.toContain('private reasoning')
    expect(items.find(x => x.type === 'tool_use')).toMatchObject({ name: 'Bash', input: { command: 'npm test' } })
    expect(items.find(x => x.type === 'tool_result')).toMatchObject({ toolUseId: 'tool-1', text: '177 passed', isError: false })
  })

  it('accepts only transcript paths structurally tied to the captured session id', () => {
    expect(validClaudeTranscriptPath(`/home/me/.claude/projects/repo/${SID}.jsonl`, SID)).toBe(true)
    expect(validClaudeTranscriptPath(`/home/me/.claude/projects/repo/${SID}/main.jsonl`, SID)).toBe(true)
    expect(validClaudeTranscriptPath('/etc/passwd.jsonl', SID)).toBe(false)
    expect(validClaudeTranscriptPath('/tmp/other.jsonl', SID)).toBe(false)
  })
})
