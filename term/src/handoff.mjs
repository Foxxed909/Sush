import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { agentById } from './agents.mjs'
import { findClaudeTranscript, findCodexTranscript, readTail, claudeItems, codexItems, handoffBrief } from './transcripts.mjs'

// `sush handoff <to> [--from claude|codex]`: brief the next agent from the
// latest conversation in this folder, save the brief, and start it.

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

export function prepareHandoff({ to, from = null, cwd = process.cwd(), env = process.env, now = new Date() }) {
  if (!agentById(to)) return { ok: false, error: `unknown agent: ${to}` }
  const conv = latestConversation(cwd, from, env)
  if (!conv) return { ok: false, error: `no ${from || 'Claude Code or Codex'} conversation found for ${cwd}` }
  if (conv.agent === to && !from) return { ok: false, error: `the latest conversation here is already ${agentById(to).label}; pass --from to pick another` }
  const brief = handoffBrief(agentById(conv.agent).label, cwd, conv.items)
  const dir = join(env.SUSH_HANDOFF_DIR || join(env.HOME || env.USERPROFILE || homedir(), '.sush', 'handoffs'))
  mkdirSync(dir, { recursive: true })
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = join(dir, `${stamp}-${conv.agent}-to-${to}.md`)
  writeFileSync(file, brief + '\n')
  return { ok: true, from: conv.agent, to, brief, file }
}
