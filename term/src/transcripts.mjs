import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

// Reads the agents' own conversation logs (never their credentials) to tell
// what a session is doing and what it was about. Claude Code keeps one JSONL
// per session under <config>/projects/<folder-slug>/; Codex keeps rollouts
// under <CODEX_HOME>/sessions/YYYY/MM/DD/, each starting with session_meta.

const WORKING_MS = 8000          // log written this recently: still working
const TAIL_BYTES = 96 * 1024

export function claudeRoots(env = process.env) {
  const roots = []
  if (env.CLAUDE_CONFIG_DIR) roots.push(String(env.CLAUDE_CONFIG_DIR))
  roots.push(join(env.HOME || env.USERPROFILE || homedir(), '.claude'))
  return [...new Set(roots.map(r => resolve(r)))]
}
export function codexHome(env = process.env) {
  return resolve(env.CODEX_HOME || join(env.HOME || env.USERPROFILE || homedir(), '.codex'))
}

// Claude Code's project folder name: every non-alphanumeric becomes '-'.
export function claudeSlug(cwd) { return String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-') }

export function readTail(file, bytes = TAIL_BYTES) {
  let fd
  try {
    const size = statSync(file).size
    const len = Math.min(size, bytes)
    const buf = Buffer.alloc(len)
    fd = openSync(file, 'r')
    readSync(fd, buf, 0, len, size - len)
    const text = buf.toString('utf8')
    const lines = text.split('\n')
    if (size > len) lines.shift() // first line is probably cut
    const rows = []
    for (const line of lines) {
      if (!line.trim()) continue
      try { rows.push(JSON.parse(line)) } catch {}
    }
    return rows
  } catch {
    return []
  } finally {
    if (fd !== undefined) try { closeSync(fd) } catch {}
  }
}

function newestJsonl(dir, since = 0) {
  let best = null
  let names = []
  try { names = readdirSync(dir) } catch { return null }
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    try {
      const st = statSync(join(dir, name))
      if (st.mtimeMs < since) continue
      if (!best || st.mtimeMs > best.mtimeMs) best = { file: join(dir, name), mtimeMs: st.mtimeMs }
    } catch {}
  }
  return best
}

export function findClaudeTranscript(cwd, { since = 0, env = process.env } = {}) {
  let best = null
  for (const root of claudeRoots(env)) {
    const hit = newestJsonl(join(root, 'projects', claudeSlug(cwd)), since)
    if (hit && (!best || hit.mtimeMs > best.mtimeMs)) best = hit
  }
  return best
}

// Codex: walk the last few day-folders, match session_meta.cwd.
export function findCodexTranscript(cwd, { since = 0, env = process.env, days = 3 } = {}) {
  const root = join(codexHome(env), 'sessions')
  const target = resolve(cwd)
  let best = null
  const dayDirs = []
  try {
    for (const y of readdirSync(root).sort().reverse().slice(0, 2)) {
      for (const m of readdirSync(join(root, y)).sort().reverse().slice(0, 2)) {
        for (const d of readdirSync(join(root, y, m)).sort().reverse()) dayDirs.push(join(root, y, m, d))
      }
    }
  } catch {}
  for (const dir of dayDirs.slice(0, days)) {
    let names = []
    try { names = readdirSync(dir) } catch { continue }
    for (const name of names) {
      if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue
      const file = join(dir, name)
      let st
      try { st = statSync(file) } catch { continue }
      if (st.mtimeMs < since || (best && st.mtimeMs <= best.mtimeMs)) continue
      const head = readHead(file)
      const meta = head.find(r => r?.type === 'session_meta')
      if (meta && resolve(String(meta.payload?.cwd || '')) === target) best = { file, mtimeMs: st.mtimeMs }
    }
  }
  return best
}

function readHead(file, bytes = 16 * 1024) {
  let fd
  try {
    const buf = Buffer.alloc(bytes)
    fd = openSync(file, 'r')
    const n = readSync(fd, buf, 0, bytes, 0)
    return buf.toString('utf8', 0, n).split('\n').slice(0, 4).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] } finally { if (fd !== undefined) try { closeSync(fd) } catch {} }
}

// ── Normalised items: { role: 'user'|'assistant'|'tool', text, tool, file, pending }
function claudeText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(c => c?.type === 'text').map(c => c.text).join('\n')
}
export function claudeItems(rows) {
  const items = []
  const pending = new Set()
  for (const r of rows) {
    if (r?.isSidechain || r?.isMeta) continue
    const content = r?.message?.content
    if (r?.type === 'user') {
      if (Array.isArray(content)) for (const c of content) if (c?.type === 'tool_result') pending.delete(c.tool_use_id)
      const text = claudeText(content)
      if (text.trim() && !text.startsWith('<')) items.push({ role: 'user', text })
    } else if (r?.type === 'assistant') {
      if (!Array.isArray(content)) continue
      for (const c of content) {
        if (c?.type === 'text' && c.text?.trim()) items.push({ role: 'assistant', text: c.text, stop: r.message?.stop_reason || null })
        if (c?.type === 'tool_use') {
          pending.add(c.id)
          items.push({ role: 'tool', tool: c.name, file: c.input?.file_path || c.input?.path || c.input?.notebook_path || null, id: c.id })
        }
      }
    }
  }
  for (const it of items) if (it.role === 'tool') it.pending = pending.has(it.id)
  return items
}
export function codexItems(rows) {
  const items = []
  const text = (content) => Array.isArray(content) ? content.map(c => c?.text || '').join('\n') : String(content || '')
  for (const r of rows) {
    const p = r?.payload || {}
    if (r?.type === 'response_item' && p.type === 'message') {
      const t = text(p.content)
      if (!t.trim() || /^<(environment_context|user_instructions)/.test(t.trim())) continue
      items.push({ role: p.role === 'user' ? 'user' : 'assistant', text: t })
    } else if (r?.type === 'response_item' && (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call')) {
      items.push({ role: 'tool', tool: p.name || 'shell', file: null })
    } else if (r?.type === 'event_msg' && p.type === 'task_complete') {
      items.push({ role: 'done' })
    }
  }
  return items
}

// working | waiting (needs you) | idle
export function stateFromItems(items, mtimeMs, now = Date.now()) {
  const fresh = now - mtimeMs < WORKING_MS
  const meaningful = items.filter(i => i.role !== 'done')
  const last = meaningful[meaningful.length - 1]
  const finished = items[items.length - 1]?.role === 'done'
  if (fresh && !finished) return 'working'
  if (!last) return 'idle'
  if (last.role === 'tool' && last.pending) return 'waiting'     // stalled on a tool: likely a permission prompt
  if (last.role === 'assistant' || finished) return 'waiting'    // the agent spoke last: your turn
  if (last.role === 'user') return now - mtimeMs < 5 * 60e3 ? 'working' : 'idle'
  return 'idle'
}

// What a session is doing right now, plus its last words, from its log.
export function sessionInsight(agent, cwd, { since = 0, env = process.env, now = Date.now() } = {}) {
  const found = agent === 'claude' ? findClaudeTranscript(cwd, { since, env })
    : agent === 'codex' ? findCodexTranscript(cwd, { since, env }) : null
  if (!found) return null
  const rows = readTail(found.file)
  const items = agent === 'claude' ? claudeItems(rows) : codexItems(rows)
  const lastText = [...items].reverse().find(i => i.role === 'assistant')?.text || ''
  return { file: found.file, mtimeMs: found.mtimeMs, state: stateFromItems(items, found.mtimeMs, now), lastText: lastText.trim().split('\n').filter(Boolean).pop() || '', items }
}

// A hand-off brief: the ask, where it got to, files touched, last words.
export function handoffBrief(agentLabel, cwd, items, { maxChars = 6000 } = {}) {
  const users = items.filter(i => i.role === 'user').map(i => i.text.trim()).filter(Boolean)
  const said = items.filter(i => i.role === 'assistant').map(i => i.text.trim()).filter(Boolean)
  const files = [...new Set(items.filter(i => i.role === 'tool' && i.file).map(i => i.file))].slice(-20)
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  const lines = [
    `You are taking over a coding session from ${agentLabel} in ${cwd}.`,
    '',
    '## What was asked',
    ...(users.length ? users.slice(-4).map(u => `- ${clip(u.replace(/\s+/g, ' '), 400)}`) : ['- (no prompt recorded)']),
    '',
    '## Where it got to',
    ...(said.length ? said.slice(-3).map(s => clip(s, 900)) : ['(no reply recorded)']),
    ''
  ]
  if (files.length) lines.push('## Files touched', ...files.map(f => `- ${f}`), '')
  lines.push('## Your job', 'Read the files above, check the current state (git status / tests), then continue the work. Tell me briefly what you found before making large changes.')
  const text = lines.join('\n')
  return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text
}
