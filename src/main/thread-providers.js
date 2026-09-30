import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, dirname, join, resolve } from 'path'

// Codex + Gemini adapters for the same-session Thread bridge. Both CLIs ship
// Claude-compatible hooks whose payload carries the REAL session id and the
// path of that session's own log, so a tab is bound to exactly its session —
// never to "the newest log in this folder".
//
// Codex (verified on 0.159): hooks come from per-launch `-c hooks.<Event>=…`
// overrides. Codex asks the user to review new hooks once ("Hooks need
// review") and remembers the trust in its config; until then they don't run
// and Thread simply stays unbound.
//
// Gemini (verified on 0.61): per-launch settings files must be root-owned, so
// the only per-user source is ~/.gemini/settings.json. Sush adds its hook
// there only when the user opts in, and the hook is inert outside Sush tabs
// (no SUSH_THREAD_EVENT_PATH → it just drains stdin).

export const THREAD_PROVIDERS = ['claude', 'codex', 'gemini']
export const CODEX_THREAD_MIN_VERSION = '0.159.0'

const CODEX_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Stop']
const GEMINI_HOOK_EVENTS = ['SessionStart', 'BeforeAgent', 'AfterAgent', 'Notification', 'SessionEnd']
const POSIX_STYLE_SHELLS = new Set(['bash', 'zsh', 'sh', 'dash', 'ksh', 'mksh', 'fish'])
const SINK_MARK = 'SUSH_THREAD_EVENT_PATH'

export function compareVersions(a, b) {
  const pa = String(a || '').split(/[.-]/).map(n => parseInt(n, 10) || 0)
  const pb = String(b || '').split(/[.-]/).map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1
  }
  return 0
}

// ── Sink ────────────────────────────────────────────────────────────────────
// A fixed script the hook runs, so the hook command itself never contains a
// path (paths with spaces would break the inline TOML/shell quoting).
export function ensureThreadSink(userData) {
  const root = join(userData, 'thread-bridge')
  mkdirSync(root, { recursive: true })
  const path = join(root, 'sink.sh')
  const body = '[ -n "$SUSH_THREAD_EVENT_PATH" ] || exec cat >/dev/null\ncat >> "$SUSH_THREAD_EVENT_PATH"\nprintf \'\\n\' >> "$SUSH_THREAD_EVENT_PATH"\n'
  let current = null
  try { current = readFileSync(path, 'utf8') } catch {}
  if (current !== body) writeFileSync(path, body, { encoding: 'utf8', mode: 0o700 })
  return path
}

// ── Codex ───────────────────────────────────────────────────────────────────
export function codexHome(env = {}) {
  return resolve(String(env.CODEX_HOME || join(String(env.HOME || env.USERPROFILE || homedir()), '.codex')))
}

export function codexConfigRoots(env = {}) {
  return [join(codexHome(env), 'sessions')]
}

// A user who already defines these hook events in config.toml would have
// them replaced by the -c override, so Sush stays out of the way.
export function codexConfigDefinesHooks(configText = '') {
  const events = CODEX_HOOK_EVENTS.join('|')
  return new RegExp(`^\\s*\\[\\[?hooks\\.(${events})\\b|^\\s*hooks\\.(${events})\\s*=|^\\s*(${events})\\s*=`, 'm').test(String(configText))
}

export function codexHookArgs() {
  // The command string is constant so Codex's per-hook trust survives
  // relaunches (it hashes the definition).
  return CODEX_HOOK_EVENTS
    .map(event => `-c 'hooks.${event}=[{hooks=[{type="command",command="sh \\"$SUSH_THREAD_SINK\\""}]}]'`)
    .join(' ')
}

function isCodexCommand(source) {
  return /^codex(?:\s|$)/i.test(source)
}

function isCompound(source) {
  return /[|;&<>`$()]/.test(source)
}

// Options go straight after `codex` so they apply to subcommands too
// (`codex resume --last`).
function insertAfterCodex(source, args) {
  return source.replace(/^codex/i, match => `${match} ${args}`)
}

export function augmentCodexCommand(command, { shellId = '', platform = process.platform, configText = '', thread = true, budget = null } = {}) {
  const source = String(command ?? '').trim()
  if (!source || !isCodexCommand(source) || isCompound(source)) return { command: source || null, thread: false }
  const args = []
  let threaded = false
  const shell = String(shellId || '').toLowerCase().replace(/\.exe$/, '')
  if (thread && platform !== 'win32' && (!shell || POSIX_STYLE_SHELLS.has(shell)) &&
      !/(?:^|\s)(?:-c|--config)[\s=]+['"]?hooks\./.test(source) && !codexConfigDefinesHooks(configText)) {
    args.push(codexHookArgs())
    threaded = true
  }
  const limit = Number(budget)
  if (Number.isFinite(limit) && limit > 0 && !/model_auto_compact_token_limit/.test(source)) {
    args.push(`-c model_auto_compact_token_limit=${Math.round(limit)}`)
  }
  return { command: args.length ? insertAfterCodex(source, args.join(' ')) : source, thread: threaded }
}

const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validCodexTranscriptPath(path, sessionId) {
  if (!path || !UUIDISH.test(String(sessionId || ''))) return false
  const file = basename(String(path))
  return file.startsWith('rollout-') && file.endsWith(`-${sessionId}.jsonl`)
}

function codexText(content) {
  if (!Array.isArray(content)) return typeof content === 'string' ? content : ''
  return content
    .filter(part => (part?.type === 'input_text' || part?.type === 'output_text' || part?.type === 'text') && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
}

// Codex injects its own context as user-role messages; they are not prompts.
function injectedCodexText(text) {
  return /^\s*<(environment_context|user_instructions|permissions|skills_instructions|turn_aborted|subagent_notification)\b/.test(text)
    || /^\s*# AGENTS\.md instructions/.test(text)
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw
  try { const v = JSON.parse(String(raw || '')); return v && typeof v === 'object' ? v : { input: raw } } catch { return raw ? { input: String(raw) } : null }
}

function codexOutput(output) {
  if (typeof output === 'string') {
    try {
      const value = JSON.parse(output)
      if (value && typeof value.output === 'string') return { text: value.output, isError: Number(value.metadata?.exit_code) > 0 }
    } catch {}
    return { text: output, isError: false }
  }
  if (output && typeof output === 'object') {
    const text = typeof output.content === 'string' ? output.content : codexText(output.content)
    return { text, isError: output.success === false }
  }
  return { text: '', isError: false }
}

// Map Codex tool calls onto the names Thread already renders.
function codexToolUse(name, input) {
  if (name === 'shell' || name === 'exec_command' || name === 'local_shell' || name === 'shell_command') {
    const cmd = input?.command ?? input?.cmd
    return { name: 'Bash', input: { command: Array.isArray(cmd) ? cmd.join(' ') : String(cmd ?? '') } }
  }
  if (name === 'apply_patch') {
    const patch = typeof input?.input === 'string' ? input.input : typeof input?.patch === 'string' ? input.patch : ''
    return { name: 'Patch', input: { patch, description: patchSummary(patch) } }
  }
  return { name: String(name || 'tool'), input }
}

export function patchFiles(patch = '') {
  const files = []
  let current = null
  for (const line of String(patch).split('\n')) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line)
    if (header) {
      current = { path: header[2].trim(), added: 0, removed: 0 }
      files.push(current)
      continue
    }
    if (!current || line.startsWith('***') || line.startsWith('@@')) continue
    if (line.startsWith('+')) current.added++
    else if (line.startsWith('-')) current.removed++
  }
  return files
}

function patchSummary(patch) {
  const files = patchFiles(patch)
  return files.length ? files.map(f => f.path).join(', ') : ''
}

export function parseCodexRollout(text, sessionId = null) {
  const items = []
  let contextWindow = null
  let lastUsage = null
  let model = null
  let metaId = null
  let n = 0
  for (const line of String(text || '').split(/\r?\n/)) {
    const value = line.trim()
    if (!value) continue
    let row
    try { row = JSON.parse(value) } catch { continue }
    const payload = row?.payload || {}
    const timestamp = row?.timestamp || null
    const id = payload.id || payload.call_id || `codex:${n}`
    n++

    if (row.type === 'session_meta') {
      metaId = payload.id || payload.session_id || metaId
      continue
    }
    if (row.type === 'turn_context') {
      if (typeof payload.model === 'string') model = payload.model
      continue
    }
    if (row.type === 'event_msg') {
      if (payload.type === 'task_started' && Number(payload.model_context_window) > 0) contextWindow = Number(payload.model_context_window)
      if (payload.type === 'token_count' && payload.info) {
        if (Number(payload.info.model_context_window) > 0) contextWindow = Number(payload.info.model_context_window)
        lastUsage = payload.info.last_token_usage || lastUsage
      }
      continue
    }
    if (row.type !== 'response_item') continue

    if (payload.type === 'message') {
      const body = codexText(payload.content)
      if (!body.trim()) continue
      if (payload.role === 'user') {
        if (injectedCodexText(body)) continue
        items.push({ id, type: 'user', text: body, timestamp })
      } else if (payload.role === 'assistant') {
        items.push({ id, type: 'assistant', text: body, model, timestamp, usage: null, error: null })
      }
      continue
    }
    if (payload.type === 'function_call' || payload.type === 'custom_tool_call' || payload.type === 'local_shell_call') {
      const raw = payload.type === 'custom_tool_call' ? { input: payload.input } : payload.type === 'local_shell_call' ? payload.action : parseArgs(payload.arguments)
      const mapped = codexToolUse(payload.type === 'local_shell_call' ? 'local_shell' : payload.name, raw)
      items.push({ id: `${id}:use`, type: 'tool_use', toolUseId: payload.call_id || id, name: mapped.name, input: mapped.input, timestamp })
      continue
    }
    if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
      const out = codexOutput(payload.output)
      items.push({ id: `${id}:result`, type: 'tool_result', toolUseId: payload.call_id || null, isError: out.isError, text: out.text, timestamp })
    }
  }

  // Context in use = what the last request sent + what it produced. Attach it
  // to the last reply so the renderer's latestContextTokens() finds it.
  if (lastUsage) {
    const cached = Number(lastUsage.cached_input_tokens) || 0
    const usage = {
      input_tokens: Math.max(0, (Number(lastUsage.input_tokens) || 0) - cached),
      cache_read_input_tokens: cached,
      output_tokens: Number(lastUsage.output_tokens) || 0
    }
    const target = [...items].reverse().find(item => item.type === 'assistant') || items[items.length - 1]
    if (target) target.usage = usage
  }
  const mismatch = sessionId && metaId && metaId !== sessionId
  return { items: mismatch ? [] : items, contextWindow, mismatch: !!mismatch }
}

// ── Gemini ──────────────────────────────────────────────────────────────────
export function geminiHome(env = {}) {
  return resolve(String(env.GEMINI_CLI_HOME || env.HOME || env.USERPROFILE || homedir()), '.gemini')
}

export function geminiConfigRoots(env = {}) {
  return [join(geminiHome(env), 'tmp')]
}

export function geminiSettingsPath(env = {}) {
  return join(geminiHome(env), 'settings.json')
}

export function geminiHookCommand(platform = process.platform) {
  if (platform === 'win32') {
    return 'powershell -NoProfile -NonInteractive -Command "$d=[Console]::In.ReadToEnd(); if ($env:SUSH_THREAD_EVENT_PATH) { Add-Content -LiteralPath $env:SUSH_THREAD_EVENT_PATH -Value $d }"'
  }
  return 'sh -c \'[ -n "$SUSH_THREAD_EVENT_PATH" ] || exec cat >/dev/null; cat >> "$SUSH_THREAD_EVENT_PATH"; printf "\\n" >> "$SUSH_THREAD_EVENT_PATH"\''
}

function isSushHook(hook) {
  return typeof hook?.command === 'string' && hook.command.includes(SINK_MARK)
}

// Add (or remove) Sush's hook in a parsed settings object, leaving every
// other hook, matcher and setting as it was.
export function withGeminiThreadHooks(settings, enable, platform = process.platform) {
  const next = settings && typeof settings === 'object' && !Array.isArray(settings) ? { ...settings } : {}
  const hooks = next.hooks && typeof next.hooks === 'object' ? { ...next.hooks } : {}
  for (const event of GEMINI_HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? hooks[event] : []
    const cleaned = groups
      .map(group => group && Array.isArray(group.hooks) ? { ...group, hooks: group.hooks.filter(h => !isSushHook(h)) } : group)
      .filter(group => !(group && Array.isArray(group.hooks) && group.hooks.length === 0))
    if (enable) cleaned.push({ hooks: [{ type: 'command', command: geminiHookCommand(platform), timeout: 5000 }] })
    if (cleaned.length) hooks[event] = cleaned
    else delete hooks[event]
  }
  if (Object.keys(hooks).length) next.hooks = hooks
  else delete next.hooks
  return next
}

export function geminiThreadHooksEnabled(settings) {
  const groups = settings?.hooks?.SessionStart
  return Array.isArray(groups) && groups.some(g => Array.isArray(g?.hooks) && g.hooks.some(isSushHook))
}

export function readGeminiSettings(env = {}) {
  const path = geminiSettingsPath(env)
  if (!existsSync(path)) return { path, settings: {}, exists: false }
  const text = readFileSync(path, 'utf8')
  // Gemini's settings.json may carry comments; refuse to rewrite what we
  // cannot round-trip rather than dropping them.
  const settings = JSON.parse(text)
  return { path, settings, exists: true }
}

export function setGeminiThreadHooks(env, enable, platform = process.platform) {
  const { path, settings } = readGeminiSettings(env)
  const next = withGeminiThreadHooks(settings, enable, platform)
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.sush-${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, path)
  return geminiThreadHooksEnabled(next)
}

export function validGeminiTranscriptPath(path, sessionId) {
  if (!path || !UUIDISH.test(String(sessionId || ''))) return false
  const file = basename(String(path))
  const dir = String(path).split(/[\\/]/)
  const inChats = dir.includes('chats')
  return inChats && /^session-.+\.jsonl$/.test(file) && file.includes(String(sessionId).slice(0, 8))
}

function geminiText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(part => typeof part?.text === 'string').map(part => part.text).join('')
}

const GEMINI_TOOL_NAMES = {
  run_shell_command: 'Bash',
  write_file: 'Write',
  replace: 'Edit',
  read_file: 'Read',
  read_many_files: 'Read',
  glob: 'Glob',
  search_file_content: 'Grep',
  grep_search: 'Grep',
  web_fetch: 'WebFetch',
  google_web_search: 'WebSearch',
  list_directory: 'LS'
}

function geminiResultText(result) {
  if (typeof result === 'string') return result
  if (!Array.isArray(result)) return ''
  return result.map(part => {
    const resp = part?.functionResponse?.response
    if (typeof resp?.output === 'string') return resp.output
    if (typeof resp?.error === 'string') return resp.error
    return typeof part?.text === 'string' ? part.text : ''
  }).filter(Boolean).join('\n')
}

// Gemini's chat log is append-only: a message record re-pushed with the same
// id replaces the earlier copy, and {$set:{messages}} replaces the list.
export function parseGeminiChat(text, sessionId = null) {
  const order = []
  const byId = new Map()
  let metaId = null
  for (const line of String(text || '').split(/\r?\n/)) {
    const value = line.trim()
    if (!value) continue
    let row
    try { row = JSON.parse(value) } catch { continue }
    if (row?.$set) {
      if (Array.isArray(row.$set.messages)) {
        order.length = 0
        byId.clear()
        for (const msg of row.$set.messages) if (msg?.id) { order.push(msg.id); byId.set(msg.id, msg) }
      }
      continue
    }
    if (row?.sessionId && !row.type) { metaId = row.sessionId; continue }
    if (!row?.id || !row.type) continue
    if (!byId.has(row.id)) order.push(row.id)
    byId.set(row.id, row)
  }

  const items = []
  for (const id of order) {
    const msg = byId.get(id)
    const timestamp = msg.timestamp || null
    const body = geminiText(msg.displayContent ?? msg.content)
    if (msg.type === 'user') {
      if (/^\s*<session_context>/.test(body) || !body.trim()) continue
      items.push({ id, type: 'user', text: body, timestamp })
      continue
    }
    if (msg.type !== 'gemini') {
      if (msg.type === 'error' && body.trim()) items.push({ id, type: 'assistant', text: body, timestamp, usage: null, error: 'error' })
      continue
    }
    const tokens = msg.tokens
    const usage = tokens ? {
      input_tokens: Math.max(0, (Number(tokens.input) || 0) - (Number(tokens.cached) || 0)),
      cache_read_input_tokens: Number(tokens.cached) || 0,
      output_tokens: Number(tokens.output) || 0
    } : null
    if (body.trim()) items.push({ id, type: 'assistant', text: body, model: msg.model || null, timestamp, usage, error: null })
    let usageCarried = !!body.trim()
    for (const call of Array.isArray(msg.toolCalls) ? msg.toolCalls : []) {
      const callId = call.id || `${id}:${items.length}`
      const name = GEMINI_TOOL_NAMES[call.name] || call.displayName || call.name || 'tool'
      const input = call.args && typeof call.args === 'object' ? { ...call.args } : null
      // A reply that is only tool calls still carries this turn's usage.
      items.push({ id: `${callId}:use`, type: 'tool_use', toolUseId: callId, name, input, timestamp: call.timestamp || timestamp, ...(usageCarried ? {} : { usage }) })
      usageCarried = true
      if (call.result != null || call.status === 'error' || call.status === 'cancelled') {
        items.push({
          id: `${callId}:result`,
          type: 'tool_result',
          toolUseId: callId,
          isError: call.status === 'error' || call.status === 'cancelled',
          text: geminiResultText(call.result) || (typeof call.resultDisplay === 'string' ? call.resultDisplay : ''),
          timestamp: call.timestamp || timestamp
        })
      }
    }
  }
  const mismatch = sessionId && metaId && metaId !== sessionId
  return { items: mismatch ? [] : items, mismatch: !!mismatch }
}

// Gemini has no per-launch compaction flag: its threshold (a fraction of the
// window) lives in the user's settings. Sush writes it only when the user
// saves a Gemini budget, and null restores Gemini's default.
export function setGeminiCompressionThreshold(env, threshold) {
  const { path, settings } = readGeminiSettings(env)
  const next = settings && typeof settings === 'object' && !Array.isArray(settings) ? { ...settings } : {}
  const model = next.model && typeof next.model === 'object' ? { ...next.model } : {}
  const value = Number(threshold)
  if (threshold == null || !(value > 0 && value <= 1)) delete model.compressionThreshold
  else model.compressionThreshold = Math.round(value * 100) / 100
  if (Object.keys(model).length) next.model = model
  else delete next.model
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.sush-${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, path)
  return model.compressionThreshold ?? null
}
