// Pure Seducia helpers — intent parsing, agent resolution, session summaries.
// Extracted so the orb, the docked panel, and the voice loop share one brain.
import { AGENTS, agentById } from './agents'

export function pathLabel(cwd) {
  if (!cwd) return 'this directory'
  const trimmed = String(cwd).replace(/[\\/]+$/, '')
  return trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed
}

export const SYNONYMS = {
  shell: ['terminal', 'shell', 'pwsh', 'powershell', 'bash'],
  claude: ['claude'],
  codex: ['codex'],
  gemini: ['gemini'],
  opencode: ['opencode', 'open code'],
  hermes: ['hermes'],
  aipex: ['aipex', 'apx'],
  trident: ['trident'],
  bedrock: ['bedrock'],
  quill: ['quill'],
  razor: ['razor'],
  serenity: ['serenity'],
  sydney: ['sydney'],
  ocp: ['ocp', 'open cli platform'],
  erosion: ['erosion'],
  evm: ['evm', 'environment monitor']
}

export function agentIdFromToken(token) {
  const t = String(token || '').toLowerCase().trim()
  if (!t) return null
  if (['all', 'everyone', 'everybody', 'them', 'agents', 'team'].includes(t)) return 'all'
  for (const [id, names] of Object.entries(SYNONYMS)) {
    if (names.some(n => t === n || t.startsWith(n))) return id
  }
  return null
}

export function runningTargets(tabs, target) {
  return tabs.filter(t => t.status !== 'exited' && (target === 'all' || (t.agentId || 'shell') === target))
}

export function targetName(id) {
  if (id === 'all') return 'agents'
  return agentById(id)?.label || id
}

export function describeSessions(tabs) {
  const running = tabs.filter(t => t.status !== 'exited')
  if (!running.length) return "Nothing is running yet. Tell me what to launch -- e.g. 'build team here' or '3 claude'."
  const byAgent = new Map()
  running.forEach(t => {
    const id = t.agentId || 'shell'
    if (!byAgent.has(id)) byAgent.set(id, [])
    byAgent.get(id).push(t)
  })
  const parts = [...byAgent.entries()].map(([id, list]) => `${list.length}x ${agentById(id)?.label || 'Terminal'}`)
  const groups = new Set(running.map(t => t.groupId).filter(Boolean)).size
  const groupNote = groups ? ` across ${groups} workspace${groups === 1 ? '' : 's'}` : ''
  return `${running.length} session${running.length === 1 ? '' : 's'} live${groupNote}: ${parts.join(', ')}. Say "tell claude ..." to prompt one, or "focus codex" to jump to it.`
}

export function buildTeam() {
  return [
    { ...agentById('claude'), command: 'claude', label: 'Builder', count: 1 },
    { ...agentById('codex'), command: 'codex', label: 'Reviewer', count: 1 },
    { ...agentById('gemini'), command: 'gemini', label: 'Scout', count: 1 }
  ].filter(a => a.id)
}

export function resolveDir(token, dirs, activeCwd) {
  const t = String(token || '').trim().replace(/^["']|["']$/g, '')
  if (!t) return activeCwd || null
  if (/[\\/:]/.test(t)) return t
  const lower = t.toLowerCase()
  const hit =
    dirs.find(d => pathLabel(d.cwd).toLowerCase() === lower) ||
    dirs.find(d => (d.label || '').toLowerCase() === lower)
  return hit ? hit.cwd : t
}

// Deterministic fallback intent parser (used when no AI provider is configured).
export function parseIntent(input, activeCwd, dirs = []) {
  const raw = input.trim()
  const text = raw.toLowerCase()

  if (/^(?:status|sitrep|report)\b/.test(text) ||
      /\b(?:what|who)(?:'s| is| are)?\s+(?:running|on|up|going|live|active|here)\b/.test(text) ||
      /\blist\s+(?:sessions|agents|swarm)\b/.test(text)) {
    return { type: 'status' }
  }

  const colon = raw.match(/^\s*([a-z][a-z ]*?)\s*:\s*(.+)$/i)
  if (colon) {
    const id = agentIdFromToken(colon[1])
    if (id) return { type: 'prompt', target: id, text: colon[2].trim() }
  }
  const verb = raw.match(/^\s*(?:tell|ask|prompt|send(?:\s+to)?|message|dm|have)\s+([a-z]+)\s+(.+)$/i)
  if (verb) {
    const id = agentIdFromToken(verb[1])
    if (id) {
      const text2 = verb[2].trim().replace(/^(?:to|that|:)\s+/i, '')
      if (text2) return { type: 'prompt', target: id, text: text2 }
    }
  }
  const bc = raw.match(/^\s*(?:broadcast|announce|tell everyone|tell all)\s+(.+)$/i)
  if (bc) return { type: 'prompt', target: 'all', text: bc[1].trim() }

  const focus = raw.match(/^\s*(?:focus(?:\s+on)?|switch to|switch|go to|jump to|show me)\s+([a-z]+)\s*$/i)
  if (focus) {
    const id = agentIdFromToken(focus[1])
    if (id) return { type: 'focus', target: id }
  }

  let cwd = activeCwd || null
  const inMatch = raw.match(/\b(?:in|into|at)\s+(.+)$/i)
  if (inMatch) cwd = resolveDir(inMatch[1], dirs, activeCwd)
  if (/\b(here|current|this dir|this directory|this folder)\b/.test(text)) cwd = activeCwd || cwd

  if (/\b(team|squad|crew)\b/.test(text)) {
    return { type: 'launch', cwd, groupLabel: `${pathLabel(cwd)} team`, agents: buildTeam() }
  }

  const agents = []
  for (const agent of AGENTS) {
    const names = SYNONYMS[agent.id] || [agent.id]
    let count = 0
    for (const name of names) {
      const before = raw.match(new RegExp(`(\\d+)\\s*(?:x|x)?\\s*${name}\\b`, 'i'))
      const after = raw.match(new RegExp(`\\b${name}\\s*(?:x|x)\\s*(\\d+)`, 'i'))
      if (before) count = Math.max(count, parseInt(before[1], 10) || 0)
      else if (after) count = Math.max(count, parseInt(after[1], 10) || 0)
      else if (new RegExp(`\\b${name}\\b`, 'i').test(raw)) count = Math.max(count, 1)
    }
    if (count > 0) agents.push({ ...agent, count })
  }
  if (agents.length) return { type: 'launch', cwd, agents }

  if (/\b(launch|swarm|new session|session|sessions|open launcher|launcher)\b/.test(text)) {
    return { type: 'open-launcher' }
  }
  return { type: 'run', input: raw }
}

export function summarize(agents) {
  return agents.map(a => `${a.count}x ${a.label}`).join(', ')
}
