import {
  existsSync, mkdirSync, openSync, closeSync, readFileSync, readSync, statSync, unlinkSync, writeFileSync
} from 'fs'
import { basename, dirname, join } from 'path'

export const THREAD_EVENT_LIMIT_BYTES = 512 * 1024
export const THREAD_TRANSCRIPT_LIMIT_BYTES = 4 * 1024 * 1024
const SAFE_TAB = /^[A-Za-z0-9._-]{1,96}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd']

function settingsEnvArg({ shellId = '', platform = process.platform } = {}) {
  const shell = String(shellId || '').toLowerCase()
  if (shell === 'powershell' || shell === 'pwsh') return '"$env:SUSH_CLAUDE_THREAD_SETTINGS"'
  if (platform === 'win32' && (shell === 'cmd' || shell === 'cmd.exe')) return '"%SUSH_CLAUDE_THREAD_SETTINGS%"'
  return '"$SUSH_CLAUDE_THREAD_SETTINGS"'
}

export function claudeHookCommand(platform = process.platform) {
  if (platform === 'win32') {
    return 'powershell -NoProfile -NonInteractive -Command "$d=[Console]::In.ReadToEnd(); Add-Content -LiteralPath $env:SUSH_THREAD_EVENT_PATH -Value $d"'
  }
  return 'sh -c \'cat >> "$SUSH_THREAD_EVENT_PATH"; printf "\\n" >> "$SUSH_THREAD_EVENT_PATH"\''
}

export function claudeHookSettings(platform = process.platform) {
  const command = claudeHookCommand(platform)
  return {
    hooks: Object.fromEntries(HOOK_EVENTS.map(event => [
      event,
      [{ hooks: [{ type: 'command', command, timeout: 5 }] }]
    ]))
  }
}

export function ensureClaudeThreadSettings(userData, platform = process.platform) {
  const root = join(userData, 'thread-bridge')
  mkdirSync(root, { recursive: true })
  const path = join(root, 'claude-hooks.json')
  const json = JSON.stringify(claudeHookSettings(platform), null, 2)
  let current = null
  try { current = readFileSync(path, 'utf8') } catch {}
  if (current !== json) writeFileSync(path, json, { encoding: 'utf8', mode: 0o600 })
  return path
}

export function threadEventPath(userData, tabId) {
  const safe = String(tabId ?? '')
  if (!SAFE_TAB.test(safe)) return null
  const root = join(userData, 'thread-bridge', 'events')
  mkdirSync(root, { recursive: true })
  return join(root, `${safe}.jsonl`)
}

export function prepareThreadEventFile(userData, tabId) {
  const path = threadEventPath(userData, tabId)
  if (!path) return null
  writeFileSync(path, '', { encoding: 'utf8', mode: 0o600 })
  return path
}

export function cleanupThreadEventFile(userData, tabId) {
  const path = threadEventPath(userData, tabId)
  if (!path) return false
  try {
    unlinkSync(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export function augmentClaudeCommand(command, settingsPath, shell = {}) {
  const source = String(command ?? '').trim()
  if (!source || !settingsPath) return source || null
  if (!/^claude(?:\s|$)/i.test(source)) return source
  // Respect an explicit user-provided settings source rather than silently
  // changing its semantics. Built-in Sush Claude launches do not set one.
  if (/(?:^|\s)--settings(?:\s|=)/i.test(source)) return source
  return `${source} --settings ${settingsEnvArg(shell)}`
}

function readTail(path, maxBytes) {
  const stat = statSync(path)
  if (!stat.isFile()) throw new Error('Not a file')
  const size = stat.size
  const length = Math.min(size, maxBytes)
  const start = Math.max(0, size - length)
  const fd = openSync(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, start)
    let text = buffer.toString('utf8')
    if (start > 0) {
      const firstBreak = text.indexOf('\n')
      text = firstBreak >= 0 ? text.slice(firstBreak + 1) : ''
    }
    return { text, truncated: start > 0 }
  } finally {
    closeSync(fd)
  }
}

function parseJsonLines(text) {
  const rows = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const value = line.trim()
    if (!value) continue
    try { rows.push(JSON.parse(value)) } catch {}
  }
  return rows
}

export function parseThreadEvents(text) {
  const rows = parseJsonLines(text)
  let sessionId = null
  let transcriptPath = null
  let cwd = null
  let state = 'starting'
  let lastEvent = null
  const prompts = []

  for (const row of rows) {
    if (UUID.test(String(row.session_id || ''))) sessionId = String(row.session_id)
    if (typeof row.transcript_path === 'string' && row.transcript_path) transcriptPath = row.transcript_path
    if (typeof row.cwd === 'string' && row.cwd) cwd = row.cwd
    const event = String(row.hook_event_name || '')
    if (event) lastEvent = event
    if (event === 'SessionStart') state = 'idle'
    if (event === 'UserPromptSubmit') {
      state = 'working'
      const prompt = typeof row.user_prompt === 'string' ? row.user_prompt : typeof row.prompt === 'string' ? row.prompt : ''
      if (prompt) prompts.push({ text: prompt, sessionId, cwd })
    }
    if (event === 'Notification') state = 'waiting'
    if (event === 'Stop') state = 'idle'
    if (event === 'SessionEnd') state = 'ended'
  }

  return { sessionId, transcriptPath, cwd, state, lastEvent, prompts, eventCount: rows.length }
}

function textBlocks(content) {
  if (typeof content === 'string') return content ? [content] : []
  if (!Array.isArray(content)) return []
  return content
    .filter(block => block?.type === 'text' && typeof block.text === 'string' && block.text.trim())
    .map(block => block.text)
}

function toolBlocks(content) {
  if (!Array.isArray(content)) return []
  return content
    .filter(block => block?.type === 'tool_use' && block.name)
    .map(block => ({
      id: block.id || null,
      name: String(block.name),
      input: block.input && typeof block.input === 'object' ? block.input : null
    }))
}

function toolResults(content) {
  if (!Array.isArray(content)) return []
  return content
    .filter(block => block?.type === 'tool_result')
    .map(block => ({
      toolUseId: block.tool_use_id || null,
      isError: block.is_error === true,
      text: textBlocks(block.content).join('\n') || (typeof block.content === 'string' ? block.content : '')
    }))
}

export function parseClaudeTranscript(text) {
  const rows = parseJsonLines(text)
  const items = []

  for (const row of rows) {
    const type = String(row?.type || '')
    const message = row?.message || {}
    const timestamp = row?.timestamp || null
    const id = row?.uuid || row?.requestId || `${type}:${items.length}`

    if (type === 'user') {
      const texts = textBlocks(message.content)
      const results = toolResults(message.content)
      if (texts.length) items.push({ id, type: 'user', text: texts.join('\n\n'), timestamp })
      for (const result of results) {
        items.push({ id: `${id}:tool-result:${result.toolUseId || items.length}`, type: 'tool_result', ...result, timestamp })
      }
      continue
    }

    if (type === 'assistant') {
      const texts = textBlocks(message.content)
      if (texts.length) {
        items.push({
          id,
          type: 'assistant',
          text: texts.join('\n\n'),
          model: message.model || null,
          timestamp,
          usage: message.usage || null,
          error: row.isApiErrorMessage === true ? row.error || 'api_error' : null
        })
      }
      for (const tool of toolBlocks(message.content)) {
        items.push({ id: `${id}:tool:${tool.id || items.length}`, type: 'tool_use', ...tool, timestamp })
      }
    }
  }

  return items
}

export function validClaudeTranscriptPath(path, sessionId) {
  if (!path || !sessionId || !UUID.test(String(sessionId))) return false
  const file = basename(String(path))
  const parent = basename(dirname(String(path)))
  return file === `${sessionId}.jsonl`
    || (parent === sessionId && (file === 'main.jsonl' || file === 'audit.jsonl'))
}

export function readClaudeThread(userData, tabId) {
  const eventsPath = threadEventPath(userData, tabId)
  if (!eventsPath || !existsSync(eventsPath)) {
    return { ok: true, bound: false, provider: 'claude', items: [], eventCount: 0 }
  }

  let eventsTail
  try { eventsTail = readTail(eventsPath, THREAD_EVENT_LIMIT_BYTES) } catch (error) {
    return { ok: false, error: error.message }
  }
  const meta = parseThreadEvents(eventsTail.text)
  const base = {
    ok: true,
    bound: !!meta.sessionId,
    provider: 'claude',
    sessionId: meta.sessionId,
    cwd: meta.cwd,
    state: meta.state,
    lastEvent: meta.lastEvent,
    eventCount: meta.eventCount,
    eventsTruncated: eventsTail.truncated,
    transcriptPath: null,
    transcriptAvailable: false,
    transcriptTruncated: false,
    hookPrompts: meta.prompts,
    items: []
  }

  if (!validClaudeTranscriptPath(meta.transcriptPath, meta.sessionId)) return base
  base.transcriptPath = meta.transcriptPath
  if (!existsSync(meta.transcriptPath)) return base

  try {
    const transcript = readTail(meta.transcriptPath, THREAD_TRANSCRIPT_LIMIT_BYTES)
    base.transcriptAvailable = true
    base.transcriptTruncated = transcript.truncated
    base.items = parseClaudeTranscript(transcript.text)
    return base
  } catch (error) {
    return { ...base, error: error.message }
  }
}
