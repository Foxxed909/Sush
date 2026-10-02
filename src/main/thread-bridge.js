import {
  existsSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync, readSync, realpathSync, statSync, unlinkSync, writeFileSync
} from 'fs'
import { homedir } from 'os'
import { basename, dirname, join, resolve, sep } from 'path'
import { parseCodexRollout, parseGeminiChat, validCodexTranscriptPath, validGeminiTranscriptPath } from './thread-providers.js'

export const THREAD_EVENT_LIMIT_BYTES = 512 * 1024
export const THREAD_TRANSCRIPT_LIMIT_BYTES = 4 * 1024 * 1024
const SAFE_TAB = /^[A-Za-z0-9._-]{1,96}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd']

const POSIX_STYLE_SHELLS = new Set(['bash', 'zsh', 'sh', 'dash', 'ksh', 'mksh', 'fish'])

// How the active shell expands SUSH_CLAUDE_THREAD_SETTINGS on the boot command
// line. null means "unknown syntax": the bridge is skipped rather than typing
// a literal that the shell would pass through unexpanded.
function settingsEnvArg({ shellId = '', platform = process.platform } = {}) {
  const shell = String(shellId || '').toLowerCase().replace(/\.exe$/, '')
  if (shell === 'powershell' || shell === 'pwsh') return '"$env:SUSH_CLAUDE_THREAD_SETTINGS"'
  if (platform === 'win32' && shell === 'cmd') return '"%SUSH_CLAUDE_THREAD_SETTINGS%"'
  if (shell === 'nu') return '$env.SUSH_CLAUDE_THREAD_SETTINGS'
  if (shell === 'elvish') return '$E:SUSH_CLAUDE_THREAD_SETTINGS'
  if (!shell || POSIX_STYLE_SHELLS.has(shell)) return '"$SUSH_CLAUDE_THREAD_SETTINGS"'
  return null
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
  readCache.delete(path)
  return path
}

export function cleanupThreadEventFile(userData, tabId) {
  const path = threadEventPath(userData, tabId)
  if (!path) return false
  readCache.delete(path)
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
  // A compound line (`claude | tee log`, `claude && npm test`) would get the
  // flag on its last command, not on claude. Leave those unbridged.
  if (/[|;&<>`$()]/.test(source)) return source
  const arg = settingsEnvArg(shell)
  if (!arg) return source
  return `${source} --settings ${arg}`
}

// Thread polls every ~1.2 s. Re-reading and re-parsing a multi-MB transcript
// that has not changed is pure waste, so reads are memoised per tab on the
// size+mtime of both files and a stamp-identical poll returns the cached result.
const readCache = new Map()

function fileStamp(path) {
  try {
    const stat = statSync(path)
    return `${stat.size}:${stat.mtimeMs}`
  } catch {
    return 'missing'
  }
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
    try {
      const row = JSON.parse(value)
      if (row && typeof row === 'object' && !Array.isArray(row)) rows.push(row)
    } catch {}
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
    // Gemini names its turn hooks BeforeAgent / AfterAgent.
    if (event === 'UserPromptSubmit' || event === 'BeforeAgent') {
      state = 'working'
      const prompt = typeof row.user_prompt === 'string' ? row.user_prompt : typeof row.prompt === 'string' ? row.prompt : ''
      if (prompt) prompts.push({ text: prompt, sessionId, cwd })
    }
    if (event === 'Notification') state = 'waiting'
    if (event === 'Stop' || event === 'AfterAgent') state = 'idle'
    if (event === 'SessionEnd') state = 'ended'
  }

  // /clear and /resume start a new Claude session in the same PTY. Prompts
  // from the previous session are not in the new transcript, so keeping them
  // would render them forever as "not yet flushed" live prompts.
  const current = prompts.filter(prompt => prompt.sessionId === sessionId)
  return { sessionId, transcriptPath, cwd, state, lastEvent, prompts: current, eventCount: rows.length }
}

function textFromToolResult(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
}

export function parseClaudeTranscript(text) {
  const rows = parseJsonLines(text)
  const items = []

  for (const row of rows) {
    const type = String(row?.type || '')
    const message = row?.message || {}
    const timestamp = row?.timestamp || null
    const baseId = row?.uuid || row?.requestId || `${type}:${items.length}`
    const content = message.content

    if (type === 'user') {
      if (typeof content === 'string' && content.trim()) {
        items.push({ id: baseId, type: 'user', text: content, timestamp })
        continue
      }
      if (!Array.isArray(content)) continue
      content.forEach((block, index) => {
        if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          items.push({ id: `${baseId}:text:${index}`, type: 'user', text: block.text, timestamp })
        } else if (block?.type === 'tool_result') {
          items.push({
            id: `${baseId}:tool-result:${block.tool_use_id || index}`,
            type: 'tool_result',
            toolUseId: block.tool_use_id || null,
            isError: block.is_error === true,
            text: textFromToolResult(block.content),
            timestamp
          })
        }
      })
      continue
    }

    if (type !== 'assistant') continue
    if (typeof content === 'string' && content.trim()) {
      items.push({
        id: baseId,
        type: 'assistant',
        text: content,
        model: message.model || null,
        timestamp,
        usage: message.usage || null,
        error: row.isApiErrorMessage === true ? row.error || 'api_error' : null
      })
      continue
    }
    if (!Array.isArray(content)) continue

    content.forEach((block, index) => {
      // Claude's transcript may contain private/reasoning blocks. Thread is a
      // user-facing structured activity view, not a reasoning extractor.
      if (block?.type === 'thinking' || block?.type === 'redacted_thinking') return

      if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        items.push({
          id: `${baseId}:text:${index}`,
          type: 'assistant',
          text: block.text,
          model: message.model || null,
          timestamp,
          usage: message.usage || null,
          error: row.isApiErrorMessage === true ? row.error || 'api_error' : null
        })
        return
      }

      if (block?.type === 'tool_use' && block.name) {
        items.push({
          id: `${baseId}:tool:${block.id || index}`,
          type: 'tool_use',
          toolUseId: block.id || null,
          name: String(block.name),
          input: block.input && typeof block.input === 'object' ? block.input : null,
          timestamp
        })
      }
    })
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

// The Claude config dirs a PTY's environment points at. The transcript path is
// read from a hook sink that anything in that terminal can append to, so it is
// only trusted when it also lives under one of these roots.
export function claudeConfigRoots(env = {}) {
  const roots = []
  if (env.CLAUDE_CONFIG_DIR) roots.push(String(env.CLAUDE_CONFIG_DIR))
  roots.push(join(String(env.HOME || env.USERPROFILE || homedir()), '.claude'))
  return [...new Set(roots.map(root => resolve(root)))]
}

function realOrResolved(path) {
  try { return realpathSync(path) } catch { return resolve(path) }
}

export function transcriptWithinRoots(path, roots, platform = process.platform) {
  if (!path || !Array.isArray(roots) || !roots.length) return false
  const fold = value => platform === 'win32' ? value.toLowerCase() : value
  const target = fold(realOrResolved(String(path)))
  return roots.some(root => {
    const base = fold(realOrResolved(String(root)))
    return target.startsWith(base.endsWith(sep) ? base : base + sep)
  })
}

// Event files only get removed when their tab closes; a crash leaves them
// behind. No PTY survives an app restart, so every file on disk at startup is
// stale.
export function sweepThreadEventFiles(userData) {
  const root = join(userData, 'thread-bridge', 'events')
  let removed = 0
  let names = []
  try { names = readdirSync(root) } catch { return 0 }
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    try { unlinkSync(join(root, name)); removed++ } catch {}
  }
  readCache.clear()
  return removed
}

export function readClaudeThread(userData, tabId, { roots } = {}) {
  return readThread(userData, tabId, { roots, provider: 'claude' })
}

// Per-provider transcript rules: which file names a session's own log may
// have, and how to turn it into Thread items.
const TRANSCRIPTS = {
  claude: {
    valid: validClaudeTranscriptPath,
    parse: text => ({ items: parseClaudeTranscript(text), contextWindow: null })
  },
  codex: {
    valid: validCodexTranscriptPath,
    parse: (text, sessionId, truncated) => parseCodexRollout(text, truncated ? null : sessionId)
  },
  gemini: {
    valid: validGeminiTranscriptPath,
    parse: (text, sessionId, truncated) => parseGeminiChat(text, truncated ? null : sessionId)
  }
}

export function readThread(userData, tabId, { roots, provider = 'claude' } = {}) {
  const eventsPath = threadEventPath(userData, tabId)
  if (!TRANSCRIPTS[provider]) return { ok: false, error: `Thread is not available for ${provider}` }
  if (!eventsPath || !existsSync(eventsPath)) {
    return { ok: true, bound: false, provider, items: [], eventCount: 0 }
  }

  const eventsStamp = fileStamp(eventsPath)
  const effectiveRoots = roots || claudeConfigRoots(process.env)
  const rootsKey = JSON.stringify(effectiveRoots)
  const cached = readCache.get(eventsPath)
  if (cached && cached.provider === provider && cached.rootsKey === rootsKey && cached.eventsStamp === eventsStamp &&
      (!cached.transcriptPath || cached.transcriptStamp === fileStamp(cached.transcriptPath))) {
    return cached.result
  }
  const result = readThreadUncached(eventsPath, effectiveRoots, provider)
  const transcriptStamp = result.transcriptPath ? fileStamp(result.transcriptPath) : null
  // Callers pass this back as `since` so an unchanged poll needn't re-send
  // (and the renderer re-clone) a multi-MB transcript.
  result.stamp = `${eventsStamp}|${transcriptStamp ?? '-'}`
  if (result.ok && !result.error) {
    readCache.set(eventsPath, { provider, rootsKey, eventsStamp, transcriptPath: result.transcriptPath, transcriptStamp, result })
  }
  return result
}

function readThreadUncached(eventsPath, roots, provider) {
  const rules = TRANSCRIPTS[provider]
  let eventsTail
  try { eventsTail = readTail(eventsPath, THREAD_EVENT_LIMIT_BYTES) } catch (error) {
    return { ok: false, error: error.message }
  }
  const meta = parseThreadEvents(eventsTail.text)
  const base = {
    ok: true,
    bound: !!meta.sessionId,
    provider,
    sessionId: meta.sessionId,
    contextWindow: null,
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

  if (!rules.valid(meta.transcriptPath, meta.sessionId)) return base
  if (!transcriptWithinRoots(meta.transcriptPath, roots)) return base
  base.transcriptPath = meta.transcriptPath
  if (!existsSync(meta.transcriptPath)) return base

  try {
    const transcript = readTail(meta.transcriptPath, THREAD_TRANSCRIPT_LIMIT_BYTES)
    base.transcriptAvailable = true
    base.transcriptTruncated = transcript.truncated
    const parsed = rules.parse(transcript.text, meta.sessionId, transcript.truncated)
    // A log whose own header names another session is not this tab's.
    if (parsed.mismatch) return { ...base, transcriptAvailable: false }
    base.items = parsed.items
    base.contextWindow = parsed.contextWindow ?? null
    return base
  } catch (error) {
    return { ...base, error: error.message }
  }
}

