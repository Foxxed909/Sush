// Agents and CLI tools that can be launched into a session. `command` is typed
// into the shell once it boots (null = a plain terminal). `mono` + `color`
// render the monogram badge.
//
// `resumeCommand` (optional) is used instead of `command` when a session is
// *restored* after an app restart, so the agent picks up its previous
// conversation in that directory rather than starting fresh. Only set it for
// CLIs that actually support resume; agents without it just re-launch fresh.
//
// Machine-specific tools no longer live here — add them as CUSTOM agents in
// Settings ▸ Agents (stored per user in localStorage, key 'sush-custom-agents').
export const BUILTIN_AGENTS = [
  { id: 'shell', label: 'Terminal', command: null, mono: '>_', color: '#8b9bb0', desc: 'Plain shell' },
  { id: 'claude', label: 'Claude Code', command: 'claude', resumeCommand: 'claude --continue', mono: 'C', color: '#d97757', desc: 'Anthropic CLI' },
  { id: 'codex', label: 'Codex', command: 'codex', resumeCommand: 'codex resume --last', mono: 'Cx', color: '#10a37f', desc: 'OpenAI CLI' },
  // Gemini has no verified resume flag yet — define one on a custom agent if
  // your build supports it.
  { id: 'gemini', label: 'Gemini', command: 'gemini', mono: 'G', color: '#4285f4', desc: 'Google CLI' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', mono: 'O', color: '#f59e0b', desc: 'OpenCode CLI' },
  { id: 'hermes', label: 'Hermes', command: 'hermes', mono: 'H', color: '#7c3aed', desc: 'Hermes agent CLI' },
  { id: 'aipex', label: 'AIPEX', command: 'aipex', mono: 'Ax', color: '#22c55e', desc: 'Rooms CLI agent' },
  { id: 'trident', label: 'Trident', command: 'trident', mono: 'T', color: '#38bdf8', desc: 'Agentic coding CLI' },
  { id: 'bedrock', label: 'Bedrock', command: 'bedrock', mono: 'B', color: '#a3e635', desc: 'Grounded AI workspace' },
  { id: 'razor', label: 'Razor', command: 'razor', mono: 'Rz', color: '#ef4444', desc: 'Coding CLI' },
  { id: 'serenity', label: 'Serenity', command: 'serenity', mono: 'S', color: '#14b8a6', desc: 'Calm AI workspace' },
  { id: 'sydney', label: 'Sydney', command: 'sydney', mono: 'Sy', color: '#60a5fa', desc: 'AI companion CLI' },
  { id: 'erosion', label: 'Erosion', command: 'erosion help', mono: 'Er', color: '#84cc16', desc: 'Cache cleaner tool' },
  { id: 'evm', label: 'EVM', command: 'evm help', mono: 'Ev', color: '#eab308', desc: 'Environment monitor' }
]

const CUSTOM_KEY = 'sush-custom-agents'

// Read inside functions only — module-scope localStorage reads would beat the
// per-user storage shim installed in main.jsx.
export function loadCustomAgents() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved
      .filter(a => a && a.id && a.label && a.command)
      .slice(0, 12)
      .map(a => ({
        id: String(a.id),
        label: String(a.label).slice(0, 24),
        command: String(a.command).slice(0, 200),
        resumeCommand: a.resumeCommand ? String(a.resumeCommand).slice(0, 200) : undefined,
        mono: String(a.mono || a.label[0] || '?').slice(0, 2),
        color: /^#[0-9a-fA-F]{3,8}$/.test(a.color || '') ? a.color : '#8b9bb0',
        desc: String(a.desc || 'Custom agent').slice(0, 40),
        custom: true
      }))
  } catch {
    return []
  }
}

export function saveCustomAgents(list) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list.slice(0, 12))) } catch {}
}

export function addCustomAgent({ label, command, resumeCommand, color }) {
  const name = String(label ?? '').trim()
  const cmd = String(command ?? '').trim()
  if (!name || !cmd) return { ok: false, error: 'Name and command are required' }
  const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)
  if (allAgents().some(a => a.id === id)) return { ok: false, error: 'An agent with that name already exists' }
  const next = [...loadCustomAgents(), { id, label: name, command: cmd, resumeCommand: String(resumeCommand ?? '').trim() || undefined, mono: name[0].toUpperCase(), color: color || '#8b9bb0', desc: 'Custom agent', custom: true }]
  saveCustomAgents(next)
  return { ok: true, id }
}

export function removeCustomAgent(id) {
  saveCustomAgents(loadCustomAgents().filter(a => a.id !== id))
}

// Built-ins + the user's custom agents. The launcher, Seducia's catalog, and
// the CLI-availability probe all go through this so custom agents are
// first-class everywhere.
export function allAgents() {
  return [...BUILTIN_AGENTS, ...loadCustomAgents()]
}

// Back-compat alias for modules that only need the static built-in list
// (e.g. the AI system prompt's id catalog, built at module scope).
export const AGENTS = BUILTIN_AGENTS

// Mirrors BridgeSpace: spin up one agent or a whole swarm, capped so the
// terminal grid stays manageable.
export const MAX_SESSIONS = 16

export const agentById = (id) => allAgents().find(a => a.id === id) || null
