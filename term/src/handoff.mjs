import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { agentById } from './agents.mjs'
import { findClaudeTranscript, findCodexTranscript, readTail, claudeItems, codexItems } from './transcripts.mjs'
import { buildHandoffBrief, handoffPointer } from '../../src/renderer/src/lib/handoffBrief.mjs'

// One hand-off for both Sush Terminal (`sush handoff <to>`) and the desktop
// app (IPC sush:handoff-prepare): read the latest conversation in the folder,
// build the shared brief, save it under ~/.sush/handoffs, and hand back a
// one-line pointer for the next agent to read it.

export function latestConversation(cwd, from = null, env = process.env) {
  const candidates = []
  if (!from || from === 'claude') { const c = findClaudeTranscript(cwd, { env }); if (c) candidates.push({ agent: 'claude', ...c }) }
  if (!from || from === 'codex') { const c = findCodexTranscript(cwd, { env }); if (c) candidates.push({ agent: 'codex', ...c }) }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const best = candidates[0]
  if (!best) return null
  const rows = readTail(best.file, 512 * 1024)
  const items = best.agent === 'claude' ? claudeItems(rows) : codexItems(rows)
  return { ...best, items }
}

export function gitState(cwd, run = execFileSync) {
  try {
    const opts = { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000, windowsHide: true }
    const branch = String(run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts)).trim()
    const dirty = String(run('git', ['status', '--porcelain'], opts)).split('\n').filter(Boolean).length
    return branch ? { branch, dirty } : null
  } catch {
    return null
  }
}

// Inside the project (<cwd>/.sush/handoffs), so every agent can read it
// without leaving its workspace (Gemini's file tools can't, Claude would
// ask). A `*` .gitignore keeps briefs out of commits. Falls back to
// ~/.sush/handoffs when the project folder isn't writable.
export function handoffDir(cwd, env = process.env) {
  if (env.SUSH_HANDOFF_DIR) return env.SUSH_HANDOFF_DIR
  const local = join(cwd, '.sush', 'handoffs')
  try {
    mkdirSync(local, { recursive: true })
    const ignore = join(local, '.gitignore')
    if (!existsSync(ignore)) writeFileSync(ignore, '*\n')
    return local
  } catch {
    return join(env.HOME || env.USERPROFILE || homedir(), '.sush', 'handoffs')
  }
}

// Relative to the project when the brief lives inside it (shorter, and
// the agent resolves it against its own cwd).
function shownPath(cwd, file) {
  const rel = relative(cwd, file)
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel.split('\\').join('/') : file
}

// to:        the agent taking over (only used for the file name and checks)
// from:      'claude' | 'codex' to pick a transcript; anything else is the
//            label of a source without one (then `tail` carries the context)
// tail, summary, reason, git: extra context the desktop app can supply
export function prepareHandoff({ to, from = null, cwd = process.cwd(), env = process.env, now = new Date(), tail = '', summary = '', reason = '', git, fromLabel = null }) {
  if (to && !agentById(to)) return { ok: false, error: `unknown agent: ${to}` }
  const transcriptFrom = from === 'claude' || from === 'codex' ? from : null
  const conv = (!from || transcriptFrom) ? latestConversation(cwd, transcriptFrom, env) : null
  if (!conv && !tail && !summary) return { ok: false, error: `no ${transcriptFrom || 'Claude Code or Codex'} conversation found for ${cwd}` }
  if (conv && to && conv.agent === to && !from) return { ok: false, error: `the latest conversation here is already ${agentById(to).label}; pass --from to pick another` }
  const source = conv?.agent || from || 'agent'
  const label = fromLabel || agentById(source)?.label || source
  const brief = buildHandoffBrief({
    fromLabel: label, cwd, items: conv?.items || [], tail, summary, reason,
    git: git === undefined ? gitState(cwd) : git
  })
  const dir = handoffDir(cwd, env)
  mkdirSync(dir, { recursive: true })
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safe = s => String(s || 'agent').replace(/[^\w.-]+/g, '-').slice(0, 24)
  const file = join(dir, `${stamp}-${safe(source)}-to-${safe(to)}.md`)
  writeFileSync(file, brief + '\n')
  return { ok: true, from: source, to, brief, file, pointer: handoffPointer(shownPath(cwd, file), label), transcript: !!conv }
}
